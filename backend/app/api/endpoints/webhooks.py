"""SyncPay webhook endpoint — public (no auth required).
Handles both OLD and NEW API formats from SyncPay.
"""
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

# Status mapping — both OLD and NEW API
_PAID_STATUSES = {"completed", "PAID_OUT"}
_PENDING_STATUSES = {"pending", "WAITING_FOR_APPROVAL"}
_FAILED_STATUSES = {"failed", "refunded", "med", "FAILED", "EXPIRED"}


@router.post("/syncpay")
async def syncpay_webhook(request: Request):
    """
    Receives payment webhooks from SyncPay (OLD + NEW API).
    OLD API: data.id, data.idtransaction, data.status (PAID_OUT/WAITING_FOR_APPROVAL)
    NEW API: data.id, data.status (pending/completed/failed/refunded/med)
    """
    body = await request.json()
    event = request.headers.get("event", "")
    data = body.get("data", body)  # Some formats wrap in data, some don't

    # Extract IDs — try both formats
    txn_id = data.get("id") or data.get("idtransaction") or ""
    alt_id = data.get("idtransaction") or data.get("externalreference") or ""
    status = str(data.get("status", "")).strip()
    amount = data.get("amount", 0)

    # Client info — NEW API uses 'client', OLD uses flat fields + debtor_account
    client = data.get("client", {}) or {}
    debtor = data.get("debtor_account", {}) or {}
    customer_name = client.get("name") or data.get("client_name") or debtor.get("name")
    customer_email = client.get("email") or data.get("client_email")
    end_to_end = data.get("end_to_end", "")

    logger.info(
        "[SyncPay Webhook] event=%s status=%s id=%s alt_id=%s amount=%s",
        event, status, txn_id, alt_id, amount,
    )

    if not txn_id and not alt_id:
        return {"status": "ignored", "reason": "no transaction id"}

    # Determine payment state
    is_paid = status in _PAID_STATUSES
    is_pending = status in _PENDING_STATUSES
    is_failed = status in _FAILED_STATUSES

    # OLD API: cashin.create can arrive with PAID_OUT (payment already confirmed)
    if event.lower() == "cashin.create" and is_paid:
        logger.info("[SyncPay Webhook] cashin.create with paid status — processing as payment")

    async with async_session() as db:
        # Find purchase by SyncPay identifier — try multiple IDs
        purchase = None
        for search_id in [txn_id, alt_id]:
            if not search_id:
                continue
            result = await db.execute(
                select(CreditPurchase).where(CreditPurchase.syncpay_identifier == search_id)
            )
            purchase = result.scalar_one_or_none()
            if purchase:
                break

        if purchase is None:
            logger.warning("[SyncPay Webhook] Purchase not found for id=%s alt_id=%s", txn_id, alt_id)
            return {"status": "not_found", "identifiers": [txn_id, alt_id]}

        if purchase.status == "completed":
            logger.info("[SyncPay Webhook] Purchase #%d already completed", purchase.id)
            return {"status": "already_processed"}

        # ── PAID ──
        if is_paid:
            purchase.status = "completed"
            purchase.paid_at = datetime.utcnow()
            purchase.end_to_end = end_to_end or None
            if customer_name:
                purchase.customer_name = customer_name
            if customer_email:
                purchase.customer_email = customer_email

            # Add credits to user
            user = await db.get(User, purchase.user_id)
            if user:
                credit_field = _CREDIT_FIELDS.get(purchase.plan)
                if credit_field:
                    current = getattr(user, credit_field, 0)
                    setattr(user, credit_field, current + purchase.credits)
                    logger.info(
                        "[SyncPay Webhook] +%d %s credit(s) to %s (now %d)",
                        purchase.credits, purchase.plan, user.username,
                        current + purchase.credits,
                    )

                # Log
                plan_labels = {"basic": "Básico", "standard": "Standard", "premium": "Premium"}
                db.add(CloneJobLog(
                    job_id=None,
                    level="success",
                    message=f"[PIX PAGO] R$ {purchase.amount:.2f} — {purchase.credits}x {plan_labels.get(purchase.plan, purchase.plan)} — {user.username}",
                    details=f"purchase_id={purchase.id} end_to_end={end_to_end}",
                ))

            await db.commit()
            logger.info("[SyncPay Webhook] Purchase #%d PAID — credits added", purchase.id)
            return {"status": "ok", "purchase_id": purchase.id}

        # ── FAILED ──
        if is_failed:
            purchase.status = "failed"
            await db.commit()
            logger.info("[SyncPay Webhook] Purchase #%d failed/refunded", purchase.id)
            return {"status": "failed"}

        # ── PENDING / other ──
        logger.info("[SyncPay Webhook] status=%s for purchase #%d (no action)", status, purchase.id)
        return {"status": "noted", "current_status": status}
