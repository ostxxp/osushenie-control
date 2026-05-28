from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.modules.objects.dependencies import get_object_or_404, user_can_access_object
from app.modules.objects.models import ConstructionObject
from app.modules.tasks.models import ObjectTask
from app.modules.tasks.schemas import (
    ObjectTaskCreate,
    ObjectTaskRead,
    ObjectTaskStatusUpdate,
    ObjectTaskStatusUpdateRead,
    ObjectTaskTreeRead,
    ObjectTaskUpdate,
)
from app.modules.tasks.service import (
    build_object_task_tree,
    create_object_task,
    deactivate_object_task,
    list_object_tasks,
    update_object_task,
    build_available_task_tree,
    build_available_task_trees,
    list_main_object_tasks,
    get_main_task_id,
    get_progress,
)
from app.modules.tasks.dependencies import get_object_task_or_404
from app.modules.users.dependencies import get_current_auth_user, require_chief_engineer_or_admin
from app.modules.users.models import User


router = APIRouter()

@router.get(
    "/{object_id}/tasks",
    response_model=list[ObjectTaskRead],
    summary="Get object tasks",
    dependencies=[Depends(user_can_access_object)]
)
async def get_object_tasks(
    object: ConstructionObject = Depends(get_object_or_404),
    db: AsyncSession = Depends(get_db_session),
) -> list[ObjectTask]:
    return await list_object_tasks(db, object_id=object.id)


@router.get(
    "/{object_id}/tasks/tree",
    response_model=list[ObjectTaskTreeRead],
    summary="Get object tasks as a tree",
    dependencies=[Depends(user_can_access_object)]
)
async def get_object_tasks_tree(
    object: ConstructionObject = Depends(get_object_or_404),
    db: AsyncSession = Depends(get_db_session),
) -> list[dict]:
    tasks = await list_object_tasks(db, object_id=object.id)
    return build_object_task_tree(tasks)

@router.get(
    "/{object_id}/tasks/headers",
    response_model=list[ObjectTaskRead],
    summary="Get object tasks headers",
    dependencies=[Depends(user_can_access_object)]
)
async def get_object_task_headers(
    object: ConstructionObject = Depends(get_object_or_404),
    db: AsyncSession = Depends(get_db_session),
) -> list[ObjectTask]:
    tasks = await list_main_object_tasks(db, object_id=object.id)
    return tasks

@router.post(
    "/{object_id}/tasks",
    response_model=ObjectTaskRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create object task",
    dependencies=[Depends(user_can_access_object), Depends(require_chief_engineer_or_admin)]
)
async def create_task_for_object(
    task_data: ObjectTaskCreate,
    object: ConstructionObject = Depends(get_object_or_404),
    db: AsyncSession = Depends(get_db_session),
) -> ObjectTask:
    return await create_object_task(db, object_id=object.id, task_data=task_data)

@router.get(
    "/{object_id}/progress",
    response_model=float,
    summary="Get object progress percentage",
    dependencies=[Depends(user_can_access_object)]
)
async def get_object_progress(
    object: ConstructionObject = Depends(get_object_or_404),
    db: AsyncSession = Depends(get_db_session),
) -> float:
    return await get_progress(db, object_id=object.id)

@router.get(
    "/{object_id}/tasks/available",
    response_model=list[ObjectTaskTreeRead],
    summary="Get available task trees for all main object tasks",
    dependencies=[Depends(user_can_access_object)]
)
async def get_available_task_trees(
    object: ConstructionObject = Depends(get_object_or_404),
    db: AsyncSession = Depends(get_db_session),
) -> list[dict]:
    return await build_available_task_trees(db, object_id=object.id)


@router.get(
    "/{object_id}/tasks/{task_id}/available",
    response_model=ObjectTaskTreeRead,
    summary="Get available subtasks for main object task",
    dependencies=[Depends(user_can_access_object)]
)
async def get_available_subtasks_for_main_task(
    main_task: ObjectTask = Depends(get_object_task_or_404),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    
    return await build_available_task_tree(db, main_task=main_task)

@router.patch(
    "/{object_id}/tasks/{task_id}",
    response_model=ObjectTaskRead,
    summary="Update object task",
    dependencies=[Depends(user_can_access_object), Depends(require_chief_engineer_or_admin)]
)
async def update_task_for_object(
    task_data: ObjectTaskUpdate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_auth_user),
    object_task: ObjectTask = Depends(get_object_task_or_404)
) -> ObjectTask:
    return await update_object_task(
        db,
        object_task=object_task,
        task_data=task_data,
        current_user=current_user,
    )

@router.patch(
    "/{object_id}/tasks/{task_id}/status",
    response_model=ObjectTaskStatusUpdateRead,
    summary="Update object task status",
    dependencies=[Depends(user_can_access_object)]
)
async def update_task_status_for_object(
    task_data: ObjectTaskStatusUpdate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_auth_user),
    object_task: ObjectTask = Depends(get_object_task_or_404),
) -> dict:
    updated_task = await update_object_task(
        db,
        object_task=object_task,
        task_data=ObjectTaskUpdate(status=task_data.status),
        current_user=current_user,
    )
    response = ObjectTaskRead.model_validate(updated_task).model_dump()
    response["main_task_id"] = await get_main_task_id(
        db,
        object_task=updated_task,
    )
    return response

@router.delete(
    "/{object_id}/tasks/{task_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Deactivate object task",
    dependencies=[Depends(user_can_access_object), Depends(require_chief_engineer_or_admin)]
)
async def delete_task_for_object(
    response: Response,
    db: AsyncSession = Depends(get_db_session),
    object_task: ObjectTask = Depends(get_object_task_or_404)
) -> None:
    await deactivate_object_task(db, object_task=object_task)
    response.status_code = status.HTTP_204_NO_CONTENT
