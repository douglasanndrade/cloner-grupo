"""App settings stored in DB with fallback to config."""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.setting import AppSetting
from app.core.config import settings as app_config


# Default values (from config or hardcoded)
DEFAULTS = {
    "telegram_api_id": str(app_config.telegram_api_id),
    "telegram_api_hash": app_config.telegram_api_hash,
    "temp_directory": app_config.temp_dir,
    "log_retention_days": str(app_config.log_retention_days),
    "max_concurrency": str(app_config.max_concurrency),
    "default_send_interval_ms": str(app_config.default_send_interval_ms),
    "default_timeout_seconds": str(app_config.default_timeout_seconds),
    "max_retries": str(app_config.max_retries),
    "retry_delay_seconds": str(app_config.retry_delay_seconds),
    "db_url": app_config.database_url,
    "worker_enabled": "true",
    "syncpay_client_id": "cadc17a6-3724-4e2a-b32c-b88bd5f8e6c4",
    "syncpay_client_secret": "a89657d4-d09a-4ae7-afd4-1ddd6af9025b",
    "syncpay_webhook_url": "https://cloner-grupo-backend.68tvlf.easypanel.host/api/webhooks/syncpay",
    "supabase_url": "https://nvyvjhrfsbifygrmezlh.supabase.co",
    "supabase_anon_key": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im52eXZqaHJmc2JpZnlncm1lemxoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxMTQ1MzQsImV4cCI6MjA4ODY5MDUzNH0.iT9BZXidiqcRovp646psdsxgcCP7L3tdEGQtqfz3yAo",
}


async def get_all_settings(db: AsyncSession) -> dict:
    """Get all settings, merging DB values over defaults."""
    result = await db.execute(select(AppSetting))
    db_settings = {s.key: s.value for s in result.scalars().all()}

    merged = {**DEFAULTS, **db_settings}

    return {
        "telegram_api_id": merged["telegram_api_id"],
        "telegram_api_hash": merged["telegram_api_hash"],
        "temp_directory": merged["temp_directory"],
        "log_retention_days": int(merged["log_retention_days"]),
        "max_concurrency": int(merged["max_concurrency"]),
        "default_send_interval_ms": int(merged["default_send_interval_ms"]),
        "default_timeout_seconds": int(merged["default_timeout_seconds"]),
        "max_retries": int(merged["max_retries"]),
        "retry_delay_seconds": int(merged["retry_delay_seconds"]),
        "db_url": merged["db_url"],
        "worker_enabled": merged["worker_enabled"].lower() in ("true", "1", "yes"),
        "syncpay_client_id": merged["syncpay_client_id"],
        "syncpay_client_secret": merged["syncpay_client_secret"],
        "syncpay_webhook_url": merged["syncpay_webhook_url"],
        "supabase_url": merged["supabase_url"],
        "supabase_anon_key": merged["supabase_anon_key"],
    }


async def update_settings(db: AsyncSession, updates: dict) -> dict:
    """Update settings in DB."""
    for key, value in updates.items():
        if value is None:
            continue

        str_value = str(value).lower() if isinstance(value, bool) else str(value)

        stmt = select(AppSetting).where(AppSetting.key == key)
        result = await db.execute(stmt)
        setting = result.scalar_one_or_none()

        if setting:
            setting.value = str_value
        else:
            db.add(AppSetting(key=key, value=str_value))

    await db.commit()
    return await get_all_settings(db)
