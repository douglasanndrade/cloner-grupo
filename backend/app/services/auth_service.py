import hashlib
import secrets
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.user import User

# In-memory token store: token -> username
# Simple approach — tokens survive until server restart
_active_tokens: dict[str, str] = {}


def _hash_password(password: str, salt: str | None = None) -> str:
    """Hash password with SHA-256 + salt."""
    if salt is None:
        salt = secrets.token_hex(16)
    hashed = hashlib.sha256(f"{salt}:{password}".encode()).hexdigest()
    return f"{salt}${hashed}"


def _verify_password(password: str, stored_hash: str) -> bool:
    """Verify password against stored hash."""
    salt, _ = stored_hash.split("$", 1)
    return _hash_password(password, salt) == stored_hash


def generate_token(username: str) -> str:
    """Generate a new auth token."""
    token = secrets.token_hex(32)
    _active_tokens[token] = username
    return token


def validate_token(token: str) -> str | None:
    """Validate token, return username or None."""
    return _active_tokens.get(token)


def revoke_token(token: str) -> None:
    """Revoke a token."""
    _active_tokens.pop(token, None)


async def authenticate(db: AsyncSession, username: str, password: str) -> User | None:
    """Authenticate user, return User or None."""
    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    if user is None:
        return None
    if not _verify_password(password, user.password_hash):
        return None
    return user


async def create_user(db: AsyncSession, username: str, password: str, is_admin: bool = False) -> User:
    """Create a new user."""
    user = User(
        username=username,
        password_hash=_hash_password(password),
        is_admin=is_admin,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def get_user_count(db: AsyncSession) -> int:
    """Count total users."""
    from sqlalchemy import func
    result = await db.execute(select(func.count()).select_from(User))
    return result.scalar() or 0


async def ensure_default_user(db: AsyncSession) -> None:
    """Create default admin user if no users exist."""
    count = await get_user_count(db)
    if count == 0:
        await create_user(db, "douglasanndrade@gmail.com", "#Pedro123", is_admin=True)
    else:
        # Ensure first user is admin
        result = await db.execute(select(User).order_by(User.id).limit(1))
        first_user = result.scalar_one_or_none()
        if first_user and not getattr(first_user, 'is_admin', False):
            first_user.is_admin = True
            await db.commit()
