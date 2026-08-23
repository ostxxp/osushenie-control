from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.modules.objects.dependencies import get_object_or_404, user_can_access_object
from app.modules.objects.models import ConstructionObject
from app.modules.tasks.models import ObjectTask, ObjectTaskStatus
from app.modules.tasks.schemas import (
    CurrentStepRead,
    ObjectTaskCreate,
    ObjectTaskAction,
    ObjectTaskAssignmentUpdate,
    ObjectTaskBranchSelect,
    ObjectTaskListGroupRead,
    ObjectTaskRead,
    ObjectTaskStatsRead,
    ObjectTaskStatusUpdate,
    ObjectTaskStatusUpdateRead,
    ObjectTaskTreeRead,
    ObjectTaskUpdate,
    ProjectStageRead,
)
from app.modules.tasks.service import (
    build_object_task_tree,
    assign_object_task,
    clear_object_task_branch,
    create_object_task,
    deactivate_object_task,
    list_object_tasks,
    update_object_task,
    build_available_task_tree,
    build_available_task_trees,
    list_logical_todo_object_tasks,
    list_main_object_tasks,
    get_main_task_id,
    get_progress,
    get_task_stats,
    get_project_stage_summaries,
    get_current_object_step,
    group_object_tasks_by_main_task,
    list_done_object_tasks,
    list_overdue_object_tasks,
    select_object_task_branch,
    start_object_task,
    complete_object_task,
)
from app.modules.tasks.dependencies import get_object_task_or_404
from app.modules.users.dependencies import get_current_auth_user, require_chief_engineer_or_admin
from app.modules.users.models import User
from app.modules.users.schemas import UserRead


router = APIRouter()


@router.get(
    "/{object_id}/current-step",
    response_model=CurrentStepRead,
    summary="Get current actionable object step",
    dependencies=[Depends(user_can_access_object)],
)
async def get_current_step_for_object(
    object: ConstructionObject = Depends(get_object_or_404),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    return await get_current_object_step(db, object_id=object.id)

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
    return await build_object_task_tree(db, tasks)

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
    current_user: User = Depends(get_current_auth_user),
) -> ObjectTask:
    return await create_object_task(
        db,
        object_id=object.id,
        task_data=task_data,
        current_user=current_user,
    )

@router.get(
    "/{object_id}/progress",
    response_model=float,
    summary="Get object progress percentage",
    dependencies=[Depends(user_can_access_object)]
)
async def get_object_progress(
    main_task_id: int | None = Query(default=None),
    object: ConstructionObject = Depends(get_object_or_404),
    db: AsyncSession = Depends(get_db_session),
) -> float:
    return await get_progress(db, object_id=object.id, root_task_id=main_task_id)


@router.get(
    "/{object_id}/tasks/stats",
    response_model=ObjectTaskStatsRead,
    summary="Get object task stats",
    dependencies=[Depends(user_can_access_object)]
)
async def get_object_task_stats(
    main_task_id: int | None = Query(default=None),
    object: ConstructionObject = Depends(get_object_or_404),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, int]:
    return await get_task_stats(db, object_id=object.id, root_task_id=main_task_id)


@router.get(
    "/{object_id}/stages",
    response_model=list[ProjectStageRead],
    summary="Get all project stages with task stats",
    dependencies=[Depends(user_can_access_object)],
)
async def get_object_project_stages(
    object: ConstructionObject = Depends(get_object_or_404),
    db: AsyncSession = Depends(get_db_session),
) -> list[dict]:
    return await get_project_stage_summaries(db, object_id=object.id)


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

@router.post(
    "/{object_id}/tasks/{task_id}",
    response_model=ObjectTaskRead,
    summary="Update object task",
    dependencies=[Depends(user_can_access_object), Depends(require_chief_engineer_or_admin)]
)
async def update_task_for_object_post(
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
    "/{object_id}/tasks/{task_id}/assignment",
    response_model=ObjectTaskRead,
    summary="Assign task executor",
    dependencies=[Depends(user_can_access_object), Depends(require_chief_engineer_or_admin)],
)
async def assign_task_for_object(
    assignment: ObjectTaskAssignmentUpdate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_auth_user),
    object_task: ObjectTask = Depends(get_object_task_or_404),
) -> ObjectTask:
    return await assign_object_task(
        db,
        object_task=object_task,
        assignment=assignment,
        current_user=current_user,
    )


@router.post(
    "/{object_id}/tasks/{task_id}/start",
    response_model=ObjectTaskRead,
    summary="Start assigned task",
    dependencies=[Depends(user_can_access_object)],
)
async def start_task_for_object(
    payload: ObjectTaskAction,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_auth_user),
    object_task: ObjectTask = Depends(get_object_task_or_404),
) -> ObjectTask:
    return await start_object_task(
        db,
        object_task=object_task,
        current_user=current_user,
        expected_version=payload.expected_version,
    )


@router.post(
    "/{object_id}/tasks/{task_id}/complete",
    response_model=ObjectTaskRead,
    summary="Complete assigned task",
    dependencies=[Depends(user_can_access_object)],
)
async def complete_task_for_object(
    payload: ObjectTaskAction,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_auth_user),
    object_task: ObjectTask = Depends(get_object_task_or_404),
) -> ObjectTask:
    return await complete_object_task(
        db,
        object_task=object_task,
        current_user=current_user,
        expected_version=payload.expected_version,
    )


@router.put(
    "/{object_id}/tasks/{task_id}/branch",
    response_model=ObjectTaskRead,
    summary="Select a single-choice task branch",
    dependencies=[Depends(user_can_access_object)],
)
async def select_task_branch_for_object(
    payload: ObjectTaskBranchSelect,
    db: AsyncSession = Depends(get_db_session),
    parent_task: ObjectTask = Depends(get_object_task_or_404),
    current_user: User = Depends(get_current_auth_user),
) -> ObjectTask:
    return await select_object_task_branch(
        db,
        parent_task=parent_task,
        child_id=payload.child_id,
        expected_version=payload.expected_version,
        current_user=current_user,
    )


@router.delete(
    "/{object_id}/tasks/{task_id}/branch",
    response_model=ObjectTaskRead,
    summary="Clear a single-choice task branch",
    dependencies=[Depends(user_can_access_object)],
)
async def clear_task_branch_for_object(
    db: AsyncSession = Depends(get_db_session),
    parent_task: ObjectTask = Depends(get_object_task_or_404),
    current_user: User = Depends(get_current_auth_user),
) -> ObjectTask:
    return await clear_object_task_branch(
        db,
        parent_task=parent_task,
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
    object_task: ObjectTask = Depends(get_object_task_or_404)
) -> dict:
    updated_task = await update_object_task(
        db,
        object_task=object_task,
        task_data=task_data,
        current_user=current_user,
    )
    response = ObjectTaskRead.model_validate(updated_task).model_dump()
    response["main_task_id"] = await get_main_task_id(
        db,
        object_task=updated_task,
    )
    return response

@router.patch(
    "/{object_id}/tasks/{task_id}/toggle_status",
    response_model=ObjectTaskStatusUpdateRead,
    summary="Toggle object task status between TODO and DONE",
    dependencies=[Depends(user_can_access_object)]
)
async def update_task_status_for_object(
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_auth_user),
    object_task: ObjectTask = Depends(get_object_task_or_404),
) -> dict:
    status = ObjectTaskStatus.DONE if object_task.status == ObjectTaskStatus.TODO else ObjectTaskStatus.TODO
    updated_task = await update_object_task(
        db,
        object_task=object_task,
        task_data=ObjectTaskUpdate(status=status),
        current_user=current_user,
    )
    response = ObjectTaskRead.model_validate(updated_task).model_dump()
    response["completed_by"] = (
        UserRead.model_validate(current_user).model_dump()
        if updated_task.status == ObjectTaskStatus.DONE
        else None
    )
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
    object_task: ObjectTask = Depends(get_object_task_or_404),
    current_user: User = Depends(get_current_auth_user),
) -> None:
    await deactivate_object_task(
        db,
        object_task=object_task,
        current_user=current_user,
    )
    response.status_code = status.HTTP_204_NO_CONTENT

@router.get(
    "/{object_id}/tasks/done",
    response_model=list[ObjectTaskListGroupRead],
    summary="Get done tasks for object",
    dependencies=[Depends(user_can_access_object)]
)
async def get_done_tasks(
    main_task_id: int | None = Query(default=None),
    object: ConstructionObject = Depends(get_object_or_404),
    db: AsyncSession = Depends(get_db_session),
) -> list[dict]:
    tasks = await list_done_object_tasks(
        db,
        object_id=object.id,
        root_task_id=main_task_id,
    )
    return await group_object_tasks_by_main_task(
        db,
        object_id=object.id,
        tasks=tasks,
        root_task_id=main_task_id,
    )

@router.get(
    "/{object_id}/tasks/todo",
    response_model=list[ObjectTaskListGroupRead],
    summary="Get todo tasks for object",
    dependencies=[Depends(user_can_access_object)]
)
async def get_todo_tasks(
    main_task_id: int | None = Query(default=None),
    object: ConstructionObject = Depends(get_object_or_404),
    db: AsyncSession = Depends(get_db_session),
) -> list[dict]:
    tasks = await list_logical_todo_object_tasks(
        db,
        object_id=object.id,
        root_task_id=main_task_id,
    )
    return await group_object_tasks_by_main_task(
        db,
        object_id=object.id,
        tasks=tasks,
        root_task_id=main_task_id,
    )


@router.get(
    "/{object_id}/tasks/overdue",
    response_model=list[ObjectTaskListGroupRead],
    summary="Get overdue tasks for object",
    dependencies=[Depends(user_can_access_object)]
)
async def get_overdue_tasks_for_object(
    main_task_id: int | None = Query(default=None),
    object: ConstructionObject = Depends(get_object_or_404),
    db: AsyncSession = Depends(get_db_session),
) -> list[dict]:
    tasks = await list_overdue_object_tasks(
        db,
        object_id=object.id,
        root_task_id=main_task_id,
    )
    return await group_object_tasks_by_main_task(
        db,
        object_id=object.id,
        tasks=tasks,
        root_task_id=main_task_id,
    )


@router.get(
    "/{object_id}/tasks/overdue_count",
    response_model=int,
    summary="Get count of overdue tasks for object",
    dependencies=[Depends(user_can_access_object)]
)
async def get_overdue_tasks_count_for_object(
    main_task_id: int | None = Query(default=None),
    object: ConstructionObject = Depends(get_object_or_404),
    db: AsyncSession = Depends(get_db_session),
) -> int:
    overdue_tasks = await list_overdue_object_tasks(
        db,
        object_id=object.id,
        root_task_id=main_task_id,
    )
    return len(overdue_tasks)
