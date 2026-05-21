from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.modules.tasks.models import ObjectTask


async def get_object_task_or_404(
    object_id: int,
    task_id: int,
    db: AsyncSession = Depends(get_db_session),
) -> ObjectTask:
    result = await db.execute(
        select(ObjectTask).where(
            ObjectTask.id == task_id,
            ObjectTask.object_id == object_id,
        )
    )
    object_task = result.scalar_one_or_none()

    if object_task is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Object task not found.",
        )

    return object_task
