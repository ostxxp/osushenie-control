from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.modules.users.models import User
from app.modules.users.service import get_current_user

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


async def get_current_auth_user(
    db: AsyncSession = Depends(get_db_session),
    token: str = Depends(oauth2_scheme),
) -> User:
    return await get_current_user(db=db, token=token)


async def require_admin(
    current_user: User = Depends(get_current_auth_user),
) -> None:
    if not current_user.role == "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can perform this action",
        )

async def require_chief_engineer_or_admin(
    current_user: User = Depends(get_current_auth_user),
) -> None:
    if not current_user.role in ("chief_engineer", "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only chief engineers and admins can perform this action",
        )
    
async def require_logged_in_user(
    current_user: User = Depends(get_current_auth_user),
) -> None:
    if current_user is None or not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )


async def get_user_or_404(
    user_id: int,
    db: AsyncSession = Depends(get_db_session),
) -> User:
    result = await db.execute(
        select(User).where(User.id == user_id)
    )

    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )

    return user
