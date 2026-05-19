from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.modules.objects.models import ConstructionObject, ObjectToUser


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