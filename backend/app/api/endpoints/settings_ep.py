from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.schemas.settings import AppSettingsOut, AppSettingsUpdate
from app.schemas.common import ApiResponse
from app.services.settings_service import get_all_settings, update_settings

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("", response_model=ApiResponse[AppSettingsOut])
async def get_settings(db: AsyncSession = Depends(get_db)):
    data = await get_all_settings(db)
    return {"data": data}


@router.patch("", response_model=ApiResponse[AppSettingsOut])
async def patch_settings(body: AppSettingsUpdate, db: AsyncSession = Depends(get_db)):
    updates = body.model_dump(exclude_none=True)
    data = await update_settings(db, updates)
    return {"data": data}
