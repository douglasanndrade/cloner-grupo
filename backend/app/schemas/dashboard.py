from pydantic import BaseModel
from app.schemas.log import LogOut


class DashboardStatsOut(BaseModel):
    active_jobs: int
    completed_jobs: int
    total_jobs: int
    total_messages_processed: int
    success_rate: float
    active_accounts: int
    recent_errors: list[LogOut]
    jobs_by_status: dict[str, int]
