from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.objects.models import ObjectToUser
from app.modules.task_sync.models import TaskSyncReceipt
from app.modules.task_sync.schemas import TaskSyncOperation
from app.modules.tasks.models import ObjectTask
from app.modules.tasks.schemas import ObjectTaskUpdate
from app.modules.tasks.service import update_object_task
from app.modules.users.models import User, UserRole


def _serialize_receipt(receipt: TaskSyncReceipt) -> dict:
    return {
        "operation_id": receipt.operation_id,
        "task_id": receipt.task_id,
        "outcome": receipt.outcome,
        "resulting_version": receipt.resulting_version,
        "error": receipt.error,
    }


async def _user_can_sync_task(
    db: AsyncSession,
    *,
    user: User,
    task: ObjectTask,
) -> bool:
    if user.role in {UserRole.ADMIN, UserRole.CHIEF_ENGINEER}:
        return True
    if task.assigned_to_id == user.id:
        return True
    association = await db.scalar(
        select(ObjectToUser).where(
            ObjectToUser.object_id == task.object_id,
            ObjectToUser.user_id == user.id,
        )
    )
    return association is not None


async def sync_task_operations(
    db: AsyncSession,
    *,
    user: User,
    operations: list[TaskSyncOperation],
) -> list[dict]:
    results = []
    for operation in operations:
        existing = await db.scalar(
            select(TaskSyncReceipt).where(
                TaskSyncReceipt.user_id == user.id,
                TaskSyncReceipt.operation_id == operation.operation_id,
            )
        )
        if existing is not None:
            results.append(_serialize_receipt(existing))
            continue

        task = await db.get(ObjectTask, operation.task_id)
        if task is None or not task.is_active:
            receipt = TaskSyncReceipt(
                operation_id=operation.operation_id,
                user_id=user.id,
                task_id=None,
                outcome="not_found",
                error="Task not found",
            )
            db.add(receipt)
            await db.commit()
            results.append(_serialize_receipt(receipt))
            continue

        if not await _user_can_sync_task(db, user=user, task=task):
            receipt = TaskSyncReceipt(
                operation_id=operation.operation_id,
                user_id=user.id,
                task_id=task.id,
                outcome="forbidden",
                resulting_version=task.version,
                error="Task is not available to this user",
            )
            db.add(receipt)
            await db.commit()
            results.append(_serialize_receipt(receipt))
            continue

        if task.version != operation.expected_version:
            receipt = TaskSyncReceipt(
                operation_id=operation.operation_id,
                user_id=user.id,
                task_id=task.id,
                outcome="conflict",
                resulting_version=task.version,
                error="Task was changed on the server",
            )
            db.add(receipt)
            await db.commit()
            results.append(_serialize_receipt(receipt))
            continue

        receipt = TaskSyncReceipt(
            operation_id=operation.operation_id,
            user_id=user.id,
            task_id=task.id,
            outcome="applied",
            resulting_version=task.version + 1,
        )
        db.add(receipt)
        updated_task = await update_object_task(
            db,
            object_task=task,
            task_data=ObjectTaskUpdate(
                status=operation.status,
                expected_version=operation.expected_version,
            ),
            current_user=user,
        )
        receipt.resulting_version = updated_task.version
        await db.commit()
        results.append(_serialize_receipt(receipt))

    return results
