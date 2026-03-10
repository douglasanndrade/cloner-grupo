import datetime
from sqlalchemy import (
    String, Integer, DateTime, Text, BigInteger,
    ForeignKey, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("clone_jobs.id"), nullable=False)

    # Unique tracking ref sent to MundPay via ?src=
    tracking_ref: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)

    # Plan info
    plan: Mapped[str] = mapped_column(String(20), nullable=False)  # basic | standard | premium
    amount: Mapped[int] = mapped_column(Integer, nullable=False)  # in cents (e.g. 2990 = R$ 29,90)
    message_count: Mapped[int] = mapped_column(Integer, default=0)

    # Status: pending | paid | refunded | expired
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)

    # MundPay data (filled when webhook arrives)
    mundpay_order_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    customer_name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    customer_email: Mapped[str | None] = mapped_column(String(256), nullable=True)
    payment_method: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Checkout URL used
    checkout_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Timestamps
    paid_at: Mapped[datetime.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    job = relationship("CloneJob", foreign_keys=[job_id])

    def __repr__(self) -> str:
        return f"<Payment #{self.id} job={self.job_id} [{self.status}]>"
