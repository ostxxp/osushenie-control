from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.modules.ai.schemas import AIChatMessage
from app.modules.objects.models import ConstructionObject, ObjectToUser
from app.modules.tasks.models import ObjectTask, ObjectTaskStatus
from app.modules.users.models import User


SYSTEM_PROMPT = """
Ты AI-ассистент администратора системы ОСУШЕНИЕ.РФ.
Твоя задача — вести управленческую сводку по всем объектам.
Отвечай по-русски, кратко и по делу.

Ты умеешь:
- давать общую сводку по объектам;
- находить объекты с рисками;
- объяснять, где есть просрочки;
- подсказывать, на какие задачи администратору обратить внимание;
- сравнивать объекты между собой.

Опирайся только на контекст, который прислал backend.
Если данных не хватает, прямо скажи, каких данных нет.
Не придумывай факты.
Оформляй ответы красиво:
- используй Markdown-заголовки;
- иногда выделяй важное жирным через **текст**;
- используй короткие списки;
- везде умеренно используй эмодзи-маркеры: ✅, ⚠️, ⏰, 📍, 👷, 📊.
""".strip()


def _format_date(value) -> str:
    if value is None:
        return "не указано"
    return str(value)


async def _build_objects_context(db: AsyncSession) -> str:
    objects_result = await db.execute(
        select(ConstructionObject)
        .where(ConstructionObject.is_active.is_(True))
        .order_by(ConstructionObject.id)
    )
    objects = list(objects_result.scalars().all())
    if not objects:
        return "Активных объектов нет."

    object_ids = [obj.id for obj in objects]

    tasks_result = await db.execute(
        select(ObjectTask)
        .where(
            ObjectTask.object_id.in_(object_ids),
            ObjectTask.is_active.is_(True),
        )
        .order_by(ObjectTask.object_id, ObjectTask.depth, ObjectTask.sort_order, ObjectTask.id)
    )
    tasks_by_object_id: dict[int, list[ObjectTask]] = {}
    for task in tasks_result.scalars().all():
        tasks_by_object_id.setdefault(task.object_id, []).append(task)

    completed_by_ids = {
        task.completed_by_id
        for tasks in tasks_by_object_id.values()
        for task in tasks
        if task.completed_by_id is not None
    }
    completed_users_by_id: dict[int, User] = {}
    if completed_by_ids:
        completed_users_result = await db.execute(
            select(User).where(User.id.in_(completed_by_ids))
        )
        completed_users_by_id = {
            user.id: user
            for user in completed_users_result.scalars().all()
        }

    users_result = await db.execute(
        select(ObjectToUser, User)
        .join(User, User.id == ObjectToUser.user_id)
        .where(ObjectToUser.object_id.in_(object_ids))
        .order_by(ObjectToUser.object_id, User.full_name)
    )
    users_by_object_id: dict[int, list[tuple[ObjectToUser, User]]] = {}
    for object_to_user, user in users_result.all():
        users_by_object_id.setdefault(object_to_user.object_id, []).append((object_to_user, user))

    now = datetime.now(UTC)
    lines = ["Контекст по активным объектам:"]
    total_completed_by_user: dict[str, int] = {}

    for obj in objects:
        tasks = tasks_by_object_id.get(obj.id, [])
        total_tasks = len(tasks)
        done_tasks = sum(1 for task in tasks if task.status == ObjectTaskStatus.DONE)
        in_progress_tasks = sum(1 for task in tasks if task.status == ObjectTaskStatus.IN_PROGRESS)
        todo_tasks = sum(1 for task in tasks if task.status == ObjectTaskStatus.TODO)
        blocked_tasks = sum(
            1
            for task in tasks
            if task.status in {ObjectTaskStatus.SKIPPED, ObjectTaskStatus.NOT_APPLICABLE}
        )
        overdue_tasks = [
            task
            for task in tasks
            if task.deadline is not None
            and task.deadline < now
            and task.status != ObjectTaskStatus.DONE
        ]

        users = users_by_object_id.get(obj.id, [])
        responsible_users = [
            user.full_name
            for object_to_user, user in users
            if object_to_user.is_responsible
        ]
        assigned_users = [user.full_name for _, user in users]

        progress = round(done_tasks * 100 / total_tasks) if total_tasks else 0
        overdue_titles = ", ".join(task.title for task in overdue_tasks[:8]) or "нет"
        completed_by_user: dict[str, int] = {}

        for task in tasks:
            if task.status != ObjectTaskStatus.DONE or task.completed_by_id is None:
                continue

            user = completed_users_by_id.get(task.completed_by_id)
            user_name = user.full_name if user is not None else f"Пользователь #{task.completed_by_id}"
            completed_by_user[user_name] = completed_by_user.get(user_name, 0) + 1
            total_completed_by_user[user_name] = total_completed_by_user.get(user_name, 0) + 1

        completed_by_text = ", ".join(
            f"{user_name}: {count}"
            for user_name, count in sorted(
                completed_by_user.items(),
                key=lambda item: item[1],
                reverse=True,
            )
        ) or "нет выполненных задач с исполнителем"

        lines.extend(
            [
                f"- Объект #{obj.id}: {obj.name}",
                f"  Адрес: {obj.address}",
                f"  Сроки: {_format_date(obj.start_date)} — {_format_date(obj.end_date)}",
                f"  Ответственные: {', '.join(responsible_users) or 'не назначены'}",
                f"  Участники: {', '.join(assigned_users) or 'не назначены'}",
                f"  Задачи: всего {total_tasks}, выполнено {done_tasks}, в работе {in_progress_tasks}, просрочено {len(overdue_tasks)}",
                f"  Прогресс по сырым задачам: {progress}%",
                f"  Кто выполнил задачи на объекте: {completed_by_text}",
                f"  Просроченные задачи: {overdue_titles}",
            ]
        )

    total_completed_by_text = ", ".join(
        f"{user_name}: {count}"
        for user_name, count in sorted(
            total_completed_by_user.items(),
            key=lambda item: item[1],
            reverse=True,
        )
    ) or "нет выполненных задач с исполнителем"
    lines.append(f"Общий рейтинг исполнителей по выполненным задачам: {total_completed_by_text}")

    return "\n".join(lines)


def _build_provider_messages(
    *,
    context: str,
    history: list[AIChatMessage],
    message: str,
) -> list[dict[str, str]]:
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "system", "content": context},
    ]

    messages.extend(
        {"role": item.role, "content": item.content}
        for item in history[-10:]
    )
    messages.append({"role": "user", "content": message})
    return messages


async def get_ai_chat_answer(
    db: AsyncSession,
    *,
    message: str,
    history: list[AIChatMessage],
) -> str:
    if not settings.AI_API_URL or not settings.AI_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI provider is not configured",
        )

    context = await _build_objects_context(db)
    payload = {
        "model": settings.AI_MODEL,
        "messages": _build_provider_messages(
            context=context,
            history=history,
            message=message,
        ),
        "temperature": 0.2,
    }
    headers = {
        "Authorization": f"Bearer {settings.AI_API_KEY}",
        "Content-Type": "application/json",
    }

    try:
        import httpx
    except ModuleNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI dependency is not installed. Rebuild backend image.",
        ) from exc

    try:
        async with httpx.AsyncClient(timeout=settings.AI_REQUEST_TIMEOUT_SECONDS) as client:
            response = await client.post(
                settings.AI_API_URL,
                json=payload,
                headers=headers,
            )
            response.raise_for_status()
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI provider request failed",
        ) from exc

    data = response.json()
    answer = (
        data.get("choices", [{}])[0]
        .get("message", {})
        .get("content")
    )
    if not answer:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI provider returned empty response",
        )

    return answer
