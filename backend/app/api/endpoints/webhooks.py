"""MundPay webhook endpoint — public (no auth required)."""
import logging
from datetime import datetime
from fastapi import APIRouter, Request
from sqlalchemy import select
from app.db.session import async_session
from app.models.payment import Payment
from app.models.job import CloneJob

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.post("/mundpay")
async def mundpay_webhook(request: Request):
    """
    Receives payment confirmation from MundPay.
    Matches by tracking.src field which contains our tracking_ref.
    """
    body = await request.json()

    event_type = body.get("event_type", "")
    order_id = body.get("id", "")
    status = body.get("status", "")
    tracking = body.get("tracking", {})
    customer = body.get("customer", {})
    payment_detail = body.get("paymentDetail", {})

    # Extract our tracking_ref from tracking.src
    src = tracking.get("src", "")

    # The src may contain extra data — our ref is the part after "txn_"
    tracking_ref = None
    if "txn_" in src:
        # Extract: could be "txn_abc123" or "v3_xxx_txn_abc123_yyy"
        parts = src.split("txn_")
        if len(parts) > 1:
            # Take everything after txn_ until next underscore or end
            ref_part = parts[1].split("_")[0] if "_" in parts[1] else parts[1]
            tracking_ref = f"txn_{ref_part}"

    if not tracking_ref:
        # Fallback: try the full src as tracking_ref
        tracking_ref = src

    logger.info(f"MundPay webhook: event={event_type} status={status} order={order_id} ref={tracking_ref}")

    if event_type == "order.paid" and status == "paid":
        async with async_session() as db:
            # Find payment by tracking_ref
            result = await db.execute(
                select(Payment).where(Payment.tracking_ref == tracking_ref)
            )
            payment = result.scalar_one_or_none()

            if payment is None:
                logger.warning(f"Payment not found for tracking_ref={tracking_ref}")
                return {"status": "not_found", "tracking_ref": tracking_ref}

            if payment.status == "paid":
                logger.info(f"Payment #{payment.id} already marked as paid")
                return {"status": "already_processed"}

            # Update payment
            payment.status = "paid"
            payment.mundpay_order_id = order_id
            payment.customer_name = customer.get("name")
            payment.customer_email = customer.get("email")
            payment.payment_method = body.get("payment_method")
            paid_at_str = body.get("paid_at")
            if paid_at_str:
                try:
                    payment.paid_at = datetime.fromisoformat(paid_at_str.replace("Z", "+00:00"))
                except Exception:
                    payment.paid_at = datetime.utcnow()
            else:
                payment.paid_at = datetime.utcnow()

            # Activate the job
            job = await db.get(CloneJob, payment.job_id)
            if job and job.status == "awaiting_payment":
                job.status = "pending"
                logger.info(f"Job #{job.id} activated after payment #{payment.id}")

            await db.commit()
            return {"status": "ok", "payment_id": payment.id, "job_id": payment.job_id}

    elif event_type == "order.refunded":
        async with async_session() as db:
            result = await db.execute(
                select(Payment).where(Payment.tracking_ref == tracking_ref)
            )
            payment = result.scalar_one_or_none()
            if payment:
                payment.status = "refunded"
                # Cancel the job if still running
                job = await db.get(CloneJob, payment.job_id)
                if job and job.status in ("pending", "running", "paused"):
                    job.status = "cancelled"
                    job.finished_at = datetime.utcnow()
                await db.commit()
                logger.info(f"Payment #{payment.id} refunded, job cancelled")
            return {"status": "refunded"}

    return {"status": "ignored", "event_type": event_type}
