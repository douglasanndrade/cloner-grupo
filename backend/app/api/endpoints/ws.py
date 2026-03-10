"""WebSocket endpoint for real-time job logs."""
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select, desc
from app.db.session import async_session
from app.models.job_log import CloneJobLog

router = APIRouter()

# Connected WebSocket clients: job_id -> set of WebSocket
_connections: dict[int, set[WebSocket]] = {}


async def broadcast_log(job_id: int, log_entry: dict):
    """Broadcast a log entry to all connected clients for a job."""
    if job_id not in _connections:
        return
    disconnected = set()
    for ws in _connections[job_id]:
        try:
            await ws.send_json(log_entry)
        except Exception:
            disconnected.add(ws)
    _connections[job_id] -= disconnected
    if not _connections[job_id]:
        del _connections[job_id]


@router.websocket("/ws/jobs/{job_id}/logs")
async def job_logs_ws(websocket: WebSocket, job_id: int):
    await websocket.accept()

    # Register connection
    if job_id not in _connections:
        _connections[job_id] = set()
    _connections[job_id].add(websocket)

    try:
        # Send recent logs on connect
        async with async_session() as db:
            result = await db.execute(
                select(CloneJobLog)
                .where(CloneJobLog.job_id == job_id)
                .order_by(desc(CloneJobLog.created_at))
                .limit(50)
            )
            recent_logs = result.scalars().all()
            for log_entry in reversed(recent_logs):
                await websocket.send_json({
                    "id": log_entry.id,
                    "level": log_entry.level,
                    "message": log_entry.message,
                    "details": log_entry.details,
                    "created_at": log_entry.created_at.isoformat() if log_entry.created_at else None,
                })

        # Poll for new logs
        last_id = recent_logs[0].id if recent_logs else 0
        while True:
            await asyncio.sleep(2)
            async with async_session() as db:
                result = await db.execute(
                    select(CloneJobLog)
                    .where(CloneJobLog.job_id == job_id)
                    .where(CloneJobLog.id > last_id)
                    .order_by(CloneJobLog.id)
                )
                new_logs = result.scalars().all()
                for log_entry in new_logs:
                    await websocket.send_json({
                        "id": log_entry.id,
                        "level": log_entry.level,
                        "message": log_entry.message,
                        "details": log_entry.details,
                        "created_at": log_entry.created_at.isoformat() if log_entry.created_at else None,
                    })
                    last_id = log_entry.id

    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        if job_id in _connections:
            _connections[job_id].discard(websocket)
            if not _connections[job_id]:
                del _connections[job_id]
