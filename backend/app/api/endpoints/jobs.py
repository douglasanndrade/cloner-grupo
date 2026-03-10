import math
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
import csv
import io

from app.db.session import get_db
from app.models.job import CloneJob
from app.models.job_item import CloneJobItem
from app.models.account import TelegramAccount
from app.schemas.job import JobOut, CreateJobRequest, JobItemOut
from app.schemas.common import ApiResponse, PaginatedResponse
from app.services.entity_service import resolve_entity

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.get("", response_model=PaginatedResponse[JobOut])
async def list_jobs(
    status: str | None = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    query = select(CloneJob)
    count_query = select(func.count(CloneJob.id))

    if status:
        query = query.where(CloneJob.status == status)
        count_query = count_query.where(CloneJob.status == status)

    # Total
    total = (await db.execute(count_query)).scalar() or 0
    total_pages = math.ceil(total / per_page) if total > 0 else 1

    # Data
    query = query.order_by(CloneJob.created_at.desc()).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(query)
    jobs = result.scalars().all()

    return {
        "data": jobs,
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": total_pages,
    }


@router.get("/{job_id}", response_model=ApiResponse[JobOut])
async def get_job(job_id: int, db: AsyncSession = Depends(get_db)):
    from app.models.entity import TelegramEntity
    job = await db.get(CloneJob, job_id)
    if not job:
        raise HTTPException(404, "Job não encontrado")
    # Enrich with telegram_ids for "Clonar Novamente"
    source_ent = await db.get(TelegramEntity, job.source_entity_id)
    dest_ent = await db.get(TelegramEntity, job.destination_entity_id)
    job_data = JobOut.model_validate(job).model_dump()
    job_data["source_telegram_id"] = source_ent.telegram_id if source_ent else None
    job_data["destination_telegram_id"] = dest_ent.telegram_id if dest_ent else None
    return {"data": job_data}


@router.post("", response_model=ApiResponse[JobOut])
async def create_job(req: CreateJobRequest, db: AsyncSession = Depends(get_db)):
    # Validate account
    account = await db.get(TelegramAccount, req.account_id)
    if not account:
        raise HTTPException(400, "Conta não encontrada")

    # Resolve source & dest
    try:
        source = await resolve_entity(req.source_identifier, req.account_id, db)
        dest = await resolve_entity(req.destination_identifier, req.account_id, db)
    except ValueError as e:
        raise HTTPException(400, str(e))

    # Parse optional dates
    date_from = None
    date_to = None
    if req.date_from:
        date_from = datetime.fromisoformat(req.date_from)
    if req.date_to:
        date_to = datetime.fromisoformat(req.date_to)

    job = CloneJob(
        name=req.name,
        source_entity_id=source.id,
        source_title=source.title,
        destination_entity_id=dest.id,
        destination_title=dest.title,
        account_id=account.id,
        account_phone=account.phone,
        mode=req.mode,
        import_history=req.import_history,
        monitor_new=req.monitor_new,
        send_interval_ms=req.send_interval_ms,
        max_concurrency=req.max_concurrency,
        temp_directory=req.temp_directory,
        oversized_policy=req.oversized_policy,
        date_from=date_from,
        date_to=date_to,
        notes=req.notes,
        status="awaiting_payment",
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)
    return {"data": job}


@router.post("/{job_id}/pause", response_model=ApiResponse[JobOut])
async def pause_job(job_id: int, db: AsyncSession = Depends(get_db)):
    job = await db.get(CloneJob, job_id)
    if not job:
        raise HTTPException(404, "Job não encontrado")
    if job.status != "running":
        raise HTTPException(400, "Job não está executando")
    job.status = "paused"
    await db.commit()
    await db.refresh(job)
    return {"data": job}


@router.post("/{job_id}/resume", response_model=ApiResponse[JobOut])
async def resume_job(job_id: int, db: AsyncSession = Depends(get_db)):
    job = await db.get(CloneJob, job_id)
    if not job:
        raise HTTPException(404, "Job não encontrado")
    if job.status not in ("paused", "failed"):
        raise HTTPException(400, "Job não está pausado ou falhou")
    job.status = "pending" if job.status == "failed" else "running"
    await db.commit()
    await db.refresh(job)
    return {"data": job}


@router.post("/{job_id}/cancel", response_model=ApiResponse[JobOut])
async def cancel_job(job_id: int, db: AsyncSession = Depends(get_db)):
    job = await db.get(CloneJob, job_id)
    if not job:
        raise HTTPException(404, "Job não encontrado")
    if job.status not in ("running", "paused", "pending"):
        raise HTTPException(400, "Job não pode ser cancelado neste estado")
    job.status = "cancelled"
    job.finished_at = datetime.utcnow()
    await db.commit()
    await db.refresh(job)
    return {"data": job}


@router.delete("/{job_id}")
async def delete_job(job_id: int, db: AsyncSession = Depends(get_db)):
    from app.models.payment import Payment
    job = await db.get(CloneJob, job_id)
    if not job:
        raise HTTPException(404, "Job não encontrado")
    if job.status in ("running", "validating"):
        raise HTTPException(400, "Não é possível excluir um job em execução. Cancele primeiro.")
    # Deletar payments vinculados antes de deletar o job
    result = await db.execute(select(Payment).where(Payment.job_id == job_id))
    for payment in result.scalars().all():
        await db.delete(payment)
    await db.delete(job)
    await db.commit()
    return {"data": None, "message": f"Job #{job_id} excluído com sucesso"}


@router.post("/{job_id}/clone-again", response_model=ApiResponse[JobOut])
async def clone_again(job_id: int, db: AsyncSession = Depends(get_db)):
    """Create a new job that continues from where the previous one left off."""
    original = await db.get(CloneJob, job_id)
    if not original:
        raise HTTPException(404, "Job não encontrado")
    if original.status not in ("completed", "failed", "cancelled"):
        raise HTTPException(400, "Job ainda está em execução")

    new_job = CloneJob(
        name=f"{original.name} (continuação)",
        source_entity_id=original.source_entity_id,
        source_title=original.source_title,
        destination_entity_id=original.destination_entity_id,
        destination_title=original.destination_title,
        account_id=original.account_id,
        account_phone=original.account_phone,
        mode=original.mode,
        import_history=original.import_history,
        monitor_new=original.monitor_new,
        send_interval_ms=original.send_interval_ms,
        max_concurrency=original.max_concurrency,
        temp_directory=original.temp_directory,
        oversized_policy=original.oversized_policy,
        # Start from where the last job stopped
        last_message_id=original.last_message_id,
        notes=f"Continuação do job #{original.id}",
        status="pending",
    )
    db.add(new_job)
    await db.commit()
    await db.refresh(new_job)
    return {"data": new_job, "message": f"Novo job criado a partir da mensagem #{original.last_message_id or 0}"}


@router.post("/{job_id}/reprocess-errors", response_model=ApiResponse[JobOut])
async def reprocess_errors(job_id: int, db: AsyncSession = Depends(get_db)):
    job = await db.get(CloneJob, job_id)
    if not job:
        raise HTTPException(404, "Job não encontrado")

    # Reset error items back to pending
    stmt = (
        select(CloneJobItem)
        .where(CloneJobItem.job_id == job_id)
        .where(CloneJobItem.status == "error")
    )
    result = await db.execute(stmt)
    error_items = result.scalars().all()

    for item in error_items:
        item.status = "pending"
        item.error_message = None

    job.error_count = 0
    job.status = "pending"
    await db.commit()
    await db.refresh(job)
    return {"data": job, "message": f"{len(error_items)} itens recolocados na fila"}


# ---- Items ----

@router.get("/{job_id}/items", response_model=PaginatedResponse[JobItemOut])
async def list_job_items(
    job_id: int,
    status: str | None = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    query = select(CloneJobItem).where(CloneJobItem.job_id == job_id)
    count_query = select(func.count(CloneJobItem.id)).where(CloneJobItem.job_id == job_id)

    if status:
        query = query.where(CloneJobItem.status == status)
        count_query = count_query.where(CloneJobItem.status == status)

    total = (await db.execute(count_query)).scalar() or 0
    total_pages = math.ceil(total / per_page) if total > 0 else 1

    query = query.order_by(CloneJobItem.source_message_id.desc()).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(query)
    items = result.scalars().all()

    return {
        "data": items,
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": total_pages,
    }


@router.get("/{job_id}/export-errors")
async def export_errors_csv(job_id: int, db: AsyncSession = Depends(get_db)):
    stmt = (
        select(CloneJobItem)
        .where(CloneJobItem.job_id == job_id)
        .where(CloneJobItem.status.in_(["error", "incompatible"]))
        .order_by(CloneJobItem.source_message_id)
    )
    result = await db.execute(stmt)
    items = result.scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["message_id", "media_type", "media_size", "status", "error_message"])
    for item in items:
        writer.writerow([
            item.source_message_id,
            item.media_type or "",
            item.media_size or "",
            item.status,
            item.error_message or "",
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=job_{job_id}_errors.csv"},
    )
