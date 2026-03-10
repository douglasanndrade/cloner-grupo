from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/cloner_grupo"

    # Telegram
    telegram_api_id: int = 34587540
    telegram_api_hash: str = "34e845744628dcb26c8ddf0517c5fe2e"

    # App
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    app_debug: bool = True

    # Paths
    sessions_dir: str = "./sessions"
    temp_dir: str = "./tmp"
    log_dir: str = "./logs"

    # Worker defaults
    log_retention_days: int = 30
    worker_enabled: bool = True
    default_send_interval_ms: int = 1000
    max_concurrency: int = 1
    default_timeout_seconds: int = 60
    max_retries: int = 3
    retry_delay_seconds: int = 5

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
    }

    def ensure_dirs(self):
        """Create necessary directories if they don't exist."""
        for d in [self.sessions_dir, self.temp_dir, self.log_dir]:
            Path(d).mkdir(parents=True, exist_ok=True)


settings = Settings()
settings.ensure_dirs()
