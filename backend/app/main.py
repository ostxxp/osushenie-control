import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api.v1.router import api_router
from app.modules.notifications.deadline_service import deadline_notification_loop


@asynccontextmanager
async def lifespan(_: FastAPI):
    deadline_task = None
    if settings.DEADLINE_NOTIFICATIONS_ENABLED and settings.ENVIRONMENT != "test":
        deadline_task = asyncio.create_task(deadline_notification_loop())
    try:
        yield
    finally:
        if deadline_task is not None:
            deadline_task.cancel()
            await asyncio.gather(deadline_task, return_exceptions=True)


app = FastAPI(
    title=settings.PROJECT_NAME,
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")
