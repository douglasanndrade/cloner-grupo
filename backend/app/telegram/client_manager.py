"""
Manages Telethon client instances.
Each account gets its own TelegramClient, cached in memory.
Only ONE client per phone number to avoid SQLite "database is locked".
"""
import os
import sqlite3
import asyncio
from telethon import TelegramClient
from app.core.config import settings

# Single cache of clients: phone -> TelegramClient
_clients: dict[str, TelegramClient] = {}

# Lock to prevent concurrent access to the same session file
_locks: dict[str, asyncio.Lock] = {}


def _get_lock(phone: str) -> asyncio.Lock:
    """Get or create a lock for a phone number."""
    if phone not in _locks:
        _locks[phone] = asyncio.Lock()
    return _locks[phone]


def _session_path(phone: str) -> str:
    """Return the .session file path for a phone number."""
    safe_phone = phone.replace("+", "").replace(" ", "")
    return os.path.join(settings.sessions_dir, f"session_{safe_phone}")


def _create_client(phone: str) -> TelegramClient:
    """Create a new TelegramClient for a phone number."""
    # Enable WAL mode on the session SQLite to prevent "database is locked"
    session_file = _session_path(phone) + ".session"
    if os.path.exists(session_file):
        try:
            conn = sqlite3.connect(session_file)
            conn.execute("PRAGMA journal_mode=WAL")
            conn.close()
        except Exception:
            pass

    return TelegramClient(
        _session_path(phone),
        settings.telegram_api_id,
        settings.telegram_api_hash,
        request_retries=5,
        connection_retries=5,
        retry_delay=1,
    )


def get_login_client(phone: str) -> TelegramClient:
    """Get or create a client for the login flow.
    Reuses existing client if one exists for this phone.
    """
    if phone not in _clients:
        _clients[phone] = _create_client(phone)
    return _clients[phone]


def promote_login_client(phone: str) -> TelegramClient:
    """Mark a login client as fully authenticated (no-op now since unified cache)."""
    return _clients.get(phone)


def get_client(phone: str) -> TelegramClient | None:
    """Get an active (authenticated) client by phone."""
    if phone in _clients:
        return _clients[phone]

    # Try to load from session file
    session_path = _session_path(phone)
    if os.path.exists(session_path + ".session"):
        client = _create_client(phone)
        _clients[phone] = client
        return client

    return None


async def ensure_connected(phone: str) -> TelegramClient:
    """Get client and ensure it's connected."""
    lock = _get_lock(phone)
    async with lock:
        client = get_client(phone)
        if client is None:
            raise ValueError(f"Nenhuma sessão encontrada para {phone}")

        if not client.is_connected():
            await client.connect()

        return client


async def disconnect_client(phone: str):
    """Disconnect and remove a client."""
    client = _clients.pop(phone, None)
    if client:
        try:
            if client.is_connected():
                await client.disconnect()
        except Exception:
            pass


async def disconnect_all():
    """Disconnect all active clients (for shutdown)."""
    for phone in list(_clients.keys()):
        await disconnect_client(phone)


def get_session_file(phone: str) -> str:
    """Return the session file name for storage in DB."""
    return _session_path(phone) + ".session"
