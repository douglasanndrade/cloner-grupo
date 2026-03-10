"""Payment endpoints — scan messages, generate checkout, check status."""
import secrets
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from app.db.session import get_db
from app.models.job import CloneJob
from app.models.payment import Payment
from app.models.setting import AppSetting
from app.models.entity import TelegramEntity
from app.telegram.client_manager import ensure_connected

router = APIRouter(prefix="/payments", tags=["payments"])


# ---- Pricing plans ----

PLANS = {
    "basic": {
        "name": "Básico",
        "max_messages": 500,
        "amount": 2990,  # R$ 29,90
        "amount_formatted": "R$ 29,90",
    },
    "standard": {
        "name": "Padrão",
        "max_messages": 1000,
        "amount": 4990,  # R$ 49,90
        "amount_formatted": "R$ 49,90",
    },
    "premium": {
        "name": "Premium",
        "max_messages": 999999999,  # unlimited
        "amount": 9990,  # R$ 99,90
        "amount_formatted": "R$ 99,90",
    },
}

# Checkout URLs — configured via settings or hardcoded
# Will be updated when user provides the 3 MundPay checkout links
DEFAULT_CHECKOUT_URLS = {
    "basic": "",
    "standard": "",
    "premium": "",
}


async def _get_checkout_urls(db: AsyncSession) -> dict[str, str]:
    """Get checkout URLs from app settings, fallback to defaults."""
    urls = dict(DEFAULT_CHECKOUT_URLS)
    for plan_key in ["basic", "standard", "premium"]:
        setting_key = f"checkout_url_{plan_key}"
        result = await db.execute(
            select(AppSetting).where(AppSetting.key == setting_key)
        )
        setting = result.scalar_one_or_none()
        if setting and setting.value:
            urls[plan_key] = setting.value
    return urls


def _get_plan_for_count(count: int) -> str:
    """Determine which plan fits the message count."""
    if count <= 500:
        return "basic"
    elif count <= 1000:
        return "standard"
    else:
        return "premium"


class ScanResponse(BaseModel):
    job_id: int
    message_count: int
    plan: str
    plan_name: str
    amount: int
    amount_formatted: str


class CheckoutResponse(BaseModel):
    checkout_url: str
    tracking_ref: str
    payment_id: int


class PaymentStatusResponse(BaseModel):
    payment_id: int
    status: str
    plan: str
    amount_formatted: str
    job_status: str


@router.post("/{job_id}/scan")
async def scan_messages(job_id: int, db: AsyncSession = Depends(get_db)):
    """Count messages in the source and return pricing info."""
    job = await db.get(CloneJob, job_id)
    if not job:
        raise HTTPException(404, "Job não encontrado")

    # Load the actual Telegram ID from the entity table
    source_entity = await db.get(TelegramEntity, job.source_entity_id)
    if not source_entity:
        raise HTTPException(400, "Entidade de origem não encontrada")

    # Connect to Telegram and count messages
    try:
        client = await ensure_connected(job.account_phone)

        # Tenta resolver o entity com múltiplos formatos
        tg_id = source_entity.telegram_id
        entity = None
        attempts = [tg_id]
        if tg_id > 0:
            attempts.append(int(f"-100{tg_id}"))
        elif str(tg_id).startswith("-100"):
            attempts.append(int(str(tg_id).replace("-100", "", 1)))

        for attempt in attempts:
            try:
                entity = await client.get_entity(attempt)
                break
            except Exception:
                continue

        if entity is None:
            raise ValueError(f"Não foi possível resolver a entidade de origem (ID: {tg_id})")

        # Count messages (respecting date filters)
        kwargs = {}
        if job.date_from:
            kwargs["offset_date"] = job.date_from
        if job.last_message_id:
            kwargs["min_id"] = job.last_message_id

        count = 0
        async for _ in client.iter_messages(entity, **kwargs):
            count += 1
            if count >= 50000:
                break

    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Erro ao escanear mensagens: {str(e)}")

    # Update job with total
    job.total_messages = count

    # Determine plan
    plan_key = _get_plan_for_count(count)
    plan = PLANS[plan_key]

    await db.commit()

    return {
        "data": ScanResponse(
            job_id=job.id,
            message_count=count,
            plan=plan_key,
            plan_name=plan["name"],
            amount=plan["amount"],
            amount_formatted=plan["amount_formatted"],
        )
    }


@router.post("/{job_id}/checkout")
async def generate_checkout(job_id: int, db: AsyncSession = Depends(get_db)):
    """Generate a checkout URL with unique tracking ref."""
    job = await db.get(CloneJob, job_id)
    if not job:
        raise HTTPException(404, "Job não encontrado")

    if job.status != "awaiting_payment":
        raise HTTPException(400, "Job não está aguardando pagamento")

    # Check if there's already a pending payment
    result = await db.execute(
        select(Payment)
        .where(Payment.job_id == job_id)
        .where(Payment.status == "pending")
    )
    existing = result.scalar_one_or_none()

    if existing:
        # Reuse existing payment
        checkout_urls = await _get_checkout_urls(db)
        url = checkout_urls.get(existing.plan, "")
        if url:
            url = f"{url}?src={existing.tracking_ref}"
        return {
            "data": CheckoutResponse(
                checkout_url=url,
                tracking_ref=existing.tracking_ref,
                payment_id=existing.id,
            )
        }

    # Determine plan from message count
    plan_key = _get_plan_for_count(job.total_messages)
    plan = PLANS[plan_key]

    # Generate unique tracking ref
    tracking_ref = f"txn_{secrets.token_hex(12)}"

    # Create payment record
    payment = Payment(
        job_id=job.id,
        tracking_ref=tracking_ref,
        plan=plan_key,
        amount=plan["amount"],
        message_count=job.total_messages,
        status="pending",
    )
    db.add(payment)
    await db.commit()
    await db.refresh(payment)

    # Build checkout URL
    checkout_urls = await _get_checkout_urls(db)
    url = checkout_urls.get(plan_key, "")
    if url:
        separator = "&" if "?" in url else "?"
        url = f"{url}{separator}src={tracking_ref}"
    payment.checkout_url = url
    await db.commit()

    return {
        "data": CheckoutResponse(
            checkout_url=url,
            tracking_ref=tracking_ref,
            payment_id=payment.id,
        )
    }


@router.get("/{job_id}/status")
async def payment_status(job_id: int, db: AsyncSession = Depends(get_db)):
    """Check payment status for a job."""
    job = await db.get(CloneJob, job_id)
    if not job:
        raise HTTPException(404, "Job não encontrado")

    result = await db.execute(
        select(Payment)
        .where(Payment.job_id == job_id)
        .order_by(Payment.created_at.desc())
    )
    payment = result.scalars().first()

    if not payment:
        return {
            "data": {
                "payment_id": None,
                "status": "no_payment",
                "plan": _get_plan_for_count(job.total_messages),
                "amount_formatted": PLANS[_get_plan_for_count(job.total_messages)]["amount_formatted"],
                "job_status": job.status,
            }
        }

    return {
        "data": PaymentStatusResponse(
            payment_id=payment.id,
            status=payment.status,
            plan=payment.plan,
            amount_formatted=PLANS.get(payment.plan, PLANS["basic"])["amount_formatted"],
            job_status=job.status,
        )
    }


@router.post("/{job_id}/mark-paid")
async def mark_paid_manually(job_id: int, db: AsyncSession = Depends(get_db)):
    """Admin: manually mark a payment as paid (for testing or manual confirmation)."""
    job = await db.get(CloneJob, job_id)
    if not job:
        raise HTTPException(404, "Job não encontrado")

    result = await db.execute(
        select(Payment)
        .where(Payment.job_id == job_id)
        .where(Payment.status == "pending")
    )
    payment = result.scalar_one_or_none()

    if not payment:
        raise HTTPException(400, "Nenhum pagamento pendente encontrado")

    from datetime import datetime
    payment.status = "paid"
    payment.paid_at = datetime.utcnow()
    payment.customer_name = "Admin (manual)"

    if job.status == "awaiting_payment":
        job.status = "pending"

    await db.commit()
    return {"data": None, "message": f"Pagamento #{payment.id} confirmado manualmente. Job liberado."}
