"""SyncPay Pix integration — auth token + cash-in (create pix).
Credentials are read from app_settings table (configured in Settings page).
"""
import time
import logging
import httpx
from sqlalchemy import select
from app.db.session import async_session
from app.models.setting import AppSetting

logger = logging.getLogger(__name__)

SYNCPAY_BASE_URL = "https://api.syncpayments.com.br"
DEFAULT_WEBHOOK_URL = "https://cloner-grupo-backend.68tvlf.easypanel.host/api/webhooks/syncpay"

# Cached token
_token: str | None = None
_token_expires_at: float = 0


async def _get_credentials() -> tuple[str, str, str]:
    """Read SyncPay credentials from app_settings DB table."""
    async with async_session() as db:
        result = await db.execute(select(AppSetting).where(
            AppSetting.key.in_(["syncpay_client_id", "syncpay_client_secret", "syncpay_webhook_url"])
        ))
        settings = {s.key: s.value for s in result.scalars().all()}

    client_id = settings.get("syncpay_client_id", "")
    client_secret = settings.get("syncpay_client_secret", "")
    webhook_url = settings.get("syncpay_webhook_url", "")

    if not client_id or not client_secret:
        raise ValueError("SyncPay não configurado. Vá em Configurações e preencha Client ID e Client Secret.")

    return client_id, client_secret, webhook_url


async def _get_token() -> str:
    """Get or refresh the SyncPay auth token (1h TTL)."""
    global _token, _token_expires_at

    # Reuse if still valid (with 60s margin)
    if _token and time.time() < _token_expires_at - 60:
        return _token

    client_id, client_secret, _ = await _get_credentials()

    url = f"{SYNCPAY_BASE_URL}/api/partner/v1/auth-token"
    payload = {
        "client_id": client_id,
        "client_secret": client_secret,
    }

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(url, json=payload)
        resp.raise_for_status()
        data = resp.json()

    _token = data["access_token"]
    _token_expires_at = time.time() + data.get("expires_in", 3600)
    logger.info("[SyncPay] Token obtained, expires in %ds", data.get("expires_in", 3600))
    return _token


async def create_pix(
    amount: float,
    description: str,
    client_name: str,
    client_cpf: str,
    client_email: str,
    client_phone: str,
    webhook_url: str | None = None,
) -> dict:
    """
    Create a Pix cash-in request.
    Returns: { message, pix_code, identifier }
    """
    token = await _get_token()
    _, _, db_webhook_url = await _get_credentials()

    url = f"{SYNCPAY_BASE_URL}/api/partner/v1/cash-in"

    payload: dict = {
        "amount": amount,
        "description": description,
        "client": {
            "name": client_name,
            "cpf": client_cpf,
            "email": client_email,
            "phone": client_phone,
        },
    }

    # Don't send webhook_url — we use global webhook registered at startup
    # Sending both causes duplicate webhook calls

    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
    }

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(url, json=payload, headers=headers)

        if resp.status_code == 401:
            # Token expired mid-flight — refresh and retry once
            global _token, _token_expires_at
            _token = None
            _token_expires_at = 0
            token = await _get_token()
            headers["Authorization"] = f"Bearer {token}"
            resp = await client.post(url, json=payload, headers=headers)

        resp.raise_for_status()
        data = resp.json()

    logger.info(
        "[SyncPay] Pix created: identifier=%s amount=%.2f",
        data.get("identifier"),
        amount,
    )
    return data


async def register_webhook() -> dict | None:
    """Register global webhook at SyncPay for cashin events. Safe to call multiple times."""
    try:
        token = await _get_token()
        url = f"{SYNCPAY_BASE_URL}/api/partner/v1/webhooks"
        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
        }
        payload = {
            "title": "Cloner Grupo - Pagamentos",
            "url": DEFAULT_WEBHOOK_URL,
            "event": "cashin",
            "trigger_all_products": True,
        }

        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(url, json=payload, headers=headers)

        data = resp.json()
        if resp.status_code in (200, 201):
            logger.info("[SyncPay] Webhook registered: %s", data)
        else:
            logger.info("[SyncPay] Webhook register response: %s %s", resp.status_code, data)
        return data
    except Exception as e:
        logger.error("[SyncPay] Failed to register webhook: %s", e)
        return None
