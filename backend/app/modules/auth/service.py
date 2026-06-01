from datetime import datetime, timezone
from hmac import compare_digest
from uuid import uuid4

from fastapi import HTTPException, Request, Response, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    get_payload_expires_at,
    hash_token,
)
from app.modules.auth.models import AuthSession, RevokedAccessToken
from app.modules.users.models import User


def get_access_token_expires_in() -> int:
    return settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60


def extract_bearer_token(authorization: str | None) -> str | None:
    if authorization is None:
        return None

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None

    return token


def set_refresh_cookie(
    response: Response,
    refresh_token: str,
    expires_at: datetime,
) -> None:
    max_age = max(int((expires_at - _utcnow()).total_seconds()), 0)
    response.set_cookie(
        key=settings.REFRESH_TOKEN_COOKIE_NAME,
        value=refresh_token,
        max_age=max_age,
        httponly=True,
        secure=settings.REFRESH_TOKEN_COOKIE_SECURE,
        samesite=settings.REFRESH_TOKEN_COOKIE_SAMESITE,
        path=settings.REFRESH_TOKEN_COOKIE_PATH,
    )


def clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        key=settings.REFRESH_TOKEN_COOKIE_NAME,
        secure=settings.REFRESH_TOKEN_COOKIE_SECURE,
        samesite=settings.REFRESH_TOKEN_COOKIE_SAMESITE,
        path=settings.REFRESH_TOKEN_COOKIE_PATH,
    )


async def create_session_tokens(
    db: AsyncSession,
    user: User,
    request: Request,
) -> tuple[str, str, datetime]:
    session_id = str(uuid4())
    access_token, _, _ = create_access_token(
        subject=str(user.id),
        session_id=session_id,
    )
    refresh_token, refresh_jti, refresh_expires_at = create_refresh_token(
        subject=str(user.id),
        session_id=session_id,
    )

    auth_session = AuthSession(
        id=session_id,
        user_id=user.id,
        refresh_token_hash=hash_token(refresh_token),
        refresh_token_jti=refresh_jti,
        user_agent=request.headers.get("user-agent"),
        ip_address=_get_request_ip(request),
        expires_at=refresh_expires_at,
    )
    db.add(auth_session)
    await db.commit()

    return access_token, refresh_token, refresh_expires_at


async def rotate_refresh_session(
    db: AsyncSession,
    refresh_token: str | None,
    request: Request,
) -> tuple[str, str, datetime]:
    if not refresh_token:
        raise _invalid_credentials()

    payload = _decode_refresh_payload(refresh_token)
    user_id, session_id, refresh_jti = _get_required_token_claims(payload)

    result = await db.execute(
        select(AuthSession).where(
            AuthSession.id == session_id,
            AuthSession.user_id == user_id,
        )
    )
    auth_session = result.scalar_one_or_none()
    now = _utcnow()

    if auth_session is None or auth_session.revoked_at is not None:
        raise _invalid_credentials()

    if _ensure_aware(auth_session.expires_at) <= now:
        auth_session.revoked_at = now
        await db.commit()
        raise _invalid_credentials()

    refresh_hash_matches = compare_digest(
        auth_session.refresh_token_hash,
        hash_token(refresh_token),
    )
    refresh_jti_matches = compare_digest(
        auth_session.refresh_token_jti,
        refresh_jti,
    )
    if not refresh_hash_matches or not refresh_jti_matches:
        auth_session.revoked_at = now
        await db.commit()
        raise _invalid_credentials()

    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if user is None or not user.is_active:
        auth_session.revoked_at = now
        await db.commit()
        raise _invalid_credentials()

    access_token, _, _ = create_access_token(
        subject=str(user.id),
        session_id=auth_session.id,
    )
    new_refresh_token, new_refresh_jti, refresh_expires_at = create_refresh_token(
        subject=str(user.id),
        session_id=auth_session.id,
    )

    auth_session.refresh_token_hash = hash_token(new_refresh_token)
    auth_session.refresh_token_jti = new_refresh_jti
    auth_session.expires_at = refresh_expires_at
    auth_session.last_used_at = now
    auth_session.user_agent = request.headers.get("user-agent")
    auth_session.ip_address = _get_request_ip(request)
    await db.commit()

    return access_token, new_refresh_token, refresh_expires_at


async def revoke_access_token(
    db: AsyncSession,
    access_token: str | None,
) -> None:
    if not access_token:
        return

    try:
        payload = decode_token(access_token, expected_type="access")
        user_id, session_id, access_jti = _get_required_token_claims(payload)
        expires_at = get_payload_expires_at(payload)
    except ValueError:
        return

    if _ensure_aware(expires_at) <= _utcnow():
        return

    existing = await db.get(RevokedAccessToken, access_jti)
    if existing is None:
        db.add(
            RevokedAccessToken(
                jti=access_jti,
                user_id=user_id,
                session_id=session_id,
                expires_at=expires_at,
            )
        )

    auth_session = await db.get(AuthSession, session_id)
    if auth_session is not None and auth_session.revoked_at is None:
        auth_session.revoked_at = _utcnow()


async def revoke_refresh_session(
    db: AsyncSession,
    refresh_token: str | None,
) -> None:
    if not refresh_token:
        return

    try:
        payload = decode_token(refresh_token, expected_type="refresh")
        user_id, session_id, _ = _get_required_token_claims(payload)
    except ValueError:
        return

    result = await db.execute(
        select(AuthSession).where(
            AuthSession.id == session_id,
            AuthSession.user_id == user_id,
        )
    )
    auth_session = result.scalar_one_or_none()
    if auth_session is not None and auth_session.revoked_at is None:
        auth_session.revoked_at = _utcnow()


async def revoke_all_user_sessions(db: AsyncSession, user_id: int) -> None:
    await db.execute(
        update(AuthSession)
        .where(
            AuthSession.user_id == user_id,
            AuthSession.revoked_at.is_(None),
        )
        .values(revoked_at=_utcnow())
    )


def _decode_refresh_payload(refresh_token: str) -> dict:
    try:
        return decode_token(refresh_token, expected_type="refresh")
    except ValueError as error:
        raise _invalid_credentials() from error


def _get_required_token_claims(payload: dict) -> tuple[int, str, str]:
    try:
        user_id = int(payload["sub"])
        session_id = str(payload["sid"])
        jti = str(payload["jti"])
    except (KeyError, TypeError, ValueError) as error:
        raise ValueError("Token is missing required claims") from error

    return user_id, session_id, jti


def _invalid_credentials() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Неправильный токен",
        headers={"WWW-Authenticate": "Bearer"},
    )


def _get_request_ip(request: Request) -> str | None:
    if request.client is None:
        return None

    return request.client.host


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _ensure_aware(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)

    return value.astimezone(timezone.utc)
