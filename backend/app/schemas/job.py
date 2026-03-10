from pydantic import BaseModel
from datetime import datetime


class JobOut(BaseModel):
    id: int
    name: str
    source_entity_id: int
    source_title: str
    destination_entity_id: int
    destination_title: str
    account_id: int
    account_phone: str
    mode: str
    status: str
    import_history: bool
    monitor_new: bool
    last_message_id: int | None
    total_messages: int
    processed_count: int
    error_count: int
    skipped_count: int
    incompatible_count: int
    started_at: datetime | None
    finished_at: datetime | None
    created_at: datetime
    updated_at: datetime
    send_interval_ms: int
    max_concurrency: int
    temp_directory: str
    oversized_policy: str
    notes: str | None

    model_config = {"from_attributes": True}


class CreateJobRequest(BaseModel):
    name: str
    source_identifier: str
    destination_identifier: str
    account_id: int
    mode: str  # forward | reupload
    import_history: bool = True
    monitor_new: bool = True
    send_interval_ms: int = 1000
    max_concurrency: int = 1
    temp_directory: str = "/tmp/cloner"
    oversized_policy: str = "skip"
    date_from: str | None = None
    date_to: str | None = None
    notes: str | None = None


class JobItemOut(BaseModel):
    id: int
    job_id: int
    source_message_id: int
    grouped_id: str | None
    media_type: str | None
    media_size: int | None
    status: str
    error_message: str | None
    destination_message_id: int | None
    processed_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}
