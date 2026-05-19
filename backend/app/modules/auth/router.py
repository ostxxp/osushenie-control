from fastapi import APIRouter, Cookie, Depends, Header, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import verify_password
from app.db.session import get_db_session as get_db
from app.modules.auth.schemas import TokenResponse
from app.modules.auth.service import (
    clear_refresh_cookie,
    create_session_tokens,
    extract_bearer_token,
    get_access_token_expires_in,
    revoke_access_token,
    revoke_all_user_sessions,
    revoke_refresh_session,
    rotate_refresh_session,
    set_refresh_cookie,
)
from app.modules.users.dependencies import get_current_auth_user
from app.modules.users.models import User
from app.modules.users.service import get_user_by_email
from fastapi.security import OAuth2PasswordRequestForm


router = APIRouter()


@router.post("/login", response_model=TokenResponse)
async def login(
    response: Response,
    request: Request,
    login_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    user = await get_user_by_email(db, login_data.username)

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not verify_password(login_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is inactive",
        )

    access_token, refresh_token, refresh_expires_at = await create_session_tokens(
        db=db,
        user=user,
        request=request,
    )
    set_refresh_cookie(response, refresh_token, refresh_expires_at)

    return TokenResponse(
        access_token=access_token,
        expires_in=get_access_token_expires_in(),
    )


@router.post("/refresh", response_model=TokenResponse, summary="Refresh access token")
async def refresh(
    response: Response,
    request: Request,
    refresh_token: str | None = Cookie(
        default=None,
        alias=settings.REFRESH_TOKEN_COOKIE_NAME,
    ),
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    access_token, new_refresh_token, refresh_expires_at = await rotate_refresh_session(
        db=db,
        refresh_token=refresh_token,
        request=request,
    )
    set_refresh_cookie(response, new_refresh_token, refresh_expires_at)

    return TokenResponse(
        access_token=access_token,
        expires_in=get_access_token_expires_in(),
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT, summary="Logout from the current session")
async def logout(
    response: Response,
    authorization: str | None = Header(default=None),
    refresh_token: str | None = Cookie(
        default=None,
        alias=settings.REFRESH_TOKEN_COOKIE_NAME,
    ),
    db: AsyncSession = Depends(get_db),
) -> None:
    access_token = extract_bearer_token(authorization)
    await revoke_access_token(db, access_token)
    await revoke_refresh_session(db, refresh_token)
    await db.commit()
    clear_refresh_cookie(response)


@router.post("/logout-all", status_code=status.HTTP_204_NO_CONTENT, summary="Logout from all sessions")
async def logout_all(
    response: Response,
    authorization: str | None = Header(default=None),
    refresh_token: str | None = Cookie(
        default=None,
        alias=settings.REFRESH_TOKEN_COOKIE_NAME,
    ),
    current_user: User = Depends(get_current_auth_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await revoke_all_user_sessions(db, current_user.id)
    await revoke_access_token(db, extract_bearer_token(authorization))
    await revoke_refresh_session(db, refresh_token)
    await db.commit()
    clear_refresh_cookie(response)
