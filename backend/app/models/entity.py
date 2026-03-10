import datetime
from sqlalchemy import String, Integer, DateTime, BigInteger, func
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base


class TelegramEntity(Base):
    __tablename__ = "telegram_entities"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    telegram_id: Mapped[int] = mapped_column(BigInteger, nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(256), nullable=False)
    username: Mapped[str | None] = mapped_column(String(64), nullable=True)
    entity_type: Mapped[str] = mapped_column(String(20), nullable=False)  # channel, group, supergroup, chat, user
    members_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    photo_url: Mapped[str | None] = mapped_column(String(512), nullable=True)

    resolved_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    def __repr__(self) -> str:
        return f"<TelegramEntity {self.title} ({self.telegram_id})>"
