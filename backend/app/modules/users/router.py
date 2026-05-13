from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.modules.users.schemas import UserCreate, UserRead, UserUpdate
from app.modules.users.service import create_user, get_user_by_email, get_current_user
from app.modules.users.service import is_chief_engineer, user_exists

from app.modules.users.models import User
from sqlalchemy import select

from app.core.security import hash_password


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
    token: str = Depends(oauth2_scheme),
) -> UserRead:
    if not await is_chief_engineer(db=db, token=token):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only chief engineers can create new users.",
        )
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
    if not await is_chief_engineer(db=db, token=token):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only chief engineers can access this endpoint.",
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

@router.patch(
    "/{user_id}", response_model=UserRead,
    summary="Update a user by ID"
)
async def update_user_endpoint(
    user_id: int,
    user_data: UserUpdate,
    db: AsyncSession = Depends(get_db_session),
    token: str = Depends(oauth2_scheme),
) -> UserRead:
    if not await is_chief_engineer(db=db, token=token):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only chief engineers can update users.",
        )

    result = await db.execute(
        select(User).where(User.id == user_id)
    )

    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )

    update_data = user_data.model_dump(exclude_unset=True)

    if "email" in update_data:
        existing_user = await get_user_by_email(db=db, email=update_data["email"])

        if existing_user is not None and existing_user.id != user_id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Another user with this email already exists.",
            )
        
    if "password" in update_data:
        user.hashed_password = hash_password(update_data.pop("password"))    
    
    for key, value in update_data.items():
        setattr(user, key, value)

    await db.commit()
    await db.refresh(user)

    return user

@router.patch(
    "/{user_id}/activate", response_model=UserRead,
    summary="Activate a user by ID"
)
async def activate_user_endpoint(
    user_id: int,
    db: AsyncSession = Depends(get_db_session),
    token: str = Depends(oauth2_scheme),
) -> UserRead:
    if not await is_chief_engineer(db=db, token=token):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only chief engineers can activate users.",
        )

    result = await db.execute(
        select(User).where(User.id == user_id)
    )

    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )

    user.is_active = True
    await db.commit()
    await db.refresh(user)

    return user

@router.delete(
    "/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a user by ID"
)
async def delete_user_endpoint(
    user_id: int,
    db: AsyncSession = Depends(get_db_session),
    token: str = Depends(oauth2_scheme),
) -> None:
    if not await is_chief_engineer(db=db, token=token):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only chief engineers can delete users.",
        )

    result = await db.execute(
        select(User).where(User.id == user_id)
    )

    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )

    await db.delete(user)
    await db.commit()

@router.delete(
    "/{user_id}/deactivate",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Deactivate a user by ID"
)
async def deactivate_user_endpoint(
    user_id: int,
    db: AsyncSession = Depends(get_db_session),
    token: str = Depends(oauth2_scheme),
) -> None:
    if not await is_chief_engineer(db=db, token=token):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only chief engineers can deactivate users.",
        )

    result = await db.execute(
        select(User).where(User.id == user_id)
    )

    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )

    user.is_active = False
    await db.commit()
    await db.refresh(user)