"""Pix credit purchase endpoints — buy credits via SyncPay Pix."""
import json
import logging
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from pydantic import BaseModel

from app.db.session import get_db, async_session
from app.models.user import User
from app.models.credit_purchase import CreditPurchase
from app.models.setting import AppSetting
from app.api.deps import require_auth
from app.services import syncpay_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/pix", tags=["pix"])

# ---- Plans (defaults, overridden by DB) ----

DEFAULT_PLANS = {
    "basic": {
        "name": "Básico",
        "description": "1 crédito para grupos até 500 mensagens",
        "amount": 29.90,
        "credits": 1,
        "credit_field": "credits_basic",
        "active": True,
    },
    "standard": {
        "name": "Standard",
        "description": "1 crédito para grupos de 501 a 1.000 mensagens",
        "amount": 49.90,
        "credits": 1,
        "credit_field": "credits_standard",
        "active": True,
    },
    "premium": {
        "name": "Premium",
        "description": "1 crédito para grupos com +1.000 mensagens",
        "amount": 99.90,
        "credits": 1,
        "credit_field": "credits_premium",
        "active": True,
    },
}

CREDIT_FIELD_MAP = {
    "basic": "credits_basic",
    "standard": "credits_standard",
    "premium": "credits_premium",
}


async def _get_plans(db: AsyncSession) -> dict:
    """Get plans from DB, fallback to defaults."""
    result = await db.execute(
        select(AppSetting).where(AppSetting.key == "credit_plans")
    )
    setting = result.scalar_one_or_none()
    if setting and setting.value:
        try:
            plans = json.loads(setting.value)
            # Ensure credit_field is set
            for key in plans:
                if "credit_field" not in plans[key]:
                    plans[key]["credit_field"] = CREDIT_FIELD_MAP.get(key, f"credits_{key}")
                if "active" not in plans[key]:
                    plans[key]["active"] = True
            return plans
        except json.JSONDecodeError:
            pass
    return DEFAULT_PLANS


# ---- Schemas ----

class BuyCreditsRequest(BaseModel):
    plan: str  # basic | standard | premium


class UpdatePlansRequest(BaseModel):
    plans: dict


# ---- Endpoints ----

@router.get("/plans")
async def list_plans(db: AsyncSession = Depends(get_db)):
    """List available credit plans."""
    all_plans = await _get_plans(db)
    plans = []
    for key, plan in all_plans.items():
        if not plan.get("active", True):
            continue
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
    all_plans = await _get_plans(db)
    if body.plan not in all_plans:
        raise HTTPException(400, "Plano inválido")

    plan = all_plans[body.plan]
    if not plan.get("active", True):
        raise HTTPException(400, "Este plano está desativado")

    # Get user
    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(401, "Usuário não encontrado")

    # Create Pix via SyncPay with default client data
    try:
        syncpay_resp = await syncpay_service.create_pix(
            amount=plan["amount"],
            description=f"Cloner Grupo - Crédito {plan['name']}",
            client_name="Cliente Cloner",
            client_cpf="12345678900",
            client_email=user.username,
            client_phone="11999999999",
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
        customer_name=user.username,
        customer_email=user.username,
        customer_cpf=None,
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
                "plan_name": DEFAULT_PLANS.get(p.plan, {}).get("name", p.plan),
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


# ---- Admin: Manage Plans ----

@router.get("/admin/plans")
async def admin_get_plans(
    username: str = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """Admin: get all plans (including inactive)."""
    from app.api.endpoints.admin import _require_admin
    await _require_admin(username, db)
    plans = await _get_plans(db)
    return {"data": plans}


@router.post("/admin/plans")
async def admin_update_plans(
    body: UpdatePlansRequest,
    username: str = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """Admin: update plans (prices, names, active status)."""
    from app.api.endpoints.admin import _require_admin
    await _require_admin(username, db)

    # Validate
    for key, plan in body.plans.items():
        if "name" not in plan or "amount" not in plan:
            raise HTTPException(400, f"Plano '{key}' precisa de 'name' e 'amount'")
        if plan["amount"] <= 0:
            raise HTTPException(400, f"Valor do plano '{key}' deve ser maior que 0")
        # Ensure required fields
        plan.setdefault("credits", 1)
        plan.setdefault("description", "")
        plan.setdefault("active", True)
        plan["credit_field"] = CREDIT_FIELD_MAP.get(key, f"credits_{key}")

    # Save to DB
    plans_json = json.dumps(body.plans)
    result = await db.execute(
        select(AppSetting).where(AppSetting.key == "credit_plans")
    )
    setting = result.scalar_one_or_none()
    if setting:
        setting.value = plans_json
    else:
        db.add(AppSetting(key="credit_plans", value=plans_json))

    await db.commit()
    return {"data": body.plans, "message": "Planos atualizados com sucesso"}
