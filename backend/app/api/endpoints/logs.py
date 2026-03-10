import math
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.db.session import get_db
from app.models.job_log import CloneJobLog
from app.schemas.log import LogOut
from app.schemas.common import PaginatedResponse

router = APIRouter(prefix="/logs", tags=["logs"])


@router.get("", response_model=PaginatedResponse[LogOut])
async def list_logs(
    job_id: int | None = None,
    level: str | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    query = select(CloneJobLog)
    count_query = select(func.count(CloneJobLog.id))

    if job_id is not None:
        query = query.where(CloneJobLog.job_id == job_id)
        count_query = count_query.where(CloneJobLog.job_id == job_id)

    if level:
        query = query.where(CloneJobLog.level == level)
        count_query = count_query.where(CloneJobLog.level == level)

    if from_date:
        query = query.where(CloneJobLog.created_at >= from_date)
        count_query = count_query.where(CloneJobLog.created_at >= from_date)

    if to_date:
        query = query.where(CloneJobLog.created_at <= to_date)
        count_query = count_query.where(CloneJobLog.created_at <= to_date)

    total = (await db.execute(count_query)).scalar() or 0
    total_pages = math.ceil(total / per_page) if total > 0 else 1

    query = query.order_by(CloneJobLog.created_at.desc()).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(query)
    logs = result.scalars().all()

    return {
        "data": logs,
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": total_pages,
    }
