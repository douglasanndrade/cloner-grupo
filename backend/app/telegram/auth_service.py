"""
Telegram authentication service.
Handles: phone → send code → verify code → (optional) 2FA password.
"""
from telethon import errors
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.account import TelegramAccount
from app.telegram.client_manager import (
    get_login_client,
    promote_login_client,
    get_session_file,
)


async def start_login(phone: str) -> dict:
    """
    Step 1: Send verification code to the phone number.
    Returns phone_code_hash needed for step 2.
    """
    client = get_login_client(phone)

    if not client.is_connected():
        await client.connect()

    result = await client.send_code_request(phone)
    return {
        "phone_code_hash": result.phone_code_hash,
        "step": "code",
    }


async def verify_code(phone: str, code: str, phone_code_hash: str, db: AsyncSession, *, user_id: int | None = None) -> dict:
    """
    Step 2: Verify the code sent to Telegram.
    If 2FA is enabled, returns step="2fa".
    Otherwise creates the account and returns step="done".
    """
    client = get_login_client(phone)

    if not client.is_connected():
        await client.connect()

    try:
        await client.sign_in(phone, code, phone_code_hash=phone_code_hash)
    except errors.SessionPasswordNeededError:
        return {"step": "2fa", "account": None}

    # Success — save account
    account = await _save_account(client, phone, db, user_id=user_id)
    promote_login_client(phone)
    return {"step": "done", "account": account}


async def verify_2fa(phone: str, password: str, db: AsyncSession, *, user_id: int | None = None) -> dict:
    """
    Step 3: Verify 2FA password.
    """
    client = get_login_client(phone)

    if not client.is_connected():
        await client.connect()

    await client.sign_in(password=password)

    account = await _save_account(client, phone, db, user_id=user_id)
    promote_login_client(phone)
    return {"account": account}


async def _save_account(client, phone: str, db: AsyncSession, *, user_id: int | None = None) -> TelegramAccount:
    """
    After successful login, fetch user info and save/update in DB.
    """
    me = await client.get_me()

    # Normalize phone for matching (strip spaces, ensure +)
    normalized = phone.replace(" ", "").replace("-", "")

    # Check if account already exists by phone OR telegram_id
    stmt = select(TelegramAccount).where(
        (TelegramAccount.phone == phone) |
        (TelegramAccount.phone == normalized) |
        (TelegramAccount.telegram_id == me.id)
    )
    result = await db.execute(stmt)
    accounts = result.scalars().all()

    # If multiple duplicates exist, keep only the first and delete rest
    account = accounts[0] if accounts else None
    if len(accounts) > 1:
        for dup in accounts[1:]:
            await db.delete(dup)
        await db.flush()

    is_premium = getattr(me, "premium", False) or False

    if account:
        account.phone = normalized
        account.username = me.username
        account.first_name = me.first_name
        account.last_name = me.last_name
        account.telegram_id = me.id
        account.is_premium = is_premium
        account.is_active = True
        account.session_file = get_session_file(phone)
        if user_id and not account.user_id:
            account.user_id = user_id
    else:
        account = TelegramAccount(
            phone=normalized,
            user_id=user_id,
            username=me.username,
            first_name=me.first_name,
            last_name=me.last_name,
            telegram_id=me.id,
            is_premium=is_premium,
            is_active=True,
            session_file=get_session_file(phone),
        )
        db.add(account)

    await db.commit()
    await db.refresh(account)
    return account
