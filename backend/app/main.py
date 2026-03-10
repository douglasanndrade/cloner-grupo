from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.api.endpoints.ws import router as ws_router
from app.core.config import settings
from app.telegram.client_manager import disconnect_all
from app.engine.worker import start_worker, stop_worker


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    settings.ensure_dirs()
    # Create default admin user if none exists
    from app.db.session import async_session
    from app.services.auth_service import ensure_default_user
    async with async_session() as db:
        await ensure_default_user(db)
    # Start background worker
    if settings.worker_enabled:
        start_worker()
    yield
    # Shutdown
    stop_worker()
    await disconnect_all()


app = FastAPI(
    title="Cloner Grupo",
    description="Telegram Group/Channel Cloner API",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — allow frontend (dev + production)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include all API routes
app.include_router(api_router)

# WebSocket routes (no auth required — uses job_id)
app.include_router(ws_router)


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "service": "cloner-grupo"}
