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


class RegisterRequest(BaseModel):
    username: str
    password: str
    name: str | None = None


@router.post("/register")
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """Public registration — creates account + sends confirmation email via Supabase."""
    from app.services.supabase_auth import signup_for_confirmation

    username = body.username.strip().lower()
    if len(username) < 3:
        raise HTTPException(400, "Email deve ter pelo menos 3 caracteres")
    if "@" not in username:
        raise HTTPException(400, "Informe um email válido")
    if len(body.password) < 6:
        raise HTTPException(400, "Senha deve ter pelo menos 6 caracteres")

    # Check if exists in our DB
    existing = await db.execute(select(User).where(User.username == username))
    if existing.scalar_one_or_none():
        raise HTTPException(400, "Este email já está cadastrado")

    # Send confirmation email via Supabase Auth
    supa_result = await signup_for_confirmation(username, body.password)
    if "error" in supa_result:
        raise HTTPException(400, f"Erro ao enviar email de confirmação: {supa_result['error']}")

    # Create user in our DB (email not confirmed yet)
    user = User(
        username=username,
        password_hash=_hash_password(body.password),
        is_admin=False,
        credits_basic=0,
        credits_standard=0,
        credits_premium=0,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    return {
        "data": {"username": user.username, "email_sent": True},
        "message": "Conta criada! Verifique seu email para confirmar o cadastro.",
    }


@router.post("/login")
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    from app.services.supabase_auth import check_email_confirmed

    user = await auth_service.authenticate(db, body.username, body.password)
    if user is None:
        raise HTTPException(status_code=401, detail="Usuário ou senha incorretos")

    # Skip email check for admin
    if not getattr(user, 'is_admin', False):
        confirmed = await check_email_confirmed(body.username.strip().lower(), body.password)
        if not confirmed:
            raise HTTPException(
                status_code=403,
                detail="Email não confirmado. Verifique sua caixa de entrada e clique no link de confirmação.",
            )

    token = auth_service.generate_token(user.username)
    return {
        "data": {
            "token": token,
            "username": user.username,
            "is_admin": getattr(user, 'is_admin', False),
        },
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
            "is_admin": getattr(user, 'is_admin', False),
            "created_at": user.created_at.isoformat() if user.created_at else None,
            "credits_basic": getattr(user, 'credits_basic', 0),
            "credits_standard": getattr(user, 'credits_standard', 0),
            "credits_premium": getattr(user, 'credits_premium', 0),
        }
    }


class SetCreditsRequest(BaseModel):
    username: str
    credits_basic: int | None = None
    credits_standard: int | None = None
    credits_premium: int | None = None


@router.post("/set-credits")
async def set_credits(
    body: SetCreditsRequest,
    username: str = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.username == body.username))
    target_user = result.scalar_one_or_none()
    if target_user is None:
        raise HTTPException(404, "Usuário não encontrado")

    if body.credits_basic is not None:
        target_user.credits_basic = body.credits_basic
    if body.credits_standard is not None:
        target_user.credits_standard = body.credits_standard
    if body.credits_premium is not None:
        target_user.credits_premium = body.credits_premium

    await db.commit()
    return {
        "data": {
            "username": target_user.username,
            "credits_basic": target_user.credits_basic,
            "credits_standard": target_user.credits_standard,
            "credits_premium": target_user.credits_premium,
        },
        "message": "Créditos atualizados com sucesso",
    }


class AddCreditsRequest(BaseModel):
    username: str
    credits_basic: int = 0
    credits_standard: int = 0
    credits_premium: int = 0


@router.post("/add-credits")
async def add_credits(
    body: AddCreditsRequest,
    username: str = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """Add credits to a user (admin). Values can be negative to subtract."""
    result = await db.execute(select(User).where(User.username == body.username))
    target_user = result.scalar_one_or_none()
    if target_user is None:
        raise HTTPException(404, "Usuário não encontrado")

    target_user.credits_basic = max(0, target_user.credits_basic + body.credits_basic)
    target_user.credits_standard = max(0, target_user.credits_standard + body.credits_standard)
    target_user.credits_premium = max(0, target_user.credits_premium + body.credits_premium)

    await db.commit()
    return {
        "data": {
            "username": target_user.username,
            "credits_basic": target_user.credits_basic,
            "credits_standard": target_user.credits_standard,
            "credits_premium": target_user.credits_premium,
        },
        "message": "Créditos adicionados com sucesso",
    }
