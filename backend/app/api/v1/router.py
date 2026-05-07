from fastapi import APIRouter

from app.api.v1.endpoints import health
from app.modules.users.router import router as users_router

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
