from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from app.db.session import get_db
from app.services import auth_service
from app.services.auth_service import _hash_password, _verify_password
from app.models.user import User
from app.api.deps import require_auth

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    token: str
    username: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@router.post("/login")
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    user = await auth_service.authenticate(db, body.username, body.password)
    if user is None:
        raise HTTPException(status_code=401, detail="Usuário ou senha incorretos")

    token = auth_service.generate_token(user.username)
    return {
        "data": LoginResponse(token=token, username=user.username),
        "message": "Login realizado com sucesso",
    }


@router.post("/change-password")
async def change_password(
    body: ChangePasswordRequest,
    username: str = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(404, "Usuário não encontrado")

    if not _verify_password(body.current_password, user.password_hash):
        raise HTTPException(400, "Senha atual incorreta")

    if len(body.new_password) < 6:
        raise HTTPException(400, "A nova senha deve ter pelo menos 6 caracteres")

    user.password_hash = _hash_password(body.new_password)
    await db.commit()
    return {"data": None, "message": "Senha alterada com sucesso"}


@router.get("/me")
async def get_me(
    username: str = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(404, "Usuário não encontrado")
    return {
        "data": {
            "username": user.username,
            "created_at": user.created_at.isoformat() if user.created_at else None,
        }
    }
