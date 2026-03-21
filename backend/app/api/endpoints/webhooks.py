"""SyncPay webhook endpoint — public (no auth required)."""
import logging
from datetime import datetime
from fastapi import APIRouter, Request
from sqlalchemy import select
from app.db.session import async_session
from app.models.credit_purchase import CreditPurchase
from app.models.user import User
from app.models.job_log import CloneJobLog

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks", tags=["webhooks"])

# Credit field mapping
_CREDIT_FIELDS = {
    "basic": "credits_basic",
    "standard": "credits_standard",
    "premium": "credits_premium",
}


@router.post("/syncpay")
async def syncpay_webhook(request: Request):
    """
    Receives payment webhooks from SyncPay.
    Format: { data: { id, status, amount, ... } }
    Events: cashin.create (pending), cashin.update (completed/failed/refunded)
    """
    body = await request.json()
    event = request.headers.get("event", "")
    data = body.get("data", {})

    txn_id = data.get("id", "")
    status = data.get("status", "")
    amount = data.get("amount", 0)

    logger.info(
        "[SyncPay Webhook] event=%s status=%s id=%s amount=%s",
        event, status, txn_id, amount,
    )

    if not txn_id:
        return {"status": "ignored", "reason": "no transaction id"}

    async with async_session() as db:
        # Find purchase by SyncPay identifier
        result = await db.execute(
            select(CreditPurchase).where(CreditPurchase.syncpay_identifier == txn_id)
        )
        purchase = result.scalar_one_or_none()

        if purchase is None:
            logger.warning("[SyncPay Webhook] Purchase not found for id=%s", txn_id)
            return {"status": "not_found", "identifier": txn_id}

        if purchase.status == "completed":
            logger.info("[SyncPay Webhook] Purchase #%d already completed", purchase.id)
            return {"status": "already_processed"}

        # Handle completed payment
        if status == "completed":
            purchase.status = "completed"
            purchase.paid_at = datetime.utcnow()
            purchase.end_to_end = data.get("end_to_end")

            # Extract customer info from webhook
            client = data.get("client", {})
            debtor = data.get("debtor_account", {})
            if client:
                purchase.customer_name = client.get("name") or purchase.customer_name
                purchase.customer_email = client.get("email") or purchase.customer_email
            elif debtor:
                purchase.customer_name = debtor.get("name") or purchase.customer_name

            # Add credits to user
            user = await db.get(User, purchase.user_id)
            if user:
                credit_field = _CREDIT_FIELDS.get(purchase.plan)
                if credit_field:
                    current = getattr(user, credit_field, 0)
                    setattr(user, credit_field, current + purchase.credits)
                    logger.info(
                        "[SyncPay Webhook] Added %d %s credit(s) to user %s (now %d)",
                        purchase.credits, purchase.plan, user.username,
                        current + purchase.credits,
                    )

                # Log: Pix pago
                plan_labels = {"basic": "Básico", "standard": "Standard", "premium": "Premium"}
                db.add(CloneJobLog(
                    job_id=None,
                    level="success",
                    message=f"[PIX PAGO] R$ {purchase.amount:.2f} — {purchase.credits}x {plan_labels.get(purchase.plan, purchase.plan)} — {user.username}",
                    details=f"purchase_id={purchase.id} end_to_end={data.get('end_to_end', '')}",
                ))

            await db.commit()
            return {"status": "ok", "purchase_id": purchase.id}

        # Handle failed
        elif status == "failed":
            purchase.status = "failed"
            await db.commit()
            logger.info("[SyncPay Webhook] Purchase #%d failed", purchase.id)
            return {"status": "failed"}

        # Handle refunded
        elif status == "refunded" or status == "med":
            purchase.status = "refunded"
            # Remove credits if they were already added
            if purchase.paid_at:
                user = await db.get(User, purchase.user_id)
                if user:
                    credit_field = _CREDIT_FIELDS.get(purchase.plan)
                    if credit_field:
                        current = getattr(user, credit_field, 0)
                        setattr(user, credit_field, max(0, current - purchase.credits))
                        logger.info(
                            "[SyncPay Webhook] Refunded %d %s credit(s) from user %s",
                            purchase.credits, purchase.plan, user.username,
                        )
            await db.commit()
            return {"status": "refunded"}

        # Pending or other — just log
        else:
            logger.info("[SyncPay Webhook] Status=%s for purchase #%d (no action)", status, purchase.id)
            return {"status": "noted", "current_status": status}
