from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from app.db.session import get_db
from app.models.entity import TelegramEntity
from app.models.account import TelegramAccount
from app.schemas.entity import EntityOut, ResolveEntityRequest
from app.schemas.common import ApiResponse
from app.services.entity_service import resolve_entity
from app.telegram.client_manager import ensure_connected

router = APIRouter(prefix="/entities", tags=["entities"])


@router.post("/resolve", response_model=ApiResponse[EntityOut])
async def resolve(req: ResolveEntityRequest, db: AsyncSession = Depends(get_db)):
    try:
        entity = await resolve_entity(req.identifier, req.account_id, db)
        return {"data": entity}
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Erro ao resolver entidade: {e}")


@router.get("", response_model=ApiResponse[list[EntityOut]])
async def list_entities(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(TelegramEntity).order_by(TelegramEntity.resolved_at.desc())
    )
    entities = result.scalars().all()
    return {"data": entities}


class VerifyGroupRequest(BaseModel):
    identifier: str
    account_id: int


class VerifyGroupResponse(BaseModel):
    title: str
    telegram_id: int
    message_count: int
    credit_tier: str  # basic, standard, premium
    credit_tier_label: str


@router.post("/verify-group")
async def verify_group(req: VerifyGroupRequest, db: AsyncSession = Depends(get_db)):
    """Count messages in a group and return which credit tier it needs."""
    # Resolve entity
    try:
        entity = await resolve_entity(req.identifier, req.account_id, db)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Erro ao resolver entidade: {e}")

    # Get account
    account = await db.get(TelegramAccount, req.account_id)
    if not account:
        raise HTTPException(400, "Conta não encontrada")

    # Connect and count messages
    try:
        client = await ensure_connected(account.phone)

        # Resolve peer
        tg_id = entity.telegram_id
        peer = None
        attempts = [tg_id]
        if tg_id > 0:
            attempts.append(int(f"-100{tg_id}"))
        elif str(tg_id).startswith("-100"):
            attempts.append(int(str(tg_id).replace("-100", "", 1)))

        for attempt in attempts:
            try:
                peer = await client.get_entity(attempt)
                break
            except Exception:
                continue

        if peer is None:
            raise ValueError(f"Não foi possível resolver a entidade (ID: {tg_id})")

        count = 0
        async for _ in client.iter_messages(peer):
            count += 1
            if count >= 50000:
                break

    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Erro ao contar mensagens: {str(e)}")

    # Determine tier
    if count <= 500:
        tier = "basic"
        label = "Básico (até 500 msgs)"
    elif count <= 1000:
        tier = "standard"
        label = "Standard (501-1000 msgs)"
    else:
        tier = "premium"
        label = "Premium (+1000 msgs)"

    return {
        "data": {
            "title": entity.title,
            "telegram_id": entity.telegram_id,
            "message_count": count,
            "credit_tier": tier,
            "credit_tier_label": label,
        }
    }
