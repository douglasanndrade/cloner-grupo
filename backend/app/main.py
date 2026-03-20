from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.api.endpoints.ws import router as ws_router
from app.core.config import settings
from app.telegram.client_manager import disconnect_all
from app.engine.worker import start_worker, stop_worker


async def ensure_db_columns():
    """Ensure new columns exist in tables."""
    from sqlalchemy import text
    from app.db.session import async_session

    async with async_session() as db:
        try:
            await db.execute(text("""
                ALTER TABLE users ADD COLUMN IF NOT EXISTS credits_basic INTEGER NOT NULL DEFAULT 0;
            """))
            await db.execute(text("""
                ALTER TABLE users ADD COLUMN IF NOT EXISTS credits_standard INTEGER NOT NULL DEFAULT 0;
            """))
            await db.execute(text("""
                ALTER TABLE users ADD COLUMN IF NOT EXISTS credits_premium INTEGER NOT NULL DEFAULT 0;
            """))
            await db.execute(text("""
                ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;
            """))
            await db.execute(text("""
                ALTER TABLE clone_jobs ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);
            """))
            # Create credit_purchases table if not exists
            await db.execute(text("""
                CREATE TABLE IF NOT EXISTS credit_purchases (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users(id),
                    plan VARCHAR(20) NOT NULL,
                    credits INTEGER DEFAULT 1,
                    amount DOUBLE PRECISION NOT NULL,
                    syncpay_identifier VARCHAR(128) UNIQUE NOT NULL,
                    pix_code TEXT,
                    status VARCHAR(20) DEFAULT 'pending',
                    customer_name VARCHAR(256),
                    customer_email VARCHAR(256),
                    customer_cpf VARCHAR(20),
                    end_to_end VARCHAR(128),
                    paid_at TIMESTAMPTZ,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
            """))
            await db.commit()
            print("[STARTUP] DB columns ensured")
        except Exception as e:
            print(f"[STARTUP] DB column check warning: {e}")
            await db.rollback()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    settings.ensure_dirs()
    # Ensure database schema is up to date
    await ensure_db_columns()
    # Create default admin user if none exists, and ensure credits
    from app.db.session import async_session
    from app.services.auth_service import ensure_default_user
    from sqlalchemy import text
    async with async_session() as db:
        await ensure_default_user(db)
        # Set 50 credits for users that have 0 of all (first-time setup)
        try:
            await db.execute(text("""
                UPDATE users
                SET credits_basic = 50, credits_standard = 50, credits_premium = 50
                WHERE credits_basic = 0 AND credits_standard = 0 AND credits_premium = 0
            """))
            await db.commit()
        except Exception:
            await db.rollback()
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
