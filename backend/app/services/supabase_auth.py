"""Supabase Auth integration — email confirmation via Supabase GoTrue API."""
import logging
import httpx
from sqlalchemy import select
from app.db.session import async_session
from app.models.setting import AppSetting

logger = logging.getLogger(__name__)


async def _get_supabase_config() -> tuple[str, str]:
    """Read Supabase URL and anon key from app_settings."""
    async with async_session() as db:
        result = await db.execute(select(AppSetting).where(
            AppSetting.key.in_(["supabase_url", "supabase_anon_key"])
        ))
        settings = {s.key: s.value for s in result.scalars().all()}

    url = settings.get("supabase_url", "")
    key = settings.get("supabase_anon_key", "")

    if not url or not key:
        # Fallback to hardcoded defaults
        url = url or "https://nvyvjhrfsbifygrmezlh.supabase.co"
        key = key or ""

    return url, key


async def signup_for_confirmation(email: str, password: str) -> dict:
    """
    Register user in Supabase Auth to trigger confirmation email.
    Returns: { id, email, confirmation_sent_at, ... } or error.
    """
    url, key = await _get_supabase_config()
    if not key:
        logger.warning("[Supabase] No anon key configured, skipping email confirmation")
        return {"skip": True}

    endpoint = f"{url}/auth/v1/signup"
    headers = {
        "apikey": key,
        "Content-Type": "application/json",
    }
    payload = {
        "email": email,
        "password": password,
    }

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(endpoint, json=payload, headers=headers)

    data = resp.json()

    if resp.status_code in (200, 201):
        logger.info("[Supabase] Signup email sent to %s", email)
        return data
    elif resp.status_code == 422 and "already registered" in str(data).lower():
        # User already exists in Supabase — that's fine
        logger.info("[Supabase] User %s already in Supabase auth", email)
        return {"already_exists": True}
    else:
        logger.error("[Supabase] Signup error: %s %s", resp.status_code, data)
        return {"error": data.get("msg") or data.get("message") or str(data)}


async def check_email_confirmed(email: str, password: str) -> bool:
    """
    Try to sign in via Supabase. If success, email is confirmed.
    If error says 'Email not confirmed', it's not.
    """
    url, key = await _get_supabase_config()
    if not key:
        return True  # No Supabase configured, skip check

    endpoint = f"{url}/auth/v1/token?grant_type=password"
    headers = {
        "apikey": key,
        "Content-Type": "application/json",
    }
    payload = {
        "email": email,
        "password": password,
    }

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(endpoint, json=payload, headers=headers)

    if resp.status_code == 200:
        return True  # Email confirmed, login success

    data = resp.json()
    error_msg = str(data.get("error_description") or data.get("msg") or "")

    if "email not confirmed" in error_msg.lower():
        return False

    # Other errors (wrong password in Supabase, etc) — don't block our login
    # The user might have a different password in Supabase vs our app
    logger.info("[Supabase] Auth check for %s: %s (allowing login)", email, error_msg)
    return True
