from pydantic import BaseModel


class AppSettingsOut(BaseModel):
    telegram_api_id: str
    telegram_api_hash: str
    temp_directory: str
    log_retention_days: int
    max_concurrency: int
    default_send_interval_ms: int
    default_timeout_seconds: int
    max_retries: int
    retry_delay_seconds: int
    db_url: str
    worker_enabled: bool


class AppSettingsUpdate(BaseModel):
    telegram_api_id: str | None = None
    telegram_api_hash: str | None = None
    temp_directory: str | None = None
    log_retention_days: int | None = None
    max_concurrency: int | None = None
    default_send_interval_ms: int | None = None
    default_timeout_seconds: int | None = None
    max_retries: int | None = None
    retry_delay_seconds: int | None = None
    db_url: str | None = None
    worker_enabled: bool | None = None
