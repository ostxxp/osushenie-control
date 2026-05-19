from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_token, hash_password
from app.modules.auth.models import AuthSession, RevokedAccessToken
from app.modules.users.models import User
from app.modules.users.schemas import UserCreate

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(
        select(User).where(User.email == email)
    )

    return result.scalar_one_or_none()


async def create_user(db: AsyncSession, user_data: UserCreate) -> User:
    user = User(
        full_name=user_data.full_name,
        email=user_data.email,
        phone_number=user_data.phone_number,
        hashed_password=hash_password(user_data.password),
        role=user_data.role,
        is_active=user_data.is_active,
    )

    db.add(user)
    await db.commit()
    await db.refresh(user)

    return user

async def get_current_user(
    db: AsyncSession,
    token: str = Depends(oauth2_scheme),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = decode_token(token, expected_type="access")
        user_id = int(payload["sub"])
        session_id = str(payload["sid"])
        access_jti = str(payload["jti"])
    except (KeyError, TypeError, ValueError):
        raise credentials_exception

    revoked_result = await db.execute(
        select(RevokedAccessToken).where(RevokedAccessToken.jti == access_jti)
    )
    if revoked_result.scalar_one_or_none() is not None:
        raise credentials_exception

    session_result = await db.execute(
        select(AuthSession).where(
            AuthSession.id == session_id,
            AuthSession.user_id == user_id,
        )
    )
    auth_session = session_result.scalar_one_or_none()
    if auth_session is None or auth_session.revoked_at is not None:
        raise credentials_exception

    session_expires_at = auth_session.expires_at
    if session_expires_at.tzinfo is None:
        session_expires_at = session_expires_at.replace(tzinfo=timezone.utc)

    if session_expires_at <= datetime.now(timezone.utc):
        raise credentials_exception

    result = await db.execute(
        select(User).where(User.id == user_id)
    )

    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account is inactive.",
        )
    return user

async def user_exists(
    db: AsyncSession,
    user_id: int,
) -> bool:
    result = await db.execute(
        select(User).where(User.id == user_id)
    )

    return result.scalar_one_or_none() is not None
