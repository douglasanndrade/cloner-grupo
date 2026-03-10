"""
Core clone engine — iterates messages from source and clones to destination.
Supports forward and download+reupload modes with album preservation.
Auto-reconnects on session drops (up to 3 retries).
"""
import asyncio
import os
import time
import logging
from datetime import datetime, timezone
from collections import defaultdict
from functools import partial

from telethon import TelegramClient
from telethon.tl.types import (
    MessageMediaPhoto,
    MessageMediaDocument,
    MessageMediaWebPage,
    MessageMediaContact,
    MessageMediaGeo,
    MessageMediaPoll,
    DocumentAttributeFilename,
    DocumentAttributeAudio,
    DocumentAttributeVideo,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.job import CloneJob
from app.models.job_item import CloneJobItem
from app.models.entity import TelegramEntity
from app.services.log_service import log
from app.core.config import settings

logger = logging.getLogger("cloner.engine")

# 2 GB limit for regular accounts, 4 GB for premium
REGULAR_SIZE_LIMIT = 2 * 1024 * 1024 * 1024
PREMIUM_SIZE_LIMIT = 4 * 1024 * 1024 * 1024

# Connection keywords that indicate a session/network issue (for auto-reconnect)
_DISCONNECT_KEYWORDS = [
    "disconnect", "connection", "session", "authkey", "eof",
    "broken pipe", "reset by peer", "timed out", "timeout",
    "network", "unreachable", "connectionerror",
]


def _is_connection_error(e: Exception) -> bool:
    """Check if an exception is a connection/session error."""
    if isinstance(e, (ConnectionError, OSError, asyncio.TimeoutError)):
        return True
    msg = str(e).lower()
    return any(kw in msg for kw in _DISCONNECT_KEYWORDS)


def _get_media_type(message) -> str | None:
    """Extract media type string from a Telethon message."""
    media = message.media
    if media is None:
        return None
    if isinstance(media, MessageMediaPhoto):
        return "photo"
    if isinstance(media, MessageMediaDocument):
        doc = media.document
        if doc is None:
            return "document"
        for attr in doc.attributes:
            if isinstance(attr, DocumentAttributeVideo):
                if attr.round_message:
                    return "video_note"
                return "video"
            if isinstance(attr, DocumentAttributeAudio):
                if attr.voice:
                    return "voice"
                return "audio"
        # Check mime type
        mime = getattr(doc, "mime_type", "") or ""
        if mime.startswith("image/"):
            return "sticker" if "webp" in mime or "tgs" in mime else "photo"
        return "document"
    if isinstance(media, MessageMediaWebPage):
        return "webpage"
    if isinstance(media, MessageMediaContact):
        return "contact"
    if isinstance(media, MessageMediaGeo):
        return "geo"
    if isinstance(media, MessageMediaPoll):
        return "poll"
    return "other"


def _get_media_size(message) -> int | None:
    """Get file size in bytes from media."""
    media = message.media
    if isinstance(media, MessageMediaPhoto):
        # Photo sizes vary, estimate from largest size
        if media.photo and media.photo.sizes:
            for size in reversed(media.photo.sizes):
                if hasattr(size, "size"):
                    return size.size
        return None
    if isinstance(media, MessageMediaDocument):
        doc = media.document
        if doc:
            return doc.size
    return None


class CloneEngine:
    """Runs a single clone job with auto-reconnect."""

    MAX_RECONNECT_ATTEMPTS = 3
    RECONNECT_DELAY = 10  # seconds between reconnect attempts

    def __init__(self, job_id: int, db_factory):
        self.job_id = job_id
        self.db_factory = db_factory  # async_session factory
        self._cancelled = False
        self._paused = False
        self._client = None
        self._account_phone = None

    def request_cancel(self):
        self._cancelled = True

    def request_pause(self):
        self._paused = True

    def request_resume(self):
        self._paused = False

    async def _reconnect(self, db) -> TelegramClient | None:
        """Try to reconnect the Telegram client up to MAX_RECONNECT_ATTEMPTS times."""
        from app.telegram.client_manager import ensure_connected

        for attempt in range(1, self.MAX_RECONNECT_ATTEMPTS + 1):
            await log(db, "warning",
                f"Tentativa de reconexão {attempt}/{self.MAX_RECONNECT_ATTEMPTS}...",
                job_id=self.job_id
            )
            await asyncio.sleep(self.RECONNECT_DELAY)
            try:
                client = await ensure_connected(self._account_phone)
                me = await client.get_me()
                await log(db, "success",
                    f"Reconectado com sucesso como {me.first_name}!",
                    job_id=self.job_id
                )
                self._client = client
                return client
            except Exception as e:
                await log(db, "warning",
                    f"Reconexão {attempt} falhou: {str(e)}",
                    job_id=self.job_id
                )
        return None

    async def _resolve_peer(self, client, telegram_id: int):
        """Resolve entity tentando com e sem prefixo -100."""
        attempts = [telegram_id]
        if telegram_id > 0:
            attempts.append(int(f"-100{telegram_id}"))
        elif str(telegram_id).startswith("-100"):
            attempts.append(int(str(telegram_id).replace("-100", "", 1)))

        for attempt in attempts:
            try:
                return await client.get_entity(attempt)
            except Exception:
                continue
        raise ValueError(f"Não foi possível resolver a entidade (ID: {telegram_id})")

    async def run(self):
        """Main entry point — runs the clone job to completion."""
        async with self.db_factory() as db:
            job = await db.get(CloneJob, self.job_id)
            if not job:
                return

            # Prevent duplicate starts — only start if pending
            if job.status not in ("pending", "running"):
                logger.warning(f"Job {self.job_id} status is {job.status}, skipping")
                return

            await log(db, "info", "Iniciando job de clonagem...", job_id=self.job_id)

            try:
                # Update status
                job.status = "running"
                if not job.started_at:
                    job.started_at = datetime.now(timezone.utc)
                await db.commit()

                # Get entities
                source_entity = await db.get(TelegramEntity, job.source_entity_id)
                dest_entity = await db.get(TelegramEntity, job.destination_entity_id)

                if not source_entity or not dest_entity:
                    raise ValueError("Entidade de origem ou destino não encontrada")

                # Get telegram client
                from app.telegram.client_manager import ensure_connected
                self._account_phone = job.account_phone
                client = await ensure_connected(job.account_phone)
                self._client = client

                # Check if account is premium
                me = await client.get_me()
                is_premium = getattr(me, "premium", False)
                size_limit = PREMIUM_SIZE_LIMIT if is_premium else REGULAR_SIZE_LIMIT

                await log(db, "info",
                    f"Conectado como {me.first_name} ({'Premium' if is_premium else 'Regular'}) | "
                    f"Limite de arquivo: {size_limit // (1024**3)}GB",
                    job_id=self.job_id
                )

                # Get source and dest entities via Telethon
                source_peer = await self._resolve_peer(client, source_entity.telegram_id)
                dest_peer = await self._resolve_peer(client, dest_entity.telegram_id)

                await log(db, "info",
                    f"Origem: {source_entity.title} | Destino: {dest_entity.title} | Modo: {job.mode}",
                    job_id=self.job_id
                )

                # Count and iterate messages
                if job.mode == "forward":
                    await self._run_forward(client, job, source_peer, dest_peer, size_limit, db)
                else:
                    await self._run_reupload(client, job, source_peer, dest_peer, size_limit, db)

                # Finalize
                await db.refresh(job)
                if job.status == "running":
                    job.status = "completed"
                    job.finished_at = datetime.now(timezone.utc)
                    await db.commit()
                    await log(db, "success",
                        f"Job concluído! {job.processed_count} processados, "
                        f"{job.error_count} erros, {job.skipped_count} pulados",
                        job_id=self.job_id
                    )

            except Exception as e:
                if _is_connection_error(e):
                    # Try auto-reconnect before giving up
                    await log(db, "warning",
                        f"Conexão perdida: {str(e)}. Tentando reconectar...",
                        job_id=self.job_id
                    )
                    client = await self._reconnect(db)
                    if client:
                        # Reconnected — set back to pending so worker restarts the job
                        await db.refresh(job)
                        job.status = "pending"
                        await db.commit()
                        await log(db, "info",
                            "Reconectado! Job será retomado automaticamente.",
                            job_id=self.job_id
                        )
                    else:
                        await db.refresh(job)
                        job.status = "paused"
                        await db.commit()
                        await log(db, "warning",
                            f"Não foi possível reconectar após {self.MAX_RECONNECT_ATTEMPTS} tentativas. "
                            f"Job pausado — reconecte a conta e retome manualmente.",
                            job_id=self.job_id
                        )
                else:
                    await db.refresh(job)
                    job.status = "failed"
                    job.finished_at = datetime.now(timezone.utc)
                    await db.commit()
                    await log(db, "error", f"Job falhou: {str(e)}", job_id=self.job_id)

    async def _check_state(self, job, db) -> bool:
        """Check if job should continue. Returns False if cancelled."""
        if self._cancelled:
            await db.refresh(job)
            job.status = "cancelled"
            job.finished_at = datetime.now(timezone.utc)
            await db.commit()
            await log(db, "warning", "Job cancelado pelo usuário", job_id=self.job_id)
            return False

        while self._paused:
            await db.refresh(job)
            if job.status != "paused":
                job.status = "paused"
                await db.commit()
                await log(db, "info", "Job pausado", job_id=self.job_id)
            await asyncio.sleep(2)
            # Re-check from DB in case status changed externally
            await db.refresh(job)
            if job.status == "cancelled":
                self._cancelled = True
                return False
            if job.status == "running":
                self._paused = False
                await log(db, "info", "Job retomado", job_id=self.job_id)

        # Also check DB status (external pause/cancel)
        await db.refresh(job)
        if job.status == "paused":
            self._paused = True
            return await self._check_state(job, db)
        if job.status == "cancelled":
            self._cancelled = True
            return False

        return True

    async def _log_progress_bg(self, level: str, message: str):
        """Fire-and-forget log using a SEPARATE db session (safe for callbacks)."""
        try:
            async with self.db_factory() as db2:
                await log(db2, level, message, job_id=self.job_id)
        except Exception:
            logger.warning(f"Failed to log progress: {message}")

    async def _collect_messages(self, client, source_peer, job, db):
        """Collect all messages from source, respecting date filters and resume point."""
        await log(db, "info", "Coletando mensagens da origem...", job_id=self.job_id)

        messages = []
        kwargs = {}
        if job.date_from:
            kwargs["offset_date"] = job.date_from
        if job.last_message_id:
            kwargs["min_id"] = job.last_message_id

        count = 0
        async for msg in client.iter_messages(source_peer, reverse=True, **kwargs):
            if job.date_to and msg.date and msg.date > job.date_to:
                break
            if msg.action:  # Skip service messages
                continue
            messages.append(msg)
            count += 1
            # Log progress every 500 messages during collection
            if count % 500 == 0:
                await log(db, "info", f"Coletando... {count} mensagens até agora", job_id=self.job_id)

        await log(db, "info", f"{len(messages)} mensagens encontradas para processar", job_id=self.job_id)

        # Update job total
        await db.refresh(job)
        job.total_messages = len(messages)
        await db.commit()

        return messages

    async def _save_item(self, db, job, msg, status, error_msg=None, dest_msg_id=None):
        """Save or update a job item."""
        # Check if item already exists
        result = await db.execute(
            select(CloneJobItem).where(
                CloneJobItem.job_id == job.id,
                CloneJobItem.source_message_id == msg.id,
            )
        )
        item = result.scalar_one_or_none()

        now = datetime.now(timezone.utc)
        media_type = _get_media_type(msg)
        media_size = _get_media_size(msg)

        if item:
            item.status = status
            item.error_message = error_msg
            item.destination_message_id = dest_msg_id
            item.processed_at = now
        else:
            item = CloneJobItem(
                job_id=job.id,
                source_message_id=msg.id,
                grouped_id=str(msg.grouped_id) if msg.grouped_id else None,
                media_type=media_type,
                media_size=media_size,
                status=status,
                error_message=error_msg,
                destination_message_id=dest_msg_id,
                processed_at=now if status != "pending" else None,
            )
            db.add(item)

        await db.commit()
        return item

    async def _update_progress(self, db, job, status: str):
        """Update job counters."""
        await db.refresh(job)
        if status == "success":
            job.processed_count += 1
        elif status == "error":
            job.error_count += 1
        elif status == "skipped":
            job.skipped_count += 1
        elif status == "incompatible":
            job.incompatible_count += 1
        await db.commit()

    # ========================
    # FORWARD MODE
    # ========================

    async def _run_forward(self, client, job, source_peer, dest_peer, size_limit, db):
        """Forward messages in order, grouping albums."""
        messages = await self._collect_messages(client, source_peer, job, db)
        if not messages:
            await log(db, "warning", "Nenhuma mensagem encontrada para processar", job_id=self.job_id)
            return

        await log(db, "info",
            f"Iniciando encaminhamento de {len(messages)} mensagens...",
            job_id=self.job_id
        )

        i = 0
        while i < len(messages):
            if not await self._check_state(job, db):
                return

            msg = messages[i]

            try:
                # Collect album group
                if msg.grouped_id:
                    album = [msg]
                    while i + 1 < len(messages) and messages[i + 1].grouped_id == msg.grouped_id:
                        i += 1
                        album.append(messages[i])

                    await self._forward_album(client, job, album, dest_peer, db)
                else:
                    await self._forward_single(client, job, msg, dest_peer, db)

            except Exception as e:
                if _is_connection_error(e):
                    await log(db, "warning",
                        f"Conexão perdida durante msg {msg.id}: {str(e)}. Reconectando...",
                        job_id=self.job_id
                    )
                    new_client = await self._reconnect(db)
                    if new_client:
                        client = new_client
                        dest_entity = await db.get(TelegramEntity, job.destination_entity_id)
                        dest_peer = await self._resolve_peer(client, dest_entity.telegram_id)
                        continue  # Retry current message
                    else:
                        raise
                else:
                    raise

            # Update last_message_id for resume
            await db.refresh(job)
            job.last_message_id = msg.id
            await db.commit()

            # Interval between sends
            await asyncio.sleep(job.send_interval_ms / 1000)
            i += 1

    async def _forward_single(self, client, job, msg, dest_peer, db):
        """Forward a single message."""
        progress = job.processed_count + job.error_count + job.skipped_count + job.incompatible_count + 1
        media_type = _get_media_type(msg)
        await log(db, "info",
            f"[{progress}/{job.total_messages}] Encaminhando msg {msg.id} ({media_type or 'texto'})...",
            job_id=self.job_id
        )
        try:
            result = await client.forward_messages(dest_peer, msg)
            dest_id = result.id if result else None
            await self._save_item(db, job, msg, "success", dest_msg_id=dest_id)
            await self._update_progress(db, job, "success")
        except Exception as e:
            error_str = str(e)
            await self._save_item(db, job, msg, "error", error_msg=error_str)
            await self._update_progress(db, job, "error")
            await log(db, "error", f"Erro ao encaminhar msg {msg.id}: {error_str}", job_id=self.job_id)

    async def _forward_album(self, client, job, album, dest_peer, db):
        """Forward an album (grouped messages)."""
        try:
            results = await client.forward_messages(dest_peer, album)
            for msg_item, result in zip(album, results if isinstance(results, list) else [results]):
                dest_id = result.id if result else None
                await self._save_item(db, job, msg_item, "success", dest_msg_id=dest_id)
                await self._update_progress(db, job, "success")
        except Exception as e:
            error_str = str(e)
            for msg_item in album:
                await self._save_item(db, job, msg_item, "error", error_msg=error_str)
                await self._update_progress(db, job, "error")
            await log(db, "error",
                f"Erro ao encaminhar álbum ({len(album)} itens, msg {album[0].id}): {error_str}",
                job_id=self.job_id
            )

    # ========================
    # REUPLOAD MODE
    # ========================

    async def _run_reupload(self, client, job, source_peer, dest_peer, size_limit, db):
        """Download and re-upload messages, preserving albums."""
        messages = await self._collect_messages(client, source_peer, job, db)
        if not messages:
            await log(db, "warning", "Nenhuma mensagem encontrada para processar", job_id=self.job_id)
            return

        temp_dir = os.path.join(settings.temp_dir, f"job_{job.id}")
        os.makedirs(temp_dir, exist_ok=True)

        await log(db, "info",
            f"Iniciando processamento de {len(messages)} mensagens...",
            job_id=self.job_id
        )

        try:
            i = 0
            while i < len(messages):
                if not await self._check_state(job, db):
                    return

                msg = messages[i]

                try:
                    # Collect album group
                    if msg.grouped_id:
                        album = [msg]
                        while i + 1 < len(messages) and messages[i + 1].grouped_id == msg.grouped_id:
                            i += 1
                            album.append(messages[i])

                        await self._reupload_album(client, job, album, dest_peer, size_limit, temp_dir, db)
                    else:
                        await self._reupload_single(client, job, msg, dest_peer, size_limit, temp_dir, db)

                except Exception as e:
                    if _is_connection_error(e):
                        # Try auto-reconnect
                        await log(db, "warning",
                            f"Conexão perdida durante msg {msg.id}: {str(e)}. Reconectando...",
                            job_id=self.job_id
                        )
                        new_client = await self._reconnect(db)
                        if new_client:
                            client = new_client
                            # Re-resolve peers after reconnect
                            source_entity = await db.get(TelegramEntity, job.source_entity_id)
                            dest_entity = await db.get(TelegramEntity, job.destination_entity_id)
                            dest_peer = await self._resolve_peer(client, dest_entity.telegram_id)
                            # Retry current message — don't increment i
                            continue
                        else:
                            raise  # Give up, let outer handler pause
                    else:
                        raise

                # Update last_message_id for resume
                await db.refresh(job)
                job.last_message_id = msg.id
                await db.commit()

                # Interval between sends
                await asyncio.sleep(job.send_interval_ms / 1000)
                i += 1
        finally:
            # Clean up temp files
            self._cleanup_temp(temp_dir)

    async def _reupload_single(self, client, job, msg, dest_peer, size_limit, temp_dir, db):
        """Download and re-upload a single message."""
        media_type = _get_media_type(msg)
        media_size = _get_media_size(msg)

        progress = job.processed_count + job.error_count + job.skipped_count + job.incompatible_count + 1

        # Text-only message
        if not msg.media or isinstance(msg.media, (MessageMediaWebPage, MessageMediaContact, MessageMediaGeo, MessageMediaPoll)):
            if msg.text:
                try:
                    await log(db, "info",
                        f"[{progress}/{job.total_messages}] Enviando texto msg {msg.id}...",
                        job_id=self.job_id
                    )
                    result = await client.send_message(dest_peer, msg.text)
                    await self._save_item(db, job, msg, "success", dest_msg_id=result.id)
                    await self._update_progress(db, job, "success")
                    await log(db, "success",
                        f"[{progress}/{job.total_messages}] Texto msg {msg.id} enviado",
                        job_id=self.job_id
                    )
                except Exception as e:
                    if _is_connection_error(e):
                        raise
                    await self._save_item(db, job, msg, "error", error_msg=str(e))
                    await self._update_progress(db, job, "error")
                    await log(db, "error",
                        f"[{progress}/{job.total_messages}] Erro ao enviar texto msg {msg.id}: {str(e)}",
                        job_id=self.job_id
                    )
            else:
                # Unsupported media type for reupload (polls, contacts, etc.)
                await self._save_item(db, job, msg, "incompatible",
                    error_msg=f"Tipo {media_type} não suportado para reupload")
                await self._update_progress(db, job, "incompatible")
                await log(db, "warning",
                    f"[{progress}/{job.total_messages}] Msg {msg.id} incompatível ({media_type})",
                    job_id=self.job_id
                )
            return

        # Check size limit
        if media_size and media_size > size_limit:
            if job.oversized_policy == "skip":
                await self._save_item(db, job, msg, "skipped",
                    error_msg=f"Arquivo excede limite ({media_size // (1024**2)}MB)")
                await self._update_progress(db, job, "skipped")
                await log(db, "warning",
                    f"Msg {msg.id} pulada: {media_size // (1024**2)}MB excede limite",
                    job_id=self.job_id
                )
                return
            elif job.oversized_policy == "forward_instead":
                await self._forward_single(client, job, msg, dest_peer, db)
                return
            else:  # fail
                raise ValueError(f"Arquivo de {media_size // (1024**2)}MB excede o limite")

        # Download
        try:
            size_str = f" ({media_size // (1024*1024)}MB)" if media_size and media_size > 1024*1024 else ""
            size_mb = (media_size or 0) // (1024 * 1024)
            await log(db, "info",
                f"[{progress}/{job.total_messages}] ⬇ Baixando msg {msg.id} ({media_type or 'texto'}){size_str}...",
                job_id=self.job_id
            )
            file_path = os.path.join(temp_dir, f"msg_{msg.id}")

            total_size = media_size or 0

            # Progress callback for large files (>10MB) — uses separate db session
            dl_last_log = [time.time()]
            engine_ref = self  # capture for closure

            def dl_progress(received, total):
                now = time.time()
                if now - dl_last_log[0] >= 5:
                    dl_last_log[0] = now
                    pct = int((received / total) * 100) if total else 0
                    mb_done = received // (1024 * 1024)
                    mb_total = total // (1024 * 1024) if total else 0
                    asyncio.get_event_loop().create_task(
                        engine_ref._log_progress_bg("info",
                            f"[{progress}/{job.total_messages}] ⬇ Download msg {msg.id}: {mb_done}MB/{mb_total}MB ({pct}%)")
                    )

            # For large files (>50MB), use download_file with larger part_size
            if size_mb > 50 and hasattr(msg.media, 'document') and msg.media.document:
                doc = msg.media.document
                # Build file path with extension from attributes
                dl_path = file_path
                for attr in doc.attributes:
                    if isinstance(attr, DocumentAttributeFilename):
                        dl_path = file_path + "_" + attr.file_name
                        break

                await client.download_file(
                    doc,
                    dl_path,
                    part_size_kb=512,
                    progress_callback=dl_progress,
                )
                downloaded = dl_path
            else:
                downloaded = await client.download_media(
                    msg, file=file_path,
                    progress_callback=dl_progress if total_size > 10 * 1024 * 1024 else None,
                )

            if not downloaded or (isinstance(downloaded, str) and not os.path.exists(downloaded)):
                await self._save_item(db, job, msg, "error", error_msg="Download falhou - arquivo vazio")
                await self._update_progress(db, job, "error")
                await log(db, "error", f"[{progress}/{job.total_messages}] Download msg {msg.id} retornou vazio", job_id=self.job_id)
                return

            dl_size_mb = os.path.getsize(downloaded) // (1024 * 1024) if os.path.exists(downloaded) else 0
            await log(db, "info",
                f"[{progress}/{job.total_messages}] ⬇ Download msg {msg.id} concluído ({dl_size_mb}MB)",
                job_id=self.job_id
            )
        except Exception as e:
            if _is_connection_error(e):
                raise  # Let the outer handler deal with reconnection
            await self._save_item(db, job, msg, "error", error_msg=f"Erro no download: {str(e)}")
            await self._update_progress(db, job, "error")
            await log(db, "error", f"[{progress}/{job.total_messages}] Erro ao baixar msg {msg.id}: {str(e)}", job_id=self.job_id)
            return

        # Upload
        try:
            file_size_mb = os.path.getsize(downloaded) // (1024 * 1024) if os.path.exists(downloaded) else 0
            await log(db, "info",
                f"[{progress}/{job.total_messages}] ⬆ Enviando msg {msg.id} ({file_size_mb}MB) para o destino...",
                job_id=self.job_id
            )
            caption = msg.text or ""

            # Progress callback for upload — uses separate db session
            ul_last_log = [time.time()]

            def ul_progress(sent, total):
                now = time.time()
                if now - ul_last_log[0] >= 5:
                    ul_last_log[0] = now
                    pct = int((sent / total) * 100) if total else 0
                    mb_done = sent // (1024 * 1024)
                    mb_total = total // (1024 * 1024) if total else 0
                    asyncio.get_event_loop().create_task(
                        engine_ref._log_progress_bg("info",
                            f"[{progress}/{job.total_messages}] ⬆ Upload msg {msg.id}: {mb_done}MB/{mb_total}MB ({pct}%)")
                    )

            # For large files (>50MB), pre-upload with larger part size for speed
            if file_size_mb > 50:
                uploaded = await client.upload_file(
                    downloaded,
                    part_size_kb=512,
                    progress_callback=ul_progress,
                )
                result = await client.send_file(
                    dest_peer,
                    uploaded,
                    caption=caption,
                    force_document=media_type == "document",
                )
            else:
                result = await client.send_file(
                    dest_peer,
                    downloaded,
                    caption=caption,
                    force_document=media_type == "document",
                    progress_callback=ul_progress if file_size_mb > 10 else None,
                )
            await self._save_item(db, job, msg, "success", dest_msg_id=result.id)
            await self._update_progress(db, job, "success")
            await log(db, "success",
                f"[{progress}/{job.total_messages}] Msg {msg.id} enviada com sucesso!",
                job_id=self.job_id
            )
        except Exception as e:
            if _is_connection_error(e):
                raise  # Let outer handler reconnect
            await self._save_item(db, job, msg, "error", error_msg=f"Erro no upload: {str(e)}")
            await self._update_progress(db, job, "error")
            await log(db, "error", f"[{progress}/{job.total_messages}] Erro ao enviar msg {msg.id}: {str(e)}", job_id=self.job_id)
        finally:
            # Remove temp file
            if downloaded and os.path.exists(downloaded):
                try:
                    os.remove(downloaded)
                except OSError:
                    pass

    async def _reupload_album(self, client, job, album, dest_peer, size_limit, temp_dir, db):
        """Download and re-upload an album as a group."""
        progress = job.processed_count + job.error_count + job.skipped_count + job.incompatible_count + 1
        await log(db, "info",
            f"[{progress}/{job.total_messages}] Processando álbum ({len(album)} itens, msg {album[0].id}-{album[-1].id})...",
            job_id=self.job_id
        )

        files = []
        captions = []
        skipped_msgs = []

        for msg in album:
            media_size = _get_media_size(msg)

            # Check size
            if media_size and media_size > size_limit:
                if job.oversized_policy == "skip":
                    await self._save_item(db, job, msg, "skipped",
                        error_msg=f"Arquivo excede limite ({media_size // (1024**2)}MB)")
                    await self._update_progress(db, job, "skipped")
                    skipped_msgs.append(msg)
                    continue
                elif job.oversized_policy == "fail":
                    raise ValueError(f"Arquivo de {media_size // (1024**2)}MB excede o limite")

            # Download
            try:
                file_path = os.path.join(temp_dir, f"msg_{msg.id}")
                downloaded = await client.download_media(msg, file=file_path)
                if downloaded:
                    files.append(downloaded)
                    captions.append(msg.text or "")
                else:
                    await self._save_item(db, job, msg, "error", error_msg="Download falhou")
                    await self._update_progress(db, job, "error")
                    skipped_msgs.append(msg)
            except Exception as e:
                if _is_connection_error(e):
                    raise  # Let outer handler reconnect
                await self._save_item(db, job, msg, "error", error_msg=f"Erro no download: {str(e)}")
                await self._update_progress(db, job, "error")
                skipped_msgs.append(msg)

        if not files:
            return

        # Send as album
        try:
            await log(db, "info",
                f"[{progress}/{job.total_messages}] ⬆ Enviando álbum ({len(files)} arquivos) para o destino...",
                job_id=self.job_id
            )
            # Only first caption is shown in album
            results = await client.send_file(
                dest_peer,
                files,
                caption=captions[0] if captions else "",
            )

            # Match results to original messages
            success_msgs = [m for m in album if m not in skipped_msgs]
            if not isinstance(results, list):
                results = [results]

            for msg_item, result in zip(success_msgs, results):
                dest_id = result.id if result else None
                await self._save_item(db, job, msg_item, "success", dest_msg_id=dest_id)
                await self._update_progress(db, job, "success")

            # Handle leftover if results < msgs
            for msg_item in success_msgs[len(results):]:
                await self._save_item(db, job, msg_item, "success")
                await self._update_progress(db, job, "success")

            await log(db, "success",
                f"[{progress}/{job.total_messages}] Álbum ({len(files)} itens) enviado com sucesso!",
                job_id=self.job_id
            )

        except Exception as e:
            if _is_connection_error(e):
                raise  # Let outer handler reconnect
            error_str = str(e)
            for msg_item in album:
                if msg_item not in skipped_msgs:
                    await self._save_item(db, job, msg_item, "error", error_msg=f"Erro no upload do álbum: {error_str}")
                    await self._update_progress(db, job, "error")
            await log(db, "error",
                f"[{progress}/{job.total_messages}] Erro ao enviar álbum ({len(album)} itens): {error_str}",
                job_id=self.job_id
            )
        finally:
            # Clean up temp files
            for f in files:
                if os.path.exists(f):
                    try:
                        os.remove(f)
                    except OSError:
                        pass

    def _cleanup_temp(self, temp_dir: str):
        """Remove temp directory."""
        try:
            import shutil
            if os.path.exists(temp_dir):
                shutil.rmtree(temp_dir, ignore_errors=True)
        except Exception:
            pass
