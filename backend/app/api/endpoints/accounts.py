from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db
from app.models.account import TelegramAccount
from app.models.user import User
from app.schemas.account import (
    AccountOut, LoginStartRequest, LoginStartResponse,
    LoginCodeRequest, LoginCodeResponse,
    Login2FARequest, Login2FAResponse,
    PremiumToggle, AccountStatusOut,
)
from app.schemas.common import ApiResponse
from app.telegram.auth_service import start_login, verify_code, verify_2fa
from app.telegram.client_manager import ensure_connected, disconnect_client
from app.api.deps import require_auth

router = APIRouter(prefix="/accounts", tags=["accounts"])


async def _get_user(username: str, db: AsyncSession) -> User:
    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(401, "Usuário não encontrado")
    return user


async def _get_own_account(account_id: int, user: User, db: AsyncSession) -> TelegramAccount:
    """Get account, checking ownership for non-admins."""
    account = await db.get(TelegramAccount, account_id)
    if not account:
        raise HTTPException(404, "Conta não encontrada")
    if not getattr(user, 'is_admin', False) and account.user_id != user.id:
        raise HTTPException(404, "Conta não encontrada")
    return account


@router.get("", response_model=ApiResponse[list[AccountOut]])
async def list_accounts(
    username: str = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    user = await _get_user(username, db)
    query = select(TelegramAccount).order_by(TelegramAccount.created_at.desc())
    if not getattr(user, 'is_admin', False):
        query = query.where(TelegramAccount.user_id == user.id)
    result = await db.execute(query)
    accounts = result.scalars().all()
    return {"data": accounts}


@router.get("/{account_id}", response_model=ApiResponse[AccountOut])
async def get_account(
    account_id: int,
    username: str = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    user = await _get_user(username, db)
    account = await _get_own_account(account_id, user, db)
    return {"data": account}


@router.post("/login/start", response_model=ApiResponse[LoginStartResponse])
async def login_start(req: LoginStartRequest, db: AsyncSession = Depends(get_db)):
    try:
        result = await start_login(req.phone)
        return {"data": result}
    except Exception as e:
        raise HTTPException(400, str(e))


@router.post("/login/code", response_model=ApiResponse[LoginCodeResponse])
async def login_code(
    req: LoginCodeRequest,
    username: str = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    user = await _get_user(username, db)
    try:
        result = await verify_code(req.phone, req.code, req.phone_code_hash, db, user_id=user.id)
        return {"data": result}
    except Exception as e:
        raise HTTPException(400, str(e))


@router.post("/login/2fa", response_model=ApiResponse[Login2FAResponse])
async def login_2fa(
    req: Login2FARequest,
    username: str = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    user = await _get_user(username, db)
    try:
        result = await verify_2fa(req.phone, req.password, db, user_id=user.id)
        return {"data": result}
    except Exception as e:
        raise HTTPException(400, str(e))


@router.patch("/{account_id}/premium", response_model=ApiResponse[AccountOut])
async def toggle_premium(
    account_id: int,
    body: PremiumToggle,
    username: str = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    user = await _get_user(username, db)
    account = await _get_own_account(account_id, user, db)
    account.is_premium = body.is_premium
    await db.commit()
    await db.refresh(account)
    return {"data": account}


@router.get("/{account_id}/status", response_model=ApiResponse[AccountStatusOut])
async def check_status(
    account_id: int,
    username: str = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    user = await _get_user(username, db)
    account = await _get_own_account(account_id, user, db)

    try:
        client = await ensure_connected(account.phone)
        me = await client.get_me()
        is_premium = getattr(me, "premium", False) or False
        account.is_active = True
        account.is_premium = is_premium
        await db.commit()
        return {"data": {"is_active": True, "is_premium": is_premium}}
    except Exception:
        account.is_active = False
        await db.commit()
        return {"data": {"is_active": False, "is_premium": account.is_premium}}


@router.get("/{account_id}/dialogs")
async def list_dialogs(
    account_id: int,
    username: str = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """List all groups/channels the account is a member of."""
    user = await _get_user(username, db)
    account = await _get_own_account(account_id, user, db)

    try:
        client = await ensure_connected(account.phone)
        from telethon.tl.types import Channel, Chat
        dialogs = []
        async for d in client.iter_dialogs():
            entity = d.entity
            if isinstance(entity, Channel):
                dialogs.append({
                    "id": entity.id,
                    "telegram_id": int(f"-100{entity.id}"),
                    "title": entity.title or "",
                    "username": getattr(entity, "username", None),
                    "type": "channel" if entity.broadcast else "group",
                    "members_count": getattr(entity, "participants_count", None),
                })
            elif isinstance(entity, Chat):
                dialogs.append({
                    "id": entity.id,
                    "telegram_id": -entity.id,
                    "title": entity.title or "",
                    "username": None,
                    "type": "group",
                    "members_count": getattr(entity, "participants_count", None),
                })
        return {"data": dialogs}
    except Exception as e:
        raise HTTPException(500, f"Erro ao listar grupos: {str(e)}")


@router.delete("/{account_id}", response_model=ApiResponse[None])
async def remove_account(
    account_id: int,
    username: str = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    user = await _get_user(username, db)
    account = await _get_own_account(account_id, user, db)

    await disconnect_client(account.phone)
    await db.delete(account)
    await db.commit()
    return {"data": None, "message": "Conta removida"}
