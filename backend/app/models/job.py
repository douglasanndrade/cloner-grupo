import datetime
from sqlalchemy import (
    String, Integer, Boolean, DateTime, Text, BigInteger,
    ForeignKey, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class CloneJob(Base):
    __tablename__ = "clone_jobs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(256), nullable=False)

    # Owner
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)

    # Relations
    source_entity_id: Mapped[int] = mapped_column(ForeignKey("telegram_entities.id"), nullable=False)
    destination_entity_id: Mapped[int] = mapped_column(ForeignKey("telegram_entities.id"), nullable=False)
    account_id: Mapped[int] = mapped_column(ForeignKey("telegram_accounts.id"), nullable=False)

    # Denormalized for easy display
    source_title: Mapped[str] = mapped_column(String(256), nullable=False)
    destination_title: Mapped[str] = mapped_column(String(256), nullable=False)
    account_phone: Mapped[str] = mapped_column(String(20), nullable=False)

    # Config
    mode: Mapped[str] = mapped_column(String(20), nullable=False)  # forward | reupload
    import_history: Mapped[bool] = mapped_column(Boolean, default=True)
    monitor_new: Mapped[bool] = mapped_column(Boolean, default=True)
    send_interval_ms: Mapped[int] = mapped_column(Integer, default=1000)
    max_concurrency: Mapped[int] = mapped_column(Integer, default=1)
    temp_directory: Mapped[str] = mapped_column(String(512), default="/tmp/cloner")
    oversized_policy: Mapped[str] = mapped_column(String(20), default="skip")  # skip | forward_instead | fail
    date_from: Mapped[datetime.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    date_to: Mapped[datetime.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Status & Progress
    status: Mapped[str] = mapped_column(String(20), default="awaiting_payment", index=True)
    # awaiting_payment | pending | validating | running | paused | completed | failed | cancelled
    last_message_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    total_messages: Mapped[int] = mapped_column(Integer, default=0)
    processed_count: Mapped[int] = mapped_column(Integer, default=0)
    error_count: Mapped[int] = mapped_column(Integer, default=0)
    skipped_count: Mapped[int] = mapped_column(Integer, default=0)
    incompatible_count: Mapped[int] = mapped_column(Integer, default=0)

    # Timestamps
    started_at: Mapped[datetime.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relationships
    user = relationship("User", foreign_keys=[user_id])
    source_entity = relationship("TelegramEntity", foreign_keys=[source_entity_id])
    destination_entity = relationship("TelegramEntity", foreign_keys=[destination_entity_id])
    account = relationship("TelegramAccount", foreign_keys=[account_id])
    items = relationship("CloneJobItem", back_populates="job", cascade="all, delete-orphan")
    logs = relationship("CloneJobLog", back_populates="job", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<CloneJob #{self.id} {self.name} [{self.status}]>"
