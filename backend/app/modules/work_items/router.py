from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.modules.tasks.models import ObjectTaskStatus
from app.modules.tasks.schemas import MyTaskPageRead
from app.modules.tasks.service import list_user_work_items
from app.modules.users.dependencies import get_current_auth_user
from app.modules.users.models import User


router = APIRouter()


@router.get("/my", response_model=MyTaskPageRead, summary="Get tasks assigned to current user")
async def get_my_tasks(
    object_id: int | None = Query(default=None),
    task_status: ObjectTaskStatus | None = Query(default=None, alias="status"),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_auth_user),
) -> dict:
    return await list_user_work_items(
        db,
        user=user,
        object_id=object_id,
        task_status=task_status,
        limit=limit,
        offset=offset,
    )


@router.get("/today", response_model=MyTaskPageRead, summary="Get current user's work for today")
async def get_today_tasks(
    object_id: int | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_auth_user),
) -> dict:
    return await list_user_work_items(
        db,
        user=user,
        object_id=object_id,
        today_only=True,
        limit=limit,
        offset=offset,
    )
