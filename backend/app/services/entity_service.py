"""Resolve Telegram entities (channels, groups, users)."""
import re
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from telethon.tl.types import Channel, Chat, User

from app.models.entity import TelegramEntity
from app.models.account import TelegramAccount
from app.telegram.client_manager import ensure_connected


async def resolve_entity(
    identifier: str,
    account_id: int,
    db: AsyncSession,
) -> TelegramEntity:
    """
    Resolve a Telegram entity from various formats:
    - Numeric ID: -1001234567890
    - Username: @channel_name
    - Link: https://t.me/channel_name
    """
    # Get account
    account = await db.get(TelegramAccount, account_id)
    if not account:
        raise ValueError("Conta não encontrada")

    client = await ensure_connected(account.phone)

    # Parse identifier
    parsed = _parse_identifier(identifier)

    # Resolve via Telethon — tenta múltiplos formatos se for ID numérico
    entity = None
    attempts = [parsed]

    # Se for número puro (sem -100), tenta também com -100 na frente
    if isinstance(parsed, int) and parsed > 0:
        attempts.append(int(f"-100{parsed}"))
    # Se já veio com -100, tenta também sem
    elif isinstance(parsed, int) and str(parsed).startswith("-100"):
        raw_id = int(str(parsed).replace("-100", "", 1))
        attempts.append(raw_id)

    last_error = None
    for attempt in attempts:
        try:
            entity = await client.get_entity(attempt)
            break
        except Exception as e:
            last_error = e

    if entity is None:
        raise ValueError(f"Não foi possível resolver '{identifier}': {last_error}")

    # Determine type and info
    if isinstance(entity, Channel):
        entity_type = "channel" if entity.broadcast else "supergroup"
        title = entity.title
        username = entity.username
        members_count = entity.participants_count
    elif isinstance(entity, Chat):
        entity_type = "group"
        title = entity.title
        username = None
        members_count = entity.participants_count
    elif isinstance(entity, User):
        entity_type = "user"
        title = f"{entity.first_name or ''} {entity.last_name or ''}".strip()
        username = entity.username
        members_count = None
    else:
        entity_type = "chat"
        title = str(getattr(entity, "title", "Unknown"))
        username = getattr(entity, "username", None)
        members_count = None

    telegram_id = entity.id

    # Check if already exists in DB
    stmt = select(TelegramEntity).where(TelegramEntity.telegram_id == telegram_id)
    result = await db.execute(stmt)
    db_entity = result.scalar_one_or_none()

    if db_entity:
        db_entity.title = title
        db_entity.username = username
        db_entity.entity_type = entity_type
        db_entity.members_count = members_count
    else:
        db_entity = TelegramEntity(
            telegram_id=telegram_id,
            title=title,
            username=username,
            entity_type=entity_type,
            members_count=members_count,
        )
        db.add(db_entity)

    await db.commit()
    await db.refresh(db_entity)
    return db_entity


def _parse_identifier(identifier: str):
    """Parse various identifier formats into something Telethon can resolve."""
    identifier = identifier.strip()

    # Numeric ID
    try:
        return int(identifier)
    except ValueError:
        pass

    # t.me link
    match = re.match(r"https?://t\.me/([a-zA-Z0-9_]+)", identifier)
    if match:
        return match.group(1)

    # @username
    if identifier.startswith("@"):
        return identifier[1:]

    # Plain username
    return identifier
