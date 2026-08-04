from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.modules.task_sync.schemas import TaskSyncRequest, TaskSyncResponse
from app.modules.task_sync.service import sync_task_operations
from app.modules.users.dependencies import get_current_auth_user
from app.modules.users.models import User


router = APIRouter()


@router.post("/sync", response_model=TaskSyncResponse, summary="Synchronize offline task changes")
async def sync_tasks(
    payload: TaskSyncRequest,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_auth_user),
) -> dict:
    return {
        "results": await sync_task_operations(
            db,
            user=user,
            operations=payload.operations,
        )
    }
