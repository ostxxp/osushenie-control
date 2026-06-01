from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.modules.users.models import User
from app.modules.users.schemas import UserCreate

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

from app.core.config import settings
from app.modules.objects.models import ConstructionObject, ObjectToUser


async def set_responsible_status(
    object: ConstructionObject,
    user: User,
    db: AsyncSession,
    is_responsible: bool,
):
    result = await db.execute(
        select(ObjectToUser).where(
            ObjectToUser.object_id == object.id,
            ObjectToUser.user_id == user.id,
        )
    )

    object_to_user = result.scalar_one_or_none()

    if object_to_user is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Пользователь не назначен на этот объект.",
        )

    object_to_user.is_responsible = is_responsible

    await db.commit()
    await db.refresh(object)

    return object