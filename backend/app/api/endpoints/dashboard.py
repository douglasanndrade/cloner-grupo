from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.db.session import get_db
from app.models.job import CloneJob
from app.models.job_log import CloneJobLog
from app.models.account import TelegramAccount
from app.schemas.dashboard import DashboardStatsOut
from app.schemas.common import ApiResponse

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

ALL_STATUSES = ["pending", "validating", "running", "paused", "completed", "failed", "cancelled"]


@router.get("/stats", response_model=ApiResponse[DashboardStatsOut])
async def dashboard_stats(db: AsyncSession = Depends(get_db)):
    # Jobs by status
    jobs_by_status = {}
    for status in ALL_STATUSES:
        count = (await db.execute(
            select(func.count(CloneJob.id)).where(CloneJob.status == status)
        )).scalar() or 0
        jobs_by_status[status] = count

    total_jobs = sum(jobs_by_status.values())
    active_jobs = jobs_by_status.get("running", 0)
    completed_jobs = jobs_by_status.get("completed", 0)

    # Total messages processed
    total_processed = (await db.execute(
        select(func.sum(CloneJob.processed_count))
    )).scalar() or 0

    # Success rate
    total_with_results = (await db.execute(
        select(func.sum(CloneJob.processed_count + CloneJob.error_count))
    )).scalar() or 0
    success_rate = round((total_processed / total_with_results * 100), 1) if total_with_results > 0 else 100.0

    # Active accounts
    active_accounts = (await db.execute(
        select(func.count(TelegramAccount.id)).where(TelegramAccount.is_active == True)
    )).scalar() or 0

    # Recent errors
    recent_errors_result = await db.execute(
        select(CloneJobLog)
        .where(CloneJobLog.level.in_(["error", "warning"]))
        .order_by(CloneJobLog.created_at.desc())
        .limit(10)
    )
    recent_errors = recent_errors_result.scalars().all()

    return {
        "data": {
            "active_jobs": active_jobs,
            "completed_jobs": completed_jobs,
            "total_jobs": total_jobs,
            "total_messages_processed": total_processed,
            "success_rate": success_rate,
            "active_accounts": active_accounts,
            "recent_errors": recent_errors,
            "jobs_by_status": jobs_by_status,
        }
    }
