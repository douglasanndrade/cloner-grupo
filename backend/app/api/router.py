from fastapi import APIRouter, Depends
from app.api.endpoints import accounts, entities, jobs, logs, dashboard, settings_ep, auth, payments, webhooks, admin, pix
from app.api.deps import require_auth

api_router = APIRouter(prefix="/api")

# Public routes (no token required)
api_router.include_router(auth.router)
api_router.include_router(webhooks.router)  # MundPay webhook — must be public

# Protected routes — require valid token
api_router.include_router(accounts.router, dependencies=[Depends(require_auth)])
api_router.include_router(entities.router, dependencies=[Depends(require_auth)])
api_router.include_router(jobs.router, dependencies=[Depends(require_auth)])
api_router.include_router(payments.router, dependencies=[Depends(require_auth)])
api_router.include_router(logs.router, dependencies=[Depends(require_auth)])
api_router.include_router(dashboard.router, dependencies=[Depends(require_auth)])
api_router.include_router(settings_ep.router, dependencies=[Depends(require_auth)])
api_router.include_router(admin.router, dependencies=[Depends(require_auth)])
api_router.include_router(pix.router, dependencies=[Depends(require_auth)])
