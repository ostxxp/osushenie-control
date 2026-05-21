from collections.abc import AsyncGenerator, Callable
from datetime import date

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.security import hash_password
from app.db.base import Base
from app.db.session import get_db_session
from app.main import app
from app.modules.auth.models import AuthSession, RevokedAccessToken  # noqa: F401
from app.modules.objects.models import ConstructionObject, ObjectToUser  # noqa: F401
from app.modules.tasks.models import ObjectTask, TaskTemplate  # noqa: F401
from app.modules.users.models import User, UserRole


TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture
async def session_factory() -> AsyncGenerator[async_sessionmaker[AsyncSession], None]:
    engine = create_async_engine(
        TEST_DATABASE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    factory = async_sessionmaker(
        bind=engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    yield factory

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)

    await engine.dispose()


@pytest.fixture
async def client(
    session_factory: async_sessionmaker[AsyncSession],
) -> AsyncGenerator[AsyncClient, None]:
    async def override_get_db_session() -> AsyncGenerator[AsyncSession, None]:
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db_session] = override_get_db_session

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as test_client:
        yield test_client

    app.dependency_overrides.clear()


@pytest.fixture
def create_test_user(
    session_factory: async_sessionmaker[AsyncSession],
) -> Callable[..., object]:
    async def _create_test_user(
        *,
        full_name: str = "Test User",
        email: str = "user@example.com",
        password: str = "password123",
        role: UserRole = UserRole.FOREMAN,
        phone_number: str | None = None,
        is_active: bool = True,
    ) -> User:
        async with session_factory() as session:
            user = User(
                full_name=full_name,
                email=email,
                phone_number=phone_number,
                hashed_password=hash_password(password),
                role=role,
                is_active=is_active,
            )
            session.add(user)
            await session.commit()
            await session.refresh(user)
            return user

    return _create_test_user


@pytest.fixture
def create_test_object(
    session_factory: async_sessionmaker[AsyncSession],
) -> Callable[..., object]:
    async def _create_test_object(
        *,
        name: str = "Object",
        address: str = "Address",
        start_date: date = date(2026, 1, 1),
    ) -> ConstructionObject:
        async with session_factory() as session:
            obj = ConstructionObject(
                name=name,
                description=None,
                address=address,
                is_active=True,
                start_date=start_date,
                end_date=None,
            )
            session.add(obj)
            await session.commit()
            await session.refresh(obj)
            return obj

    return _create_test_object


@pytest.fixture
def create_task_template(
    session_factory: async_sessionmaker[AsyncSession],
) -> Callable[..., object]:
    async def _create_task_template(
        *,
        title: str = "Task template",
        parent_id: int | None = None,
        source_id: str | None = None,
        parent_source_id: str | None = None,
        depth: int = 0,
        sort_order: int = 0,
        is_active: bool = True,
    ) -> TaskTemplate:
        async with session_factory() as session:
            template = TaskTemplate(
                parent_id=parent_id,
                source_id=source_id,
                parent_source_id=parent_source_id,
                title=title,
                depth=depth,
                sort_order=sort_order,
                is_active=is_active,
            )
            session.add(template)
            await session.commit()
            await session.refresh(template)
            return template

    return _create_task_template


async def login(
    client: AsyncClient,
    *,
    email: str,
    password: str = "password123",
) -> str:
    response = await client.post(
        "/api/v1/auth/login",
        data={
            "username": email,
            "password": password,
        },
    )
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


def auth_headers(access_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {access_token}"}
