from pydantic import BaseModel
from datetime import datetime


class LogOut(BaseModel):
    id: int
    job_id: int | None
    level: str
    message: str
    details: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
