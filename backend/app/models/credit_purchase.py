import datetime
from sqlalchemy import (
    String, Integer, Float, DateTime, Text,
    ForeignKey, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class CreditPurchase(Base):
    __tablename__ = "credit_purchases"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)

    # Plan: basic | standard | premium
    plan: Mapped[str] = mapped_column(String(20), nullable=False)
    credits: Mapped[int] = mapped_column(Integer, default=1)
    amount: Mapped[float] = mapped_column(Float, nullable=False)  # R$ value (e.g. 29.90)

    # SyncPay data
    syncpay_identifier: Mapped[str] = mapped_column(String(128), unique=True, nullable=False, index=True)
    pix_code: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Status: pending | completed | failed | refunded
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)

    # Customer (from webhook)
    customer_name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    customer_email: Mapped[str | None] = mapped_column(String(256), nullable=True)
    customer_cpf: Mapped[str | None] = mapped_column(String(20), nullable=True)
    end_to_end: Mapped[str | None] = mapped_column(String(128), nullable=True)

    # Timestamps
    paid_at: Mapped[datetime.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    user = relationship("User", foreign_keys=[user_id])

    def __repr__(self) -> str:
        return f"<CreditPurchase #{self.id} user={self.user_id} plan={self.plan} [{self.status}]>"
