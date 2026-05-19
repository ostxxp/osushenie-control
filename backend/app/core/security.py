from datetime import datetime, timedelta, timezone
from hashlib import sha256
from typing import Any
from uuid import uuid4

from jose import JWTError, jwt

from passlib.context import CryptContext

from app.core.config import settings


password_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto",
)


def hash_password(password: str) -> str:
    return password_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return password_context.verify(plain_password, hashed_password)


def hash_token(token: str) -> str:
    return sha256(token.encode("utf-8")).hexdigest()


def create_access_token(subject: str, session_id: str) -> tuple[str, str, datetime]:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    jti = str(uuid4())
    payload = {
        "sub": subject,
        "type": "access",
        "sid": session_id,
        "jti": jti,
        "exp": expire,
    }
    token = jwt.encode(
        payload,
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )
    return token, jti, expire


def create_refresh_token(subject: str, session_id: str) -> tuple[str, str, datetime]:
    expire = datetime.now(timezone.utc) + timedelta(
        days=settings.REFRESH_TOKEN_EXPIRE_DAYS
    )
    jti = str(uuid4())
    payload = {
        "sub": subject,
        "type": "refresh",
        "sid": session_id,
        "jti": jti,
        "exp": expire,
    }
    token = jwt.encode(
        payload,
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )
    return token, jti, expire


def decode_token(token: str, expected_type: str | None = None) -> dict[str, Any]:
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
        )
    except JWTError as error:
        raise ValueError("Invalid token") from error

    token_type = payload.get("type")
    if expected_type is not None and token_type != expected_type:
        raise ValueError("Invalid token type")

    return payload


def get_payload_expires_at(payload: dict[str, Any]) -> datetime:
    exp = payload.get("exp")

    if isinstance(exp, datetime):
        return exp

    if isinstance(exp, int | float):
        return datetime.fromtimestamp(exp, tz=timezone.utc)

    raise ValueError("Token expiration is missing")
