from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.modules.notifications.deadline_service import (
    create_due_deadline_notifications,
)
from app.modules.notifications.models import (
    NotificationReads,
    NotificationType,
    Notifications,
    TaskDeadlineAlert,
)
from app.modules.objects.models import ObjectToUser
from app.modules.tasks.models import ObjectTask, ObjectTaskStatus, TaskChildrenMode
from app.modules.users.models import UserRole


async def test_deadline_notifications_are_system_generated_and_idempotent(
    session_factory: async_sessionmaker[AsyncSession],
    create_test_user,
    create_test_object,
) -> None:
    admin = await create_test_user(email="admin@example.com", role=UserRole.ADMIN)
    foreman = await create_test_user(
        email="foreman@example.com",
        role=UserRole.FOREMAN,
    )
    obj = await create_test_object(name="ЖК Осел")
    now = datetime(2026, 8, 20, 10, 0, tzinfo=UTC)
    async with session_factory() as session:
        task = ObjectTask(
            object_id=obj.id,
            parent_id=None,
            template_id=None,
            title="Подписать акт",
            depth=0,
            sort_order=0,
            children_mode=TaskChildrenMode.ALL,
            status=ObjectTaskStatus.TODO,
            deadline=now + timedelta(days=1),
            assigned_to_id=foreman.id,
        )
        session.add_all(
            [
                task,
                ObjectToUser(
                    object_id=obj.id,
                    user_id=foreman.id,
                    is_responsible=True,
                ),
            ]
        )
        await session.commit()

        first_created = await create_due_deadline_notifications(
            session,
            now=now,
            due_soon_days=3,
        )
        duplicate_created = await create_due_deadline_notifications(
            session,
            now=now,
            due_soon_days=3,
        )
        overdue_created = await create_due_deadline_notifications(
            session,
            now=now + timedelta(days=2),
            due_soon_days=3,
        )

        notifications = list(
            (
                await session.execute(
                    select(Notifications).order_by(Notifications.id)
                )
            ).scalars().all()
        )
        alert_count = await session.scalar(select(func.count(TaskDeadlineAlert.id)))
        receipt_count = await session.scalar(select(func.count(NotificationReads.id)))

    assert first_created == 1
    assert duplicate_created == 0
    assert overdue_created == 1
    assert alert_count == 2
    assert receipt_count == 4
    assert notifications[0].user_id is None
    assert notifications[0].type == NotificationType.TASK_DEADLINE_DUE_SOON
    assert notifications[1].type == NotificationType.TASK_DEADLINE_OVERDUE
    assert admin.id != foreman.id
