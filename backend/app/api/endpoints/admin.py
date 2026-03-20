"""Admin endpoints — god-eye view: manage users, see all activity."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from pydantic import BaseModel

from app.db.session import get_db
from app.models.user import User
from app.models.job import CloneJob
from app.models.job_log import CloneJobLog
from app.api.deps import require_auth
from app.services.auth_service import _hash_password, create_user

router = APIRouter(prefix="/admin", tags=["admin"])


# ---- Helpers ----

async def _require_admin(username: str, db: AsyncSession) -> User:
    """Load user and verify they are admin."""
    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(401, "Usuário não encontrado")
    if not getattr(user, 'is_admin', False):
        raise HTTPException(403, "Acesso negado. Apenas administradores.")
    return user


# ---- Schemas ----

class CreateUserRequest(BaseModel):
    username: str
    password: str
    is_admin: bool = False
    credits_basic: int = 0
    credits_standard: int = 0
    credits_premium: int = 0


class UpdateUserRequest(BaseModel):
    password: str | None = None
    is_admin: bool | None = None
    credits_basic: int | None = None
    credits_standard: int | None = None
    credits_premium: int | None = None


# ---- Endpoints ----

@router.get("/users")
async def list_users(
    username: str = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """List all users with their job counts and credit totals."""
    await _require_admin(username, db)

    result = await db.execute(select(User).order_by(User.created_at.desc()))
    users = result.scalars().all()

    user_list = []
    for u in users:
        # Count jobs per user
        job_count_result = await db.execute(
            select(func.count(CloneJob.id)).where(CloneJob.user_id == u.id)
        )
        job_count = job_count_result.scalar() or 0

        # Count running jobs
        running_result = await db.execute(
            select(func.count(CloneJob.id))
            .where(CloneJob.user_id == u.id)
            .where(CloneJob.status.in_(["running", "pending", "validating"]))
        )
        active_jobs = running_result.scalar() or 0

        user_list.append({
            "id": u.id,
            "username": u.username,
            "is_admin": getattr(u, 'is_admin', False),
            "credits_basic": u.credits_basic,
            "credits_standard": u.credits_standard,
            "credits_premium": u.credits_premium,
            "total_credits": u.credits_basic + u.credits_standard + u.credits_premium,
            "total_jobs": job_count,
            "active_jobs": active_jobs,
            "created_at": u.created_at.isoformat() if u.created_at else None,
        })

    return {"data": user_list}


@router.get("/users/{user_id}")
async def get_user_detail(
    user_id: int,
    username: str = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """God-eye: full detail of a user — credits, all jobs, recent activity."""
    await _require_admin(username, db)

    target = await db.get(User, user_id)
    if not target:
        raise HTTPException(404, "Usuário não encontrado")

    # Get all jobs for this user
    jobs_result = await db.execute(
        select(CloneJob)
        .where(CloneJob.user_id == user_id)
        .order_by(CloneJob.created_at.desc())
        .limit(50)
    )
    jobs = jobs_result.scalars().all()

    # Get recent logs from this user's jobs
    job_ids = [j.id for j in jobs]
    recent_logs = []
    if job_ids:
        logs_result = await db.execute(
            select(CloneJobLog)
            .where(CloneJobLog.job_id.in_(job_ids))
            .order_by(CloneJobLog.created_at.desc())
            .limit(30)
        )
        for log in logs_result.scalars().all():
            recent_logs.append({
                "id": log.id,
                "job_id": log.job_id,
                "level": log.level,
                "message": log.message,
                "details": log.details,
                "created_at": log.created_at.isoformat() if log.created_at else None,
            })

    # Job stats
    total_messages = sum(j.processed_count for j in jobs)
    total_errors = sum(j.error_count for j in jobs)

    jobs_data = []
    for j in jobs:
        jobs_data.append({
            "id": j.id,
            "name": j.name,
            "source_title": j.source_title,
            "destination_title": j.destination_title,
            "account_phone": j.account_phone,
            "mode": j.mode,
            "status": j.status,
            "total_messages": j.total_messages,
            "processed_count": j.processed_count,
            "error_count": j.error_count,
            "skipped_count": j.skipped_count,
            "created_at": j.created_at.isoformat() if j.created_at else None,
            "started_at": j.started_at.isoformat() if j.started_at else None,
            "finished_at": j.finished_at.isoformat() if j.finished_at else None,
        })

    return {
        "data": {
            "user": {
                "id": target.id,
                "username": target.username,
                "is_admin": getattr(target, 'is_admin', False),
                "credits_basic": target.credits_basic,
                "credits_standard": target.credits_standard,
                "credits_premium": target.credits_premium,
                "created_at": target.created_at.isoformat() if target.created_at else None,
            },
            "stats": {
                "total_jobs": len(jobs),
                "active_jobs": sum(1 for j in jobs if j.status in ("running", "pending", "validating")),
                "completed_jobs": sum(1 for j in jobs if j.status == "completed"),
                "failed_jobs": sum(1 for j in jobs if j.status == "failed"),
                "total_messages_processed": total_messages,
                "total_errors": total_errors,
            },
            "jobs": jobs_data,
            "recent_logs": recent_logs,
        }
    }


@router.post("/users")
async def admin_create_user(
    body: CreateUserRequest,
    username: str = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """Create a new user."""
    await _require_admin(username, db)

    if len(body.username) < 3:
        raise HTTPException(400, "Username deve ter pelo menos 3 caracteres")
    if len(body.password) < 6:
        raise HTTPException(400, "Senha deve ter pelo menos 6 caracteres")

    # Check if username exists
    existing = await db.execute(select(User).where(User.username == body.username))
    if existing.scalar_one_or_none():
        raise HTTPException(400, "Username já existe")

    user = User(
        username=body.username,
        password_hash=_hash_password(body.password),
        is_admin=body.is_admin,
        credits_basic=body.credits_basic,
        credits_standard=body.credits_standard,
        credits_premium=body.credits_premium,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    return {
        "data": {
            "id": user.id,
            "username": user.username,
            "is_admin": user.is_admin,
            "credits_basic": user.credits_basic,
            "credits_standard": user.credits_standard,
            "credits_premium": user.credits_premium,
            "created_at": user.created_at.isoformat() if user.created_at else None,
        },
        "message": f"Usuário {user.username} criado com sucesso",
    }


@router.patch("/users/{user_id}")
async def admin_update_user(
    user_id: int,
    body: UpdateUserRequest,
    username: str = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """Update a user — password, role, credits."""
    await _require_admin(username, db)

    target = await db.get(User, user_id)
    if not target:
        raise HTTPException(404, "Usuário não encontrado")

    if body.password is not None:
        if len(body.password) < 6:
            raise HTTPException(400, "Senha deve ter pelo menos 6 caracteres")
        target.password_hash = _hash_password(body.password)
    if body.is_admin is not None:
        target.is_admin = body.is_admin
    if body.credits_basic is not None:
        target.credits_basic = body.credits_basic
    if body.credits_standard is not None:
        target.credits_standard = body.credits_standard
    if body.credits_premium is not None:
        target.credits_premium = body.credits_premium

    await db.commit()
    return {
        "data": {
            "id": target.id,
            "username": target.username,
            "is_admin": getattr(target, 'is_admin', False),
            "credits_basic": target.credits_basic,
            "credits_standard": target.credits_standard,
            "credits_premium": target.credits_premium,
        },
        "message": "Usuário atualizado com sucesso",
    }


@router.delete("/users/{user_id}")
async def admin_delete_user(
    user_id: int,
    username: str = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """Delete a user."""
    admin = await _require_admin(username, db)

    target = await db.get(User, user_id)
    if not target:
        raise HTTPException(404, "Usuário não encontrado")

    if target.id == admin.id:
        raise HTTPException(400, "Você não pode excluir a si mesmo")

    # Check for active jobs
    active_result = await db.execute(
        select(func.count(CloneJob.id))
        .where(CloneJob.user_id == user_id)
        .where(CloneJob.status.in_(["running", "pending", "validating"]))
    )
    active_count = active_result.scalar() or 0
    if active_count > 0:
        raise HTTPException(400, f"Usuário possui {active_count} job(s) ativos. Cancele-os primeiro.")

    await db.delete(target)
    await db.commit()
    return {"data": None, "message": f"Usuário {target.username} excluído com sucesso"}
