from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.modules.users.schemas import UserCreate, UserRead, UserUpdate
from app.modules.users.service import create_user, get_user_by_email

from app.modules.users.models import User
from sqlalchemy import select

from app.core.security import hash_password

from app.modules.users.dependencies import require_chief_engineer, get_current_auth_user, get_user_or_404


router = APIRouter()

@router.post(
        "", response_model=UserRead,
        status_code=status.HTTP_201_CREATED,
        summary="Create a new user",
        dependencies=[Depends(require_chief_engineer)]
)
async def create_user_endpoint(
    user_data: UserCreate,
    db: AsyncSession = Depends(get_db_session)
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
    summary="Get a list of all users",
    dependencies=[Depends(require_chief_engineer)]
)
async def list_users_endpoint(
    db: AsyncSession = Depends(get_db_session)
) -> list[UserRead]:
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
    current_user: User = Depends(get_current_auth_user)
) -> UserRead:
    return current_user

@router.get(
    "/{user_id}", response_model=UserRead,
    summary="Get a user by ID"
)
async def get_user_endpoint(
    user: User = Depends(get_user_or_404)
) -> UserRead:
    return user

@router.patch(
    "/{user_id}", response_model=UserRead,
    summary="Update a user by ID",
    dependencies=[Depends(require_chief_engineer)]
)
async def update_user_endpoint(
    user_data: UserUpdate,
    user: User = Depends(get_user_or_404),
    db: AsyncSession = Depends(get_db_session)
) -> UserRead:
    update_data = user_data.model_dump(exclude_unset=True)

    if "email" in update_data:
        existing_user = await get_user_by_email(db=db, email=update_data["email"])

        if existing_user is not None and existing_user.id != user.id:
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
    summary="Activate a user by ID",
    dependencies=[Depends(require_chief_engineer)]
)
async def activate_user_endpoint(
    user: User = Depends(get_user_or_404),
    db: AsyncSession = Depends(get_db_session)
) -> UserRead:
    user.is_active = True
    await db.commit()
    await db.refresh(user)

    return user

@router.patch(
    "/{user_id}/deactivate",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Deactivate a user by ID",
    dependencies=[Depends(require_chief_engineer)]
)
async def deactivate_user_endpoint(
    user: User = Depends(get_user_or_404),
    db: AsyncSession = Depends(get_db_session)
) -> None:
    user.is_active = False
    await db.commit()
    await db.refresh(user)

@router.delete(
    "/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a user by ID",
    dependencies=[Depends(require_chief_engineer)]
)
async def delete_user_endpoint(
    user: User = Depends(get_user_or_404),
    db: AsyncSession = Depends(get_db_session)
) -> None:
    await db.delete(user)
    await db.commit()