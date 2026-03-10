import datetime
from sqlalchemy import (
    String, Integer, DateTime, BigInteger, Text,
    ForeignKey, func, Index,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class CloneJobItem(Base):
    __tablename__ = "clone_job_items"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("clone_jobs.id", ondelete="CASCADE"), nullable=False)

    source_message_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    grouped_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    media_type: Mapped[str | None] = mapped_column(String(32), nullable=True)  # photo, video, document, audio, voice, etc.
    media_size: Mapped[int | None] = mapped_column(BigInteger, nullable=True)  # bytes

    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    # pending | success | error | skipped | incompatible
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    destination_message_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

    processed_at: Mapped[datetime.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    job = relationship("CloneJob", back_populates="items")

    __table_args__ = (
        Index("ix_job_items_job_status", "job_id", "status"),
        Index("ix_job_items_job_msg", "job_id", "source_message_id", unique=True),
    )

    def __repr__(self) -> str:
        return f"<CloneJobItem job={self.job_id} msg={self.source_message_id} [{self.status}]>"
