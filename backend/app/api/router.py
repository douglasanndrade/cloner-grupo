from fastapi import APIRouter, Depends
from app.api.endpoints import accounts, entities, jobs, logs, dashboard, settings_ep, auth, payments, webhooks, admin, pix
from app.api.deps import require_auth, require_admin

api_router = APIRouter(prefix="/api")

# Public routes (no token required)
api_router.include_router(auth.router)
api_router.include_router(webhooks.router)  # SyncPay webhook — must be public

# Protected routes — any logged-in user
api_router.include_router(entities.router, dependencies=[Depends(require_auth)])
api_router.include_router(jobs.router, dependencies=[Depends(require_auth)])
api_router.include_router(dashboard.router, dependencies=[Depends(require_auth)])
api_router.include_router(pix.router, dependencies=[Depends(require_auth)])
api_router.include_router(accounts.router, dependencies=[Depends(require_auth)])

# Admin-only routes
api_router.include_router(payments.router, dependencies=[Depends(require_admin)])
api_router.include_router(logs.router, dependencies=[Depends(require_admin)])
api_router.include_router(settings_ep.router, dependencies=[Depends(require_admin)])
api_router.include_router(admin.router, dependencies=[Depends(require_admin)])
