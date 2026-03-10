import datetime
from sqlalchemy import String, Integer, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(256), nullable=False)

    # Créditos por faixa
    credits_basic: Mapped[int] = mapped_column(Integer, default=0, server_default="0")       # até 500 msgs
    credits_standard: Mapped[int] = mapped_column(Integer, default=0, server_default="0")    # 501-1000 msgs
    credits_premium: Mapped[int] = mapped_column(Integer, default=0, server_default="0")     # +1000 msgs

    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    def __repr__(self) -> str:
        return f"<User {self.username}>"
