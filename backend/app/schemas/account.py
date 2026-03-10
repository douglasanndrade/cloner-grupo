from pydantic import BaseModel
from datetime import datetime


class AccountOut(BaseModel):
    id: int
    phone: str
    username: str | None
    first_name: str | None
    last_name: str | None
    is_premium: bool
    is_active: bool
    session_file: str
    created_at: datetime
    updated_at: datetime
    notes: str | None

    model_config = {"from_attributes": True}


class LoginStartRequest(BaseModel):
    phone: str


class LoginStartResponse(BaseModel):
    phone_code_hash: str
    step: str  # "code"


class LoginCodeRequest(BaseModel):
    phone: str
    code: str
    phone_code_hash: str


class LoginCodeResponse(BaseModel):
    step: str  # "done" or "2fa"
    account: AccountOut | None = None


class Login2FARequest(BaseModel):
    phone: str
    password: str


class Login2FAResponse(BaseModel):
    account: AccountOut


class PremiumToggle(BaseModel):
    is_premium: bool


class AccountStatusOut(BaseModel):
    is_active: bool
    is_premium: bool
