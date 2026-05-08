from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.modules.users.schemas import UserCreate, UserRead
from app.modules.users.service import create_user, get_user_by_email, get_current_user

from app.modules.users.models import User
from sqlalchemy import select


router = APIRouter()

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")

@router.post(
        "", response_model=UserRead,
        status_code=status.HTTP_201_CREATED,
        summary="Create a new user"
)
async def create_user_endpoint(
    user_data: UserCreate,
    db: AsyncSession = Depends(get_db_session),
) -> UserRead:
    existing_user = await get_user_by_email(db=db, email=user_data.email)

    if existing_user is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User with this email already exists.",
        )

    user = await create_user(db=db, user_data=user_data)

    return user

@router.get(
    "", response_model=list[UserRead],
    summary="Get a list of all users"
)
async def list_users_endpoint(
    db: AsyncSession = Depends(get_db_session),
    token: str = Depends(oauth2_scheme),
) -> list[UserRead]:
    if (await get_current_user(db=db, token=token)).role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admin users can access this endpoint.",
        )
    result = await db.execute(
        select(User)
    )

    users = result.scalars().all()

    return users

@router.get(
    "/me", response_model=UserRead,
    summary="Get the currently authenticated user"
)
async def get_current_user_endpoint(
    db: AsyncSession = Depends(get_db_session),
    token: str = Depends(oauth2_scheme),
) -> UserRead:
    current_user = await get_current_user(db=db, token=token)
    return current_user

@router.get(
    "/{user_id}", response_model=UserRead,
    summary="Get a user by ID"
)
async def get_user_endpoint(
    user_id: int,
    db: AsyncSession = Depends(get_db_session),
) -> UserRead:
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