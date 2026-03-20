"""Pix credit purchase endpoints — buy credits via SyncPay Pix."""
import logging
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from pydantic import BaseModel

from app.db.session import get_db, async_session
from app.models.user import User
from app.models.credit_purchase import CreditPurchase
from app.api.deps import require_auth
from app.services import syncpay_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/pix", tags=["pix"])

# ---- Plans ----

CREDIT_PLANS = {
    "basic": {
        "name": "Básico",
        "description": "1 crédito para grupos até 500 mensagens",
        "amount": 29.90,
        "credits": 1,
        "credit_field": "credits_basic",
    },
    "standard": {
        "name": "Standard",
        "description": "1 crédito para grupos de 501 a 1.000 mensagens",
        "amount": 49.90,
        "credits": 1,
        "credit_field": "credits_standard",
    },
    "premium": {
        "name": "Premium",
        "description": "1 crédito para grupos com +1.000 mensagens",
        "amount": 99.90,
        "credits": 1,
        "credit_field": "credits_premium",
    },
}


# ---- Schemas ----

class BuyCreditsRequest(BaseModel):
    plan: str  # basic | standard | premium
    name: str
    cpf: str
    email: str
    phone: str


# ---- Endpoints ----

@router.get("/plans")
async def list_plans():
    """List available credit plans."""
    plans = []
    for key, plan in CREDIT_PLANS.items():
        plans.append({
            "id": key,
            "name": plan["name"],
            "description": plan["description"],
            "amount": plan["amount"],
            "amount_formatted": f"R$ {plan['amount']:.2f}".replace(".", ","),
            "credits": plan["credits"],
        })
    return {"data": plans}


@router.post("/buy")
async def buy_credits(
    body: BuyCreditsRequest,
    username: str = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """Create a Pix payment to buy credits."""
    if body.plan not in CREDIT_PLANS:
        raise HTTPException(400, "Plano inválido")

    plan = CREDIT_PLANS[body.plan]

    # Get user
    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(401, "Usuário não encontrado")

    # Validate CPF (11 digits)
    cpf = body.cpf.replace(".", "").replace("-", "").replace(" ", "")
    if len(cpf) != 11 or not cpf.isdigit():
        raise HTTPException(400, "CPF inválido. Use 11 dígitos.")

    # Validate phone
    phone = body.phone.replace("(", "").replace(")", "").replace("-", "").replace(" ", "").replace("+", "")
    if len(phone) < 10:
        raise HTTPException(400, "Telefone inválido")

    # Create Pix via SyncPay
    try:
        syncpay_resp = await syncpay_service.create_pix(
            amount=plan["amount"],
            description=f"Cloner Grupo - Crédito {plan['name']}",
            client_name=body.name,
            client_cpf=cpf,
            client_email=body.email,
            client_phone=phone,
        )
    except Exception as e:
        logger.error("[Pix] SyncPay error: %s", e)
        raise HTTPException(500, f"Erro ao gerar Pix: {str(e)}")

    # Save purchase record
    purchase = CreditPurchase(
        user_id=user.id,
        plan=body.plan,
        credits=plan["credits"],
        amount=plan["amount"],
        syncpay_identifier=syncpay_resp["identifier"],
        pix_code=syncpay_resp.get("pix_code"),
        customer_name=body.name,
        customer_email=body.email,
        customer_cpf=cpf,
        status="pending",
    )
    db.add(purchase)
    await db.commit()
    await db.refresh(purchase)

    return {
        "data": {
            "purchase_id": purchase.id,
            "plan": body.plan,
            "plan_name": plan["name"],
            "amount": plan["amount"],
            "amount_formatted": f"R$ {plan['amount']:.2f}".replace(".", ","),
            "pix_code": syncpay_resp.get("pix_code", ""),
            "identifier": syncpay_resp["identifier"],
            "status": "pending",
        },
        "message": "Pix gerado com sucesso! Escaneie o QR Code ou copie o código.",
    }


@router.get("/purchases")
async def list_purchases(
    username: str = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """List user's credit purchases."""
    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(401, "Usuário não encontrado")

    result = await db.execute(
        select(CreditPurchase)
        .where(CreditPurchase.user_id == user.id)
        .order_by(desc(CreditPurchase.created_at))
        .limit(20)
    )
    purchases = result.scalars().all()

    return {
        "data": [
            {
                "id": p.id,
                "plan": p.plan,
                "plan_name": CREDIT_PLANS.get(p.plan, {}).get("name", p.plan),
                "credits": p.credits,
                "amount": p.amount,
                "amount_formatted": f"R$ {p.amount:.2f}".replace(".", ","),
                "status": p.status,
                "pix_code": p.pix_code,
                "created_at": p.created_at.isoformat() if p.created_at else None,
                "paid_at": p.paid_at.isoformat() if p.paid_at else None,
            }
            for p in purchases
        ]
    }


@router.get("/purchases/{purchase_id}/status")
async def check_purchase_status(
    purchase_id: int,
    username: str = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """Check the status of a specific purchase."""
    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(401, "Usuário não encontrado")

    purchase = await db.get(CreditPurchase, purchase_id)
    if not purchase or purchase.user_id != user.id:
        raise HTTPException(404, "Compra não encontrada")

    return {
        "data": {
            "id": purchase.id,
            "status": purchase.status,
            "plan": purchase.plan,
            "credits": purchase.credits,
        }
    }
