"""Centralized logging — writes to DB and file."""
import logging
from datetime import datetime
from pathlib import Path
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.job_log import CloneJobLog
from app.core.config import settings

# File logger
_log_file = Path(settings.log_dir) / "cloner.log"
_file_handler = logging.FileHandler(_log_file, encoding="utf-8")
_file_handler.setFormatter(logging.Formatter("[%(asctime)s] %(levelname)s — %(message)s"))
_logger = logging.getLogger("cloner")
_logger.addHandler(_file_handler)
_logger.setLevel(logging.DEBUG)


async def log(
    db: AsyncSession,
    level: str,
    message: str,
    job_id: int | None = None,
    details: str | None = None,
):
    """Write log to DB and file."""
    entry = CloneJobLog(
        job_id=job_id,
        level=level,
        message=message,
        details=details,
    )
    db.add(entry)
    await db.commit()

    # Also write to file
    log_fn = getattr(_logger, level if level != "success" else "info", _logger.info)
    prefix = f"[Job #{job_id}] " if job_id else ""
    log_fn(f"{prefix}{message}")

    return entry
