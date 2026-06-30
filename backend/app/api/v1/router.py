from fastapi import APIRouter

from app.api.v1.endpoints import health
from app.modules.users.router import router as users_router
from app.modules.auth.router import router as auth_router
from app.modules.objects.router import router as objects_router
from app.modules.tasks.router import router as object_tasks_router
from app.modules.notifications.router import router as notifications_router
from app.modules.photos.router import router as photos_router
from app.modules.ai.router import router as ai_router

api_router = APIRouter()

api_router.include_router(
    health.router,
    prefix="/health",
    tags=["Health"],
)

api_router.include_router(
    users_router,
    prefix="/users",
    tags=["User Management"],
)

api_router.include_router(
    auth_router,
    prefix="/auth",
    tags=["Authentication"],
)

api_router.include_router(
    objects_router,
    prefix="/objects",
    tags=["Construction Objects"],
)

api_router.include_router(
    object_tasks_router,
    prefix="/objects",
    tags=["Object Tasks"],
)

api_router.include_router(
    notifications_router,
    prefix="/notifications",
    tags=["Notifications"],
)

api_router.include_router(
    photos_router,
    prefix="/photos",
    tags=["Photos"],
)

api_router.include_router(
    ai_router,
    prefix="/ai",
    tags=["AI Assistant"],
)
