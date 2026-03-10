import datetime
from sqlalchemy import String, DateTime, Text, ForeignKey, func, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class CloneJobLog(Base):
    __tablename__ = "clone_job_logs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    job_id: Mapped[int | None] = mapped_column(
        ForeignKey("clone_jobs.id", ondelete="CASCADE"), nullable=True
    )
    level: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    # debug | info | success | warning | error
    message: Mapped[str] = mapped_column(Text, nullable=False)
    details: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )

    # Relationships
    job = relationship("CloneJob", back_populates="logs")

    __table_args__ = (
        Index("ix_job_logs_job_created", "job_id", "created_at"),
    )

    def __repr__(self) -> str:
        return f"<CloneJobLog [{self.level}] {self.message[:50]}>"
