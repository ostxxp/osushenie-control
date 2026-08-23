from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.modules.objects.dependencies import get_object_or_404, user_can_access_object
from app.modules.objects.models import ConstructionObject
from app.modules.task_activity.models import TaskActivityAction
from app.modules.task_activity.schemas import TaskActivityPageRead
from app.modules.task_activity.service import list_task_activities
from app.modules.users.dependencies import require_chief_engineer_or_admin


router = APIRouter()


@router.get(
    "/activity",
    response_model=TaskActivityPageRead,
    summary="Get paginated task activity across objects",
    dependencies=[Depends(require_chief_engineer_or_admin)],
)
async def get_global_task_activity(
    object_id: int | None = Query(default=None),
    task_id: int | None = Query(default=None),
    actor_user_id: int | None = Query(default=None),
    action: TaskActivityAction | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    return await list_task_activities(
        db,
        object_id=object_id,
        task_id=task_id,
        actor_user_id=actor_user_id,
        action=action,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/objects/{object_id}/activity",
    response_model=TaskActivityPageRead,
    summary="Get paginated task activity for an object",
    dependencies=[Depends(user_can_access_object)],
)
async def get_object_task_activity(
    task_id: int | None = Query(default=None),
    actor_user_id: int | None = Query(default=None),
    action: TaskActivityAction | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    object_item: ConstructionObject = Depends(get_object_or_404),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    return await list_task_activities(
        db,
        object_id=object_item.id,
        task_id=task_id,
        actor_user_id=actor_user_id,
        action=action,
        limit=limit,
        offset=offset,
    )
