from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import select
from app.services.auth_service import validate_token

_bearer = HTTPBearer(auto_error=False)


async def require_auth(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> str:
    """FastAPI dependency — returns username or raises 401."""
    if credentials is None:
        raise HTTPException(status_code=401, detail="Token de autenticação não fornecido")
    username = validate_token(credentials.credentials)
    if username is None:
        raise HTTPException(status_code=401, detail="Token inválido ou expirado")
    return username


async def require_admin(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> str:
    """FastAPI dependency — returns username or raises 403 if not admin."""
    if credentials is None:
        raise HTTPException(status_code=401, detail="Token de autenticação não fornecido")
    username = validate_token(credentials.credentials)
    if username is None:
        raise HTTPException(status_code=401, detail="Token inválido ou expirado")

    from app.db.session import async_session
    from app.models.user import User
    async with async_session() as db:
        result = await db.execute(select(User).where(User.username == username))
        user = result.scalar_one_or_none()
        if not user or not getattr(user, 'is_admin', False):
            raise HTTPException(status_code=403, detail="Acesso restrito a administradores")

    return username
