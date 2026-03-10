from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db
from app.models.entity import TelegramEntity
from app.schemas.entity import EntityOut, ResolveEntityRequest
from app.schemas.common import ApiResponse
from app.services.entity_service import resolve_entity

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
