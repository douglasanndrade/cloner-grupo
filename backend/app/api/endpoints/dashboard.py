from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.db.session import get_db
from app.models.job import CloneJob
from app.models.job_log import CloneJobLog
from app.models.account import TelegramAccount
from app.models.user import User
from app.schemas.dashboard import DashboardStatsOut
from app.schemas.common import ApiResponse
from app.api.deps import require_auth

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

ALL_STATUSES = ["pending", "validating", "running", "paused", "completed", "failed", "cancelled"]


@router.get("/stats", response_model=ApiResponse[DashboardStatsOut])
async def dashboard_stats(
    username: str = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    # Get user to check admin status and get user_id
    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    is_admin = user and getattr(user, 'is_admin', False)

    # Base filter: admin sees all, lead sees own jobs
    def _filter(q):
        if not is_admin and user:
            return q.where(CloneJob.user_id == user.id)
        return q

    # Jobs by status
    jobs_by_status = {}
    for status in ALL_STATUSES:
        count = (await db.execute(
            _filter(select(func.count(CloneJob.id)).where(CloneJob.status == status))
        )).scalar() or 0
        jobs_by_status[status] = count

    total_jobs = sum(jobs_by_status.values())
    active_jobs = jobs_by_status.get("running", 0)
    completed_jobs = jobs_by_status.get("completed", 0)

    # Total messages processed
    total_processed = (await db.execute(
        _filter(select(func.sum(CloneJob.processed_count)))
    )).scalar() or 0

    # Success rate
    total_with_results = (await db.execute(
        _filter(select(func.sum(CloneJob.processed_count + CloneJob.error_count)))
    )).scalar() or 0
    success_rate = round((total_processed / total_with_results * 100), 1) if total_with_results > 0 else 100.0

    # Active accounts (admin only)
    active_accounts = 0
    if is_admin:
        active_accounts = (await db.execute(
            select(func.count(TelegramAccount.id)).where(TelegramAccount.is_active == True)
        )).scalar() or 0

    # Recent errors (filtered by user's jobs)
    errors_query = select(CloneJobLog).where(CloneJobLog.level.in_(["error", "warning"]))
    if not is_admin and user:
        # Get user's job ids
        job_ids_result = await db.execute(
            select(CloneJob.id).where(CloneJob.user_id == user.id)
        )
        user_job_ids = [r[0] for r in job_ids_result.all()]
        if user_job_ids:
            errors_query = errors_query.where(CloneJobLog.job_id.in_(user_job_ids))
        else:
            errors_query = errors_query.where(CloneJobLog.id < 0)  # no results

    recent_errors_result = await db.execute(
        errors_query.order_by(CloneJobLog.created_at.desc()).limit(10)
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
