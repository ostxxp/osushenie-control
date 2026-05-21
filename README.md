# Osushenie Control

Internal system for controlling construction objects, users, assignments, and object task progress.

The current repository contains the backend MVP. The frontend is not implemented yet.

![Python](https://img.shields.io/badge/Python-3.12-blue)
![FastAPI](https://img.shields.io/badge/FastAPI-Backend-009688)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Database-336791)
![SQLAlchemy](https://img.shields.io/badge/SQLAlchemy-ORM-red)
![Alembic](https://img.shields.io/badge/Alembic-Migrations-orange)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED)

## MVP Scope

Implemented backend features:

- authentication with access token and refresh token cookie
- logout and logout-all session revocation
- users with roles and phone number validation
- construction objects
- assigning users to objects
- responsible users for objects
- task templates imported from XMind
- object tasks copied from templates when an object is created
- task statuses, headers, full task tree, and available task branch inside a header
- pytest test suite
- Docker Compose startup blocked by backend tests

Not included in the current MVP:

- frontend
- task comments
- task files/photos
- task history/audit log
- notifications
- reports
- automatic single-choice branch handling

## Roles

- `admin` - manages users, objects, and system data
- `chief_engineer` - controls objects and task progress
- `foreman` - works with assigned objects and updates task statuses

## Tech Stack

- Python 3.12
- FastAPI
- PostgreSQL 16
- SQLAlchemy async ORM
- Alembic
- Pytest
- Docker Compose

## Project Structure

```text
backend/
  app/
    modules/
      auth/
      users/
      objects/
      tasks/
  alembic/
  scripts/
    parse_xmind.py
    import_task_templates.py
  tests/
docker-compose.yml
pytest.ini
```

## Environment

Create a local env file:

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` before running the project. Important variables:

```text
DATABASE_URL
POSTGRES_DB
POSTGRES_USER
POSTGRES_PASSWORD
SECRET_KEY
CORS_ORIGINS
ACCESS_TOKEN_EXPIRE_MINUTES
REFRESH_TOKEN_EXPIRE_DAYS
```

## Run With Docker

Run from the repository root:

```bash
docker compose up --build backend
```

Compose starts services in this order:

1. `db`
2. `backend-tests`
3. `backend`

The backend starts only if tests pass.

URLs:

```text
API:  http://localhost:8000
Docs: http://localhost:8000/docs
DB:   localhost:5433
```

## Migrations

Apply migrations:

```bash
docker compose exec backend alembic upgrade head
```

Check current revision:

```bash
docker compose exec backend alembic current
```

Create a new migration:

```bash
docker compose exec backend alembic revision --autogenerate -m "message"
```

If a migration was applied by mistake and it is the latest one:

```bash
docker compose exec backend alembic downgrade -1
```

Then remove the migration file if it should not exist.

## Tests

Run tests inside Docker:

```bash
docker compose run --rm backend-tests python -m pytest -q -o asyncio_mode=auto -o asyncio_default_fixture_loop_scope=function tests
```

Run tests locally from the repository root:

```bash
python -m pip install -r backend/requirements-dev.txt
pytest -q
```

GitHub Actions also runs backend tests on push and pull request.

## XMind Task Template Import

The source XMind map is stored locally in `devdata/` and is not committed.

Parse XMind into JSON:

```bash
python3 backend/scripts/parse_xmind.py
```

By default this reads:

```text
devdata/Контроль за объектом. Карта.xmind
```

and writes:

```text
devdata/task_templates.preview.json
```

To import templates inside Docker, put the JSON under `backend/devdata` because the backend container mounts `backend/` as `/app`:

```bash
mkdir -p backend/devdata
cp devdata/task_templates.preview.json backend/devdata/
docker compose exec backend python scripts/import_task_templates.py --input /app/devdata/task_templates.preview.json
```

The import script loads data into `task_templates`. It does not create object tasks directly.

When a new construction object is created, active templates are copied into `object_tasks` for that object.

## Main API Flow

Authentication:

```text
POST /api/v1/auth/login
POST /api/v1/auth/refresh
POST /api/v1/auth/logout
POST /api/v1/auth/logout-all
```

Objects:

```text
GET    /api/v1/objects
POST   /api/v1/objects
GET    /api/v1/objects/{object_id}
PATCH  /api/v1/objects/{object_id}
PATCH  /api/v1/objects/{object_id}/deactivate
POST   /api/v1/objects/{object_id}/assign/{user_id}
DELETE /api/v1/objects/{object_id}/unassign/{user_id}
```

Object tasks:

```text
GET   /api/v1/objects/{object_id}/tasks
GET   /api/v1/objects/{object_id}/tasks/tree
GET   /api/v1/objects/{object_id}/tasks/headers
GET   /api/v1/objects/{object_id}/tasks/{task_id}/available
PATCH /api/v1/objects/{object_id}/tasks/{task_id}/status
```

Frontend task flow:

1. Load object task headers.
2. User opens a header.
3. Frontend requests available tasks for that header.
4. User updates a task status.
5. Frontend requests available tasks again.

The backend stores task status and access rules. The frontend should render the task data returned by the backend and send status updates.
