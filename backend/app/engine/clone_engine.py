"""
Core clone engine — iterates messages from source and clones to destination.
Supports forward and download+reupload modes with album preservation.
"""
import asyncio
import os
import time
from datetime import datetime, timezone
from collections import defaultdict

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

# 2 GB limit for regular accounts, 4 GB for premium
REGULAR_SIZE_LIMIT = 2 * 1024 * 1024 * 1024
PREMIUM_SIZE_LIMIT = 4 * 1024 * 1024 * 1024


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
    """Runs a single clone job."""

    def __init__(self, job_id: int, db_factory):
        self.job_id = job_id
        self.db_factory = db_factory  # async_session factory
        self._cancelled = False
        self._paused = False

    def request_cancel(self):
        self._cancelled = True

    def request_pause(self):
        self._paused = True

    def request_resume(self):
        self._paused = False

    async def run(self):
        """Main entry point — runs the clone job to completion."""
        async with self.db_factory() as db:
            job = await db.get(CloneJob, self.job_id)
            if not job:
                return

            await log(db, "info", "Iniciando job de clonagem...", job_id=self.job_id)

            try:
                # Update status
                job.status = "running"
                job.started_at = datetime.now(timezone.utc)
                await db.commit()

                # Get entities
                source_entity = await db.get(TelegramEntity, job.source_entity_id)
                dest_entity = await db.get(TelegramEntity, job.destination_entity_id)

                if not source_entity or not dest_entity:
                    raise ValueError("Entidade de origem ou destino não encontrada")

                # Get telegram client
                from app.telegram.client_manager import ensure_connected
                client = await ensure_connected(job.account_phone)

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
                source_peer = await client.get_entity(source_entity.telegram_id)
                dest_peer = await client.get_entity(dest_entity.telegram_id)

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

    async def _collect_messages(self, client, source_peer, job, db):
        """Collect all messages from source, respecting date filters and resume point."""
        await log(db, "info", "Coletando mensagens da origem...", job_id=self.job_id)

        messages = []
        kwargs = {}
        if job.date_from:
            kwargs["offset_date"] = job.date_from
        if job.last_message_id:
            kwargs["min_id"] = job.last_message_id

        async for msg in client.iter_messages(source_peer, reverse=True, **kwargs):
            if job.date_to and msg.date and msg.date > job.date_to:
                break
            if msg.action:  # Skip service messages
                continue
            messages.append(msg)

        await log(db, "info", f"{len(messages)} mensagens encontradas", job_id=self.job_id)

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
            return

        # Group by grouped_id for album handling
        i = 0
        while i < len(messages):
            if not await self._check_state(job, db):
                return

            msg = messages[i]

            # Collect album group
            if msg.grouped_id:
                album = [msg]
                while i + 1 < len(messages) and messages[i + 1].grouped_id == msg.grouped_id:
                    i += 1
                    album.append(messages[i])

                await self._forward_album(client, job, album, dest_peer, db)
            else:
                await self._forward_single(client, job, msg, dest_peer, db)

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
            return

        temp_dir = os.path.join(settings.temp_dir, f"job_{job.id}")
        os.makedirs(temp_dir, exist_ok=True)

        try:
            i = 0
            while i < len(messages):
                if not await self._check_state(job, db):
                    return

                msg = messages[i]

                # Collect album group
                if msg.grouped_id:
                    album = [msg]
                    while i + 1 < len(messages) and messages[i + 1].grouped_id == msg.grouped_id:
                        i += 1
                        album.append(messages[i])

                    await self._reupload_album(client, job, album, dest_peer, size_limit, temp_dir, db)
                else:
                    await self._reupload_single(client, job, msg, dest_peer, size_limit, temp_dir, db)

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

        # Text-only message
        if not msg.media or isinstance(msg.media, (MessageMediaWebPage, MessageMediaContact, MessageMediaGeo, MessageMediaPoll)):
            if msg.text:
                try:
                    result = await client.send_message(dest_peer, msg.text)
                    await self._save_item(db, job, msg, "success", dest_msg_id=result.id)
                    await self._update_progress(db, job, "success")
                except Exception as e:
                    await self._save_item(db, job, msg, "error", error_msg=str(e))
                    await self._update_progress(db, job, "error")
            else:
                # Unsupported media type for reupload (polls, contacts, etc.)
                await self._save_item(db, job, msg, "incompatible",
                    error_msg=f"Tipo {media_type} não suportado para reupload")
                await self._update_progress(db, job, "incompatible")
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
            progress = job.processed_count + job.error_count + job.skipped_count + job.incompatible_count + 1
            size_str = f" ({media_size // (1024*1024)}MB)" if media_size and media_size > 1024*1024 else ""
            await log(db, "info",
                f"[{progress}/{job.total_messages}] Baixando msg {msg.id} ({media_type or 'texto'}){size_str}...",
                job_id=self.job_id
            )
            file_path = os.path.join(temp_dir, f"msg_{msg.id}")
            downloaded = await client.download_media(msg, file=file_path)
            if not downloaded:
                await self._save_item(db, job, msg, "error", error_msg="Download falhou - arquivo vazio")
                await self._update_progress(db, job, "error")
                return
        except Exception as e:
            await self._save_item(db, job, msg, "error", error_msg=f"Erro no download: {str(e)}")
            await self._update_progress(db, job, "error")
            await log(db, "error", f"Erro ao baixar msg {msg.id}: {str(e)}", job_id=self.job_id)
            return

        # Upload
        try:
            await log(db, "info",
                f"[{progress}/{job.total_messages}] Enviando msg {msg.id} para o destino...",
                job_id=self.job_id
            )
            caption = msg.text or ""
            result = await client.send_file(
                dest_peer,
                downloaded,
                caption=caption,
                force_document=media_type == "document",
            )
            await self._save_item(db, job, msg, "success", dest_msg_id=result.id)
            await self._update_progress(db, job, "success")
            await log(db, "success",
                f"[{progress}/{job.total_messages}] Msg {msg.id} enviada com sucesso",
                job_id=self.job_id
            )
        except Exception as e:
            await self._save_item(db, job, msg, "error", error_msg=f"Erro no upload: {str(e)}")
            await self._update_progress(db, job, "error")
            await log(db, "error", f"Erro ao enviar msg {msg.id}: {str(e)}", job_id=self.job_id)
        finally:
            # Remove temp file
            if downloaded and os.path.exists(downloaded):
                try:
                    os.remove(downloaded)
                except OSError:
                    pass

    async def _reupload_album(self, client, job, album, dest_peer, size_limit, temp_dir, db):
        """Download and re-upload an album as a group."""
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
                await self._save_item(db, job, msg, "error", error_msg=f"Erro no download: {str(e)}")
                await self._update_progress(db, job, "error")
                skipped_msgs.append(msg)

        if not files:
            return

        # Send as album
        try:
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

        except Exception as e:
            error_str = str(e)
            for msg_item in album:
                if msg_item not in skipped_msgs:
                    await self._save_item(db, job, msg_item, "error", error_msg=f"Erro no upload do álbum: {error_str}")
                    await self._update_progress(db, job, "error")
            await log(db, "error",
                f"Erro ao enviar álbum ({len(album)} itens): {error_str}",
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
