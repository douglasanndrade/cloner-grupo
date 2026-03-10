from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
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
