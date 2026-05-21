from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.modules.objects.models import ConstructionObject, ObjectToUser
from app.modules.users.models import User
from app.modules.users.dependencies import get_current_auth_user


async def get_object_or_404(
    object_id: int,
    db: AsyncSession = Depends(get_db_session),
) -> ConstructionObject:
    result = await db.execute(
        select(ConstructionObject).where(ConstructionObject.id == object_id)
    )

    obj = result.scalar_one_or_none()

    if obj is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Object not found",
        )

    return obj

async def get_object_to_user_or_404(
    object_id: int,
    user_id: int,
    db: AsyncSession = Depends(get_db_session),
):
    result = await db.execute(
        select(ObjectToUser).where(
            ObjectToUser.object_id == object_id,
            ObjectToUser.user_id == user_id,
        )
    )

    obj_to_user = result.scalar_one_or_none()

    if obj_to_user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User is not assigned to the object.",
        )

    return obj_to_user

async def user_can_access_object(
    object_id: int,
    current_user: User = Depends(get_current_auth_user),
    db: AsyncSession = Depends(get_db_session),
) -> bool:
    if current_user.role in ("admin", "chief_engineer"):
        return True
    result = await db.execute(
        select(ObjectToUser).where(
            ObjectToUser.object_id == object_id,
            ObjectToUser.user_id == current_user.id,
        )
    )

    obj_to_user = result.scalar_one_or_none()
    if obj_to_user is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this object.",
        )
    return obj_to_user is not None