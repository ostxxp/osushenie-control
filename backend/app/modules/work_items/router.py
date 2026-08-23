from datetime import date

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
    search: str | None = Query(default=None, max_length=200),
    deadline_from: date | None = Query(default=None),
    deadline_to: date | None = Query(default=None),
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
        search=search,
        deadline_from=deadline_from,
        deadline_to=deadline_to,
        limit=limit,
        offset=offset,
    )


@router.get("/today", response_model=MyTaskPageRead, summary="Get current user's work for today")
async def get_today_tasks(
    object_id: int | None = Query(default=None),
    search: str | None = Query(default=None, max_length=200),
    deadline_from: date | None = Query(default=None),
    deadline_to: date | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_auth_user),
) -> dict:
    return await list_user_work_items(
        db,
        user=user,
        object_id=object_id,
        search=search,
        deadline_from=deadline_from,
        deadline_to=deadline_to,
        today_only=True,
        limit=limit,
        offset=offset,
    )
