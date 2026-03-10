from pydantic import BaseModel
from datetime import datetime


class EntityOut(BaseModel):
    id: int
    telegram_id: int
    title: str
    username: str | None
    entity_type: str
    members_count: int | None
    photo_url: str | None
    resolved_at: datetime

    model_config = {"from_attributes": True}


class ResolveEntityRequest(BaseModel):
    identifier: str  # numeric ID, @username, or t.me/link
    account_id: int
