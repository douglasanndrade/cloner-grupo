"""
Background worker — polls for pending/running jobs and starts the clone engine.
"""
import asyncio
from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import async_session
from app.models.job import CloneJob
from app.engine.clone_engine import CloneEngine
from app.services.log_service import log

# Active engines: job_id -> (CloneEngine, asyncio.Task)
_active_jobs: dict[int, tuple[CloneEngine, asyncio.Task]] = {}

_worker_task: asyncio.Task | None = None


async def _poll_loop():
    """Main worker loop — check for pending jobs every 5 seconds."""
    while True:
        try:
            # Clean up completed tasks first
            for job_id in list(_active_jobs.keys()):
                engine, task = _active_jobs[job_id]
                if task.done():
                    # Log any exception from the task
                    try:
                        task.result()
                    except Exception as e:
                        print(f"[Worker] Job {job_id} task finished with error: {e}")
                    del _active_jobs[job_id]

            async with async_session() as db:
                # Find pending jobs
                result = await db.execute(
                    select(CloneJob).where(CloneJob.status == "pending")
                )
                pending_jobs = result.scalars().all()

                for job in pending_jobs:
                    if job.id not in _active_jobs:
                        print(f"[Worker] Iniciando job {job.id}")
                        await _start_job(job.id)

                # Check for externally paused/cancelled jobs
                for job_id in list(_active_jobs.keys()):
                    if job_id not in _active_jobs:
                        continue
                    engine, task = _active_jobs[job_id]

                    # Check DB state
                    job = await db.get(CloneJob, job_id)
                    if job:
                        if job.status == "paused" and not engine._paused:
                            engine.request_pause()
                        elif job.status == "running" and engine._paused:
                            engine.request_resume()
                        elif job.status == "cancelled":
                            engine.request_cancel()

        except Exception as e:
            print(f"[Worker] Erro no loop: {e}")

        await asyncio.sleep(5)


async def _start_job(job_id: int):
    """Start a clone engine for a job."""
    engine = CloneEngine(job_id, async_session)
    task = asyncio.create_task(_run_engine(engine, job_id))
    _active_jobs[job_id] = (engine, task)


async def _run_engine(engine: CloneEngine, job_id: int):
    """Run engine and clean up on completion."""
    try:
        await engine.run()
    except Exception as e:
        async with async_session() as db:
            await log(db, "error", f"Engine crashed: {str(e)}", job_id=job_id)
            job = await db.get(CloneJob, job_id)
            if job and job.status == "running":
                job.status = "failed"
                job.finished_at = datetime.now(timezone.utc)
                await db.commit()
    finally:
        _active_jobs.pop(job_id, None)


def start_worker():
    """Start the background worker (call during app startup)."""
    global _worker_task
    if _worker_task is None or _worker_task.done():
        _worker_task = asyncio.create_task(_poll_loop())
        print("[Worker] Iniciado")


def stop_worker():
    """Stop the background worker."""
    global _worker_task
    if _worker_task and not _worker_task.done():
        _worker_task.cancel()
        _worker_task = None
        print("[Worker] Parado")

    # Cancel all active engines
    for job_id, (engine, task) in list(_active_jobs.items()):
        engine.request_cancel()
        task.cancel()
    _active_jobs.clear()


def get_active_job_ids() -> list[int]:
    """Return list of currently running job IDs."""
    return list(_active_jobs.keys())
