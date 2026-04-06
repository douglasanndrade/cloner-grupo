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
    InputMediaUploadedDocument,
    InputMediaUploadedPhoto,
    Channel,
)
from telethon.tl.functions.messages import GetForumTopicsRequest, CreateForumTopicRequest, ForwardMessagesRequest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.job import CloneJob
from app.models.job_item import CloneJobItem
from app.models.entity import TelegramEntity
from app.services.log_service import log
from app.core.config import settings

import re
import random

logger = logging.getLogger("cloner.engine")

# Regex to match URLs in text
_URL_REGEX = re.compile(
    r'https?://[^\s<>\"\'\)]+|'      # http(s) links
    r'(?<!\w)(?:www\.)[^\s<>\"\'\)]+|'  # www. links
    r'(?<!\w)t\.me/[^\s<>\"\'\)]+'      # t.me links
)

# Regex to match @mentions
_MENTION_REGEX = re.compile(r'@[A-Za-z0-9_]{3,}')


def _process_content(text: str | None, content_mode: str, link_replace_url: str | None, mention_replace_text: str | None = None) -> str | None:
    """Process message text based on content_mode.

    Modes:
        media_only                → returns None (strip all text/captions)
        media_text                → keep text, remove links AND @mentions
        media_text_links          → keep text + links, remove @mentions
        media_text_links_mentions → keep everything (text + links + @)
        original                  → keep everything untouched
        replace_links_mentions    → replace links with custom URL + replace @mentions with custom @
    """
    if content_mode == "media_only":
        return None
    if not text:
        return text
    if content_mode in ("original", "media_text_links_mentions"):
        return text
    if content_mode == "media_text":
        result = _URL_REGEX.sub("", text)
        result = _MENTION_REGEX.sub("", result)
        return re.sub(r'  +', ' ', result).strip() or None
    if content_mode == "media_text_links":
        result = _MENTION_REGEX.sub("", text)
        return re.sub(r'  +', ' ', result).strip() or None
    if content_mode == "replace_links_mentions":
        result = text
        if link_replace_url:
            result = _URL_REGEX.sub(link_replace_url, result)
        if mention_replace_text:
            replace_val = mention_replace_text if mention_replace_text.startswith("@") else f"@{mention_replace_text}"
            result = _MENTION_REGEX.sub(replace_val, result)
        return result
    return text


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


def _is_file_ref_error(e: Exception) -> bool:
    """Check if an exception is a file reference expired error."""
    msg = str(e).lower()
    return "file reference" in msg or "FILE_REFERENCE_EXPIRED" in str(e)


async def _refresh_message(client, peer, msg):
    """Re-fetch a message to get a fresh file reference.

    When messages are collected in bulk and processed later, the file reference
    can expire (Telegram invalidates them after some time). Re-fetching the
    message by ID returns a fresh copy with valid file references.
    """
    try:
        refreshed = await client.get_messages(peer, ids=msg.id)
        if refreshed:
            return refreshed
    except Exception:
        pass
    return msg


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


def _get_send_kwargs(message):
    """Extract original media attributes for preserving quality on reupload.

    Returns dict of kwargs to pass to client.send_file() to preserve
    resolution, video streaming, thumbnails, etc.
    """
    kwargs = {}
    media = message.media
    if not isinstance(media, MessageMediaDocument) or not media.document:
        return kwargs

    doc = media.document
    # Preserve all original document attributes (filename, video dims, audio info, etc.)
    if doc.attributes:
        kwargs["attributes"] = doc.attributes

    # Enable streaming for videos
    for attr in (doc.attributes or []):
        if isinstance(attr, DocumentAttributeVideo):
            kwargs["supports_streaming"] = True
            break

    return kwargs


async def _build_album_media(client, msg_file_pairs, temp_dir):
    """Build InputMedia list for album with preserved attributes and thumbnails.

    Args:
        client: TelegramClient instance
        msg_file_pairs: list of (original_message, downloaded_file_path)
        temp_dir: directory for temporary thumbnail files

    Returns:
        (media_list, thumb_files) — InputMedia objects and thumb paths to clean up
    """
    media_list = []
    thumb_files = []

    for msg, file_path in msg_file_pairs:
        media = msg.media
        uploaded = await client.upload_file(file_path)

        # Photos — preserve spoiler flag
        if isinstance(media, MessageMediaPhoto):
            spoiler = getattr(media, 'spoiler', False)
            media_list.append(InputMediaUploadedPhoto(
                file=uploaded,
                spoiler=spoiler,
            ))
            continue

        # Documents (video, audio, files, etc.) — preserve attributes + thumb + flags
        if isinstance(media, MessageMediaDocument) and media.document:
            doc = media.document
            spoiler = getattr(media, 'spoiler', False)

            # Download + upload thumbnail for any doc that has one
            # (video preview, audio album art, document preview)
            uploaded_thumb = None
            if doc.thumbs:
                try:
                    tp = os.path.join(temp_dir, f"athumb_{msg.id}.jpg")
                    td = await client.download_media(msg, file=tp, thumb=-1)
                    if td and os.path.exists(td):
                        uploaded_thumb = await client.upload_file(td)
                        thumb_files.append(td)
                except Exception:
                    pass

            # Detect nosound flag (GIF-like videos)
            nosound = False
            for attr in (doc.attributes or []):
                if isinstance(attr, DocumentAttributeVideo):
                    nosound = getattr(attr, 'nosound', False)
                    break

            media_list.append(InputMediaUploadedDocument(
                file=uploaded,
                mime_type=doc.mime_type,
                attributes=doc.attributes or [],
                thumb=uploaded_thumb,
                force_file=False,
                nosound_video=nosound,
                spoiler=spoiler,
            ))
            continue

        # Fallback — let Telethon handle it
        media_list.append(file_path)

    return media_list, thumb_files


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

                # Check if source is a forum (has topics)
                is_forum = isinstance(source_peer, Channel) and getattr(source_peer, "forum", False)

                if is_forum:
                    await self._run_forum(client, job, source_peer, dest_peer, size_limit, db)
                elif job.mode == "forward":
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

    async def _collect_messages(self, client, source_peer, job, db, reply_to=None, label=None):
        """Collect all messages from source, respecting date filters and resume point."""
        tag = f" [{label}]" if label else ""
        await log(db, "info", f"Coletando mensagens da origem{tag}...", job_id=self.job_id)

        messages = []
        kwargs = {}
        if job.date_from:
            kwargs["offset_date"] = job.date_from
        if job.last_message_id and not reply_to:
            kwargs["min_id"] = job.last_message_id
        if reply_to is not None:
            kwargs["reply_to"] = reply_to

        count = 0
        async for msg in client.iter_messages(source_peer, reverse=True, **kwargs):
            if job.date_to and msg.date and msg.date > job.date_to:
                break
            if msg.action:  # Skip service messages
                continue
            messages.append(msg)
            count += 1
            if count % 500 == 0:
                await log(db, "info", f"Coletando{tag}... {count} mensagens até agora", job_id=self.job_id)

        await log(db, "info", f"{len(messages)} mensagens encontradas{tag}", job_id=self.job_id)
        return messages

    # ========================
    # FORUM / TOPICS MODE
    # ========================

    async def _list_topics(self, client, peer):
        """List all forum topics from a group."""
        topics = []
        offset_date = None
        offset_id = 0
        offset_topic = 0

        while True:
            result = await client(GetForumTopicsRequest(
                peer=peer,
                offset_date=offset_date,
                offset_id=offset_id,
                offset_topic=offset_topic,
                limit=100,
            ))
            for t in result.topics:
                if hasattr(t, "id") and hasattr(t, "title"):
                    topics.append(t)

            if len(result.topics) < 100:
                break
            last = result.topics[-1]
            offset_date = getattr(last, "date", None)
            offset_id = getattr(last, "top_message", 0)
            offset_topic = getattr(last, "id", 0)

        return topics

    async def _create_topic(self, client, peer, title, icon_color=None, icon_emoji_id=None):
        """Create a forum topic in the destination and return its ID."""
        kwargs = {"peer": peer, "title": title}
        if icon_color is not None:
            kwargs["icon_color"] = icon_color
        if icon_emoji_id is not None:
            kwargs["icon_emoji_id"] = icon_emoji_id
        result = await client(CreateForumTopicRequest(**kwargs))
        # The new topic ID is in the updates
        for update in result.updates:
            if hasattr(update, "message") and hasattr(update.message, "id"):
                reply_header = getattr(update.message, "reply_to", None)
                if reply_header and hasattr(reply_header, "reply_to_top_id"):
                    return reply_header.reply_to_top_id
                return update.message.id
        return None

    async def _run_forum(self, client, job, source_peer, dest_peer, size_limit, db):
        """Clone a forum group topic by topic."""
        await log(db, "info", "Grupo de origem é um fórum. Listando tópicos...", job_id=self.job_id)

        source_topics = await self._list_topics(client, source_peer)
        if not source_topics:
            await log(db, "warning", "Nenhum tópico encontrado no fórum", job_id=self.job_id)
            return

        await log(db, "info", f"{len(source_topics)} tópicos encontrados", job_id=self.job_id)

        # Check if dest is also a forum
        dest_is_forum = isinstance(dest_peer, Channel) and getattr(dest_peer, "forum", False)
        if not dest_is_forum:
            await log(db, "warning",
                "O destino não é um fórum. As mensagens serão clonadas sem separação por tópico.",
                job_id=self.job_id
            )

        # Collect ALL messages first to get total count
        total = 0
        topic_messages = {}
        for topic in source_topics:
            topic_id = topic.id
            title = topic.title
            msgs = await self._collect_messages(client, source_peer, job, db,
                reply_to=topic_id, label=title)
            topic_messages[topic_id] = msgs
            total += len(msgs)

        # Also collect messages from "General" (topic_id=1 is General)
        general_msgs = await self._collect_messages(client, source_peer, job, db,
            reply_to=1, label="General")
        # Avoid duplicating General if it's already in topics
        general_ids = {1}
        topic_ids_set = {t.id for t in source_topics}
        if 1 not in topic_ids_set and general_msgs:
            topic_messages[1] = general_msgs
            total += len(general_msgs)

        await db.refresh(job)
        job.total_messages = total
        await db.commit()
        await log(db, "info", f"Total: {total} mensagens em {len(topic_messages)} tópicos", job_id=self.job_id)

        # Clone each topic
        for topic in source_topics:
            if not await self._check_state(job, db):
                return

            topic_id = topic.id
            title = topic.title
            messages = topic_messages.get(topic_id, [])
            if not messages:
                await log(db, "info", f"Tópico '{title}' vazio, pulando", job_id=self.job_id)
                continue

            # Create topic in dest (if dest is forum)
            dest_topic_id = None
            if dest_is_forum and topic_id != 1:
                try:
                    icon_color = getattr(topic, "icon_color", None)
                    icon_emoji_id = getattr(topic, "icon_emoji_id", None)
                    dest_topic_id = await self._create_topic(client, dest_peer, title,
                        icon_color=icon_color, icon_emoji_id=icon_emoji_id)
                    await log(db, "info",
                        f"Tópico '{title}' criado no destino (ID: {dest_topic_id})",
                        job_id=self.job_id
                    )
                except Exception as e:
                    await log(db, "warning",
                        f"Erro ao criar tópico '{title}': {str(e)}. Enviando no General.",
                        job_id=self.job_id
                    )

            await log(db, "info",
                f"Clonando tópico '{title}' ({len(messages)} msgs)...",
                job_id=self.job_id
            )

            if job.mode == "forward":
                await self._run_forward_topic(client, job, messages, dest_peer, dest_topic_id, db)
            else:
                await self._run_reupload_topic(client, job, messages, source_peer, dest_peer, dest_topic_id, size_limit, db)

        # Handle General if it's separate
        if 1 in topic_messages and 1 not in topic_ids_set:
            messages = topic_messages[1]
            if messages:
                await log(db, "info",
                    f"Clonando tópico 'General' ({len(messages)} msgs)...",
                    job_id=self.job_id
                )
                if job.mode == "forward":
                    await self._run_forward_topic(client, job, messages, dest_peer, None, db)
                else:
                    await self._run_reupload_topic(client, job, messages, source_peer, dest_peer, None, size_limit, db)

    async def _run_forward_topic(self, client, job, messages, dest_peer, dest_topic_id, db):
        """Forward messages for a specific topic."""
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
                    # Forward album to topic
                    await self._forward_album(client, job, album, dest_peer, db, dest_topic_id=dest_topic_id)
                else:
                    await self._forward_single(client, job, msg, dest_peer, db, dest_topic_id=dest_topic_id)
            except Exception as e:
                if _is_connection_error(e):
                    raise
                raise

            await db.refresh(job)
            job.last_message_id = msg.id
            await db.commit()
            await asyncio.sleep(job.send_interval_ms / 1000)
            i += 1

    async def _run_reupload_topic(self, client, job, messages, source_peer, dest_peer, dest_topic_id, size_limit, db):
        """Reupload messages for a specific topic."""
        temp_dir = os.path.join(settings.temp_dir, f"job_{job.id}")
        os.makedirs(temp_dir, exist_ok=True)

        i = 0
        while i < len(messages):
            if not await self._check_state(job, db):
                return
            msg = messages[i]
            try:
                # Refresh file reference before download to avoid expired refs
                msg = await _refresh_message(client, source_peer, msg)
                messages[i] = msg

                if msg.grouped_id:
                    album = [msg]
                    while i + 1 < len(messages) and messages[i + 1].grouped_id == msg.grouped_id:
                        i += 1
                        messages[i] = await _refresh_message(client, source_peer, messages[i])
                        album.append(messages[i])
                    await self._reupload_album_topic(client, job, album, dest_peer, dest_topic_id, size_limit, temp_dir, db)
                else:
                    await self._reupload_single_topic(client, job, msg, dest_peer, dest_topic_id, size_limit, temp_dir, db)
            except Exception as e:
                if _is_connection_error(e):
                    raise
                raise

            await db.refresh(job)
            job.last_message_id = msg.id
            await db.commit()
            await asyncio.sleep(job.send_interval_ms / 1000)
            i += 1

    async def _reupload_single_topic(self, client, job, msg, dest_peer, dest_topic_id, size_limit, temp_dir, db):
        """Reupload a single message to a specific topic."""
        media_type = _get_media_type(msg)
        media_size = _get_media_size(msg)
        progress = job.processed_count + job.error_count + job.skipped_count + job.incompatible_count + 1
        reply_to = dest_topic_id

        # Text-only
        if not msg.media or isinstance(msg.media, (MessageMediaWebPage, MessageMediaContact, MessageMediaGeo, MessageMediaPoll)):
            if msg.text:
                if job.content_mode == "media_only":
                    await self._save_item(db, job, msg, "skipped", error_msg="Modo só-mídia: texto ignorado")
                    await self._update_progress(db, job, "skipped")
                    return
                try:
                    text = _process_content(msg.text, job.content_mode, job.link_replace_url, job.mention_replace_text)
                    if not text:
                        await self._save_item(db, job, msg, "skipped", error_msg="Texto vazio após processamento")
                        await self._update_progress(db, job, "skipped")
                        return
                    result = await client.send_message(dest_peer, text, reply_to=reply_to)
                    await self._save_item(db, job, msg, "success", dest_msg_id=result.id)
                    await self._update_progress(db, job, "success")
                except Exception as e:
                    if _is_connection_error(e):
                        raise
                    await self._save_item(db, job, msg, "error", error_msg=str(e))
                    await self._update_progress(db, job, "error")
            else:
                await self._save_item(db, job, msg, "incompatible", error_msg=f"Tipo {media_type} não suportado")
                await self._update_progress(db, job, "incompatible")
            return

        # Check size
        if media_size and media_size > size_limit:
            if job.oversized_policy == "skip":
                await self._save_item(db, job, msg, "skipped", error_msg=f"Excede limite ({media_size // (1024**2)}MB)")
                await self._update_progress(db, job, "skipped")
                return
            elif job.oversized_policy == "fail":
                raise ValueError(f"Arquivo de {media_size // (1024**2)}MB excede o limite")

        # Download + Upload
        thumb_path = None
        try:
            file_path = os.path.join(temp_dir, f"msg_{msg.id}")
            downloaded = await client.download_media(msg, file=file_path)
            if not downloaded:
                await self._save_item(db, job, msg, "error", error_msg="Download falhou")
                await self._update_progress(db, job, "error")
                return

            # Preserve original media attributes (resolution, streaming, etc.)
            send_kwargs = _get_send_kwargs(msg)

            # Download thumbnail for any document with thumbs (video, audio art, doc preview)
            if isinstance(msg.media, MessageMediaDocument) and msg.media.document and msg.media.document.thumbs:
                try:
                    thumb_path = os.path.join(temp_dir, f"thumb_{msg.id}.jpg")
                    thumb_dl = await client.download_media(msg, file=thumb_path, thumb=-1)
                    if thumb_dl and os.path.exists(thumb_dl):
                        send_kwargs["thumb"] = thumb_dl
                        thumb_path = thumb_dl
                    else:
                        thumb_path = None
                except Exception:
                    thumb_path = None

            caption = _process_content(msg.text, job.content_mode, job.link_replace_url, job.mention_replace_text) or ""
            result = await client.send_file(
                dest_peer, downloaded, caption=caption,
                reply_to=reply_to, force_document=media_type == "document",
                **send_kwargs,
            )
            await self._save_item(db, job, msg, "success", dest_msg_id=result.id)
            await self._update_progress(db, job, "success")
            await log(db, "success",
                f"[{progress}/{job.total_messages}] Msg {msg.id} enviada",
                job_id=self.job_id
            )
        except Exception as e:
            if _is_connection_error(e):
                raise
            await self._save_item(db, job, msg, "error", error_msg=str(e))
            await self._update_progress(db, job, "error")
        finally:
            if 'downloaded' in locals() and downloaded and os.path.exists(downloaded):
                try:
                    os.remove(downloaded)
                except OSError:
                    pass
            if thumb_path and os.path.exists(thumb_path):
                try:
                    os.remove(thumb_path)
                except OSError:
                    pass

    async def _reupload_album_topic(self, client, job, album, dest_peer, dest_topic_id, size_limit, temp_dir, db):
        """Reupload an album to a specific topic."""
        progress = job.processed_count + job.error_count + job.skipped_count + job.incompatible_count + 1
        reply_to = dest_topic_id

        files = []
        captions = []
        skipped_msgs = []
        downloaded_msgs = []  # track messages for attribute preservation

        for msg in album:
            media_size = _get_media_size(msg)
            if media_size and media_size > size_limit:
                if job.oversized_policy == "skip":
                    await self._save_item(db, job, msg, "skipped", error_msg=f"Excede limite ({media_size // (1024**2)}MB)")
                    await self._update_progress(db, job, "skipped")
                    skipped_msgs.append(msg)
                    continue

            try:
                file_path = os.path.join(temp_dir, f"msg_{msg.id}")
                downloaded = await client.download_media(msg, file=file_path)
                if downloaded:
                    files.append(downloaded)
                    captions.append(_process_content(msg.text, job.content_mode, job.link_replace_url, job.mention_replace_text) or "")
                    downloaded_msgs.append(msg)
                else:
                    await self._save_item(db, job, msg, "error", error_msg="Download falhou")
                    await self._update_progress(db, job, "error")
                    skipped_msgs.append(msg)
            except Exception as e:
                if _is_connection_error(e):
                    raise
                await self._save_item(db, job, msg, "error", error_msg=str(e))
                await self._update_progress(db, job, "error")
                skipped_msgs.append(msg)

        if not files:
            return

        # Send with preserved attributes and thumbnails
        thumb_files = []
        try:
            # Build InputMedia objects with original attributes, dimensions, and thumbnails
            msg_file_pairs = list(zip(downloaded_msgs, files))
            media_list, thumb_files = await _build_album_media(client, msg_file_pairs, temp_dir)

            results = await client.send_file(
                dest_peer, media_list,
                caption=captions,
                reply_to=reply_to,
            )
            success_msgs = [m for m in album if m not in skipped_msgs]
            if not isinstance(results, list):
                results = [results]
            for msg_item, result in zip(success_msgs, results):
                dest_id = result.id if result else None
                await self._save_item(db, job, msg_item, "success", dest_msg_id=dest_id)
                await self._update_progress(db, job, "success")
            for msg_item in success_msgs[len(results):]:
                await self._save_item(db, job, msg_item, "success")
                await self._update_progress(db, job, "success")
        except Exception as e:
            if _is_connection_error(e):
                raise
            for msg_item in [m for m in album if m not in skipped_msgs]:
                await self._save_item(db, job, msg_item, "error", error_msg=str(e))
                await self._update_progress(db, job, "error")
        finally:
            for f in files:
                if os.path.exists(f):
                    try:
                        os.remove(f)
                    except OSError:
                        pass
            for f in thumb_files:
                if os.path.exists(f):
                    try:
                        os.remove(f)
                    except OSError:
                        pass

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

        await db.refresh(job)
        job.total_messages = len(messages)
        await db.commit()

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

    async def _forward_single(self, client, job, msg, dest_peer, db, dest_topic_id=None):
        """Forward a single message."""
        progress = job.processed_count + job.error_count + job.skipped_count + job.incompatible_count + 1
        media_type = _get_media_type(msg)
        await log(db, "info",
            f"[{progress}/{job.total_messages}] Encaminhando msg {msg.id} ({media_type or 'texto'})...",
            job_id=self.job_id
        )
        try:
            if dest_topic_id:
                result = await client(ForwardMessagesRequest(
                    from_peer=msg.peer_id,
                    id=[msg.id],
                    to_peer=dest_peer,
                    top_msg_id=dest_topic_id,
                    random_id=[random.randrange(-2**63, 2**63)],
                ))
                # Extract dest message id from updates
                dest_id = None
                if result and hasattr(result, 'updates'):
                    for upd in result.updates:
                        if hasattr(upd, 'message') and hasattr(upd.message, 'id'):
                            dest_id = upd.message.id
                            break
            else:
                result = await client.forward_messages(dest_peer, msg)
                dest_id = result.id if result else None
            await self._save_item(db, job, msg, "success", dest_msg_id=dest_id)
            await self._update_progress(db, job, "success")
        except Exception as e:
            error_str = str(e)
            await self._save_item(db, job, msg, "error", error_msg=error_str)
            await self._update_progress(db, job, "error")
            await log(db, "error", f"Erro ao encaminhar msg {msg.id}: {error_str}", job_id=self.job_id)

    async def _forward_album(self, client, job, album, dest_peer, db, dest_topic_id=None):
        """Forward an album (grouped messages)."""
        try:
            if dest_topic_id:
                msg_ids = [m.id for m in album]
                random_ids = [random.randrange(-2**63, 2**63) for _ in msg_ids]
                result = await client(ForwardMessagesRequest(
                    from_peer=album[0].peer_id,
                    id=msg_ids,
                    to_peer=dest_peer,
                    top_msg_id=dest_topic_id,
                    random_id=random_ids,
                ))
                # Extract dest message ids from updates
                dest_ids = []
                if result and hasattr(result, 'updates'):
                    for upd in result.updates:
                        if hasattr(upd, 'message') and hasattr(upd.message, 'id'):
                            dest_ids.append(upd.message.id)
                for idx, msg_item in enumerate(album):
                    dest_id = dest_ids[idx] if idx < len(dest_ids) else None
                    await self._save_item(db, job, msg_item, "success", dest_msg_id=dest_id)
                    await self._update_progress(db, job, "success")
            else:
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

        await db.refresh(job)
        job.total_messages = len(messages)
        await db.commit()

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
                    # Refresh file reference before download to avoid expired refs
                    msg = await _refresh_message(client, source_peer, msg)
                    messages[i] = msg

                    # Collect album group
                    if msg.grouped_id:
                        album = [msg]
                        while i + 1 < len(messages) and messages[i + 1].grouped_id == msg.grouped_id:
                            i += 1
                            messages[i] = await _refresh_message(client, source_peer, messages[i])
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
                            source_peer = await self._resolve_peer(client, source_entity.telegram_id)
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
                # In media_only mode, skip text-only messages
                if job.content_mode == "media_only":
                    await self._save_item(db, job, msg, "skipped", error_msg="Modo só-mídia: texto ignorado")
                    await self._update_progress(db, job, "skipped")
                    return
                try:
                    await log(db, "info",
                        f"[{progress}/{job.total_messages}] Enviando texto msg {msg.id}...",
                        job_id=self.job_id
                    )
                    text = _process_content(msg.text, job.content_mode, job.link_replace_url, job.mention_replace_text)
                    if not text:
                        await self._save_item(db, job, msg, "skipped", error_msg="Texto vazio após processamento de conteúdo")
                        await self._update_progress(db, job, "skipped")
                        return
                    result = await client.send_message(dest_peer, text)
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
            dl_start_time = [time.time()]
            dl_last_log = [time.time()]
            engine_ref = self  # capture for closure

            def dl_progress(received, total):
                now = time.time()
                if now - dl_last_log[0] >= 5:
                    dl_last_log[0] = now
                    mb_done = received / (1024 * 1024)
                    elapsed = now - dl_start_time[0]
                    speed = received / elapsed if elapsed > 0 else 0
                    speed_mb = speed / (1024 * 1024)
                    real_total = total or total_size
                    if real_total and speed > 0:
                        remaining = real_total - received
                        eta_sec = int(remaining / speed)
                        eta_min = eta_sec // 60
                        eta_s = eta_sec % 60
                        pct = int((received / real_total) * 100)
                        mb_total = real_total / (1024 * 1024)
                        msg_text = f"[{progress}/{job.total_messages}] ⬇ Download msg {msg.id}: {mb_done:.0f}MB/{mb_total:.0f}MB ({pct}%) | {speed_mb:.1f} MB/s | ETA {eta_min}m{eta_s:02d}s"
                    else:
                        msg_text = f"[{progress}/{job.total_messages}] ⬇ Download msg {msg.id}: {mb_done:.0f}MB | {speed_mb:.1f} MB/s"
                    asyncio.get_event_loop().create_task(
                        engine_ref._log_progress_bg("info", msg_text)
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
        thumb_path = None
        try:
            file_size_mb = os.path.getsize(downloaded) // (1024 * 1024) if os.path.exists(downloaded) else 0
            await log(db, "info",
                f"[{progress}/{job.total_messages}] ⬆ Enviando msg {msg.id} ({file_size_mb}MB) para o destino...",
                job_id=self.job_id
            )
            caption = _process_content(msg.text, job.content_mode, job.link_replace_url, job.mention_replace_text) or ""

            # Preserve original media attributes (resolution, streaming, etc.)
            send_kwargs = _get_send_kwargs(msg)

            # Download thumbnail for any document with thumbs (video, audio art, doc preview)
            if isinstance(msg.media, MessageMediaDocument) and msg.media.document and msg.media.document.thumbs:
                try:
                    thumb_path = os.path.join(temp_dir, f"thumb_{msg.id}.jpg")
                    thumb_dl = await client.download_media(msg, file=thumb_path, thumb=-1)
                    if thumb_dl and os.path.exists(thumb_dl):
                        send_kwargs["thumb"] = thumb_dl
                        thumb_path = thumb_dl
                    else:
                        thumb_path = None
                except Exception:
                    thumb_path = None

            # Progress callback for upload — uses separate db session
            ul_start_time = [time.time()]
            ul_last_log = [time.time()]
            file_size_bytes = os.path.getsize(downloaded) if os.path.exists(downloaded) else 0

            def ul_progress(sent, total):
                now = time.time()
                if now - ul_last_log[0] >= 5:
                    ul_last_log[0] = now
                    mb_done = sent / (1024 * 1024)
                    elapsed = now - ul_start_time[0]
                    speed = sent / elapsed if elapsed > 0 else 0
                    speed_mb = speed / (1024 * 1024)
                    real_total = total or file_size_bytes
                    if real_total and speed > 0:
                        remaining = real_total - sent
                        eta_sec = int(remaining / speed)
                        eta_min = eta_sec // 60
                        eta_s = eta_sec % 60
                        pct = int((sent / real_total) * 100)
                        mb_total = real_total / (1024 * 1024)
                        msg_text = f"[{progress}/{job.total_messages}] ⬆ Upload msg {msg.id}: {mb_done:.0f}MB/{mb_total:.0f}MB ({pct}%) | {speed_mb:.1f} MB/s | ETA {eta_min}m{eta_s:02d}s"
                    else:
                        msg_text = f"[{progress}/{job.total_messages}] ⬆ Upload msg {msg.id}: {mb_done:.0f}MB | {speed_mb:.1f} MB/s"
                    asyncio.get_event_loop().create_task(
                        engine_ref._log_progress_bg("info", msg_text)
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
                    **send_kwargs,
                )
            else:
                result = await client.send_file(
                    dest_peer,
                    downloaded,
                    caption=caption,
                    force_document=media_type == "document",
                    progress_callback=ul_progress if file_size_mb > 10 else None,
                    **send_kwargs,
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
            # Remove temp files
            if downloaded and os.path.exists(downloaded):
                try:
                    os.remove(downloaded)
                except OSError:
                    pass
            if thumb_path and os.path.exists(thumb_path):
                try:
                    os.remove(thumb_path)
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
        downloaded_msgs = []  # track messages for attribute preservation

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
                    captions.append(_process_content(msg.text, job.content_mode, job.link_replace_url, job.mention_replace_text) or "")
                    downloaded_msgs.append(msg)
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

        # Send as album with preserved attributes and thumbnails
        thumb_files = []
        try:
            await log(db, "info",
                f"[{progress}/{job.total_messages}] ⬆ Enviando álbum ({len(files)} arquivos) para o destino...",
                job_id=self.job_id
            )

            # Build InputMedia objects with original attributes, dimensions, and thumbnails
            msg_file_pairs = list(zip(downloaded_msgs, files))
            media_list, thumb_files = await _build_album_media(client, msg_file_pairs, temp_dir)

            results = await client.send_file(
                dest_peer,
                media_list,
                caption=captions,
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
            for f in thumb_files:
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
