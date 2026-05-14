from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session

from app.modules.objects.models import ConstructionObject

from sqlalchemy import select

from app.modules.objects.dependencies import get_object_or_404

from app.modules.objects.schemas import ObjectBase, ObjectRead, ObjectUpdate

from app.modules.users.dependencies import require_chief_engineer

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


router = APIRouter()


@router.post(
        "", response_model=ObjectRead,
        status_code=status.HTTP_201_CREATED,
        summary="Create a new object",
        dependencies=[Depends(require_chief_engineer)]
)
async def create_object(
    object_in: ObjectBase,
    db: AsyncSession = Depends(get_db_session)
):
    new_object = ConstructionObject(
        name=object_in.name,
        description=object_in.description,
        address=object_in.address,
        is_active=object_in.is_active,
        start_date=object_in.start_date,
        end_date=object_in.end_date
    )
    db.add(new_object)
    await db.commit()
    await db.refresh(new_object)
    return new_object

@router.get(
    "/{object_id}", response_model=ObjectRead,
    summary="Get object details by ID"
)
async def get_object(
    object: ConstructionObject = Depends(get_object_or_404),
    db: AsyncSession = Depends(get_db_session)
):
    return object

@router.patch(
    "/{object_id}", response_model=ObjectRead,
    summary="Update object details by ID",
    dependencies=[Depends(require_chief_engineer)]
)
async def update_object(
    object_data: ObjectUpdate,
    object: ConstructionObject = Depends(get_object_or_404),
    db: AsyncSession = Depends(get_db_session)
):
    for field, value in object_data.items():
        setattr(object, field, value)
    
    db.add(object)
    await db.commit()
    await db.refresh(object)
    return object

@router.patch(
    "/{object_id}/deactivate", response_model=ObjectRead,
    summary="Deactivate an object by ID",
    dependencies=[Depends(require_chief_engineer)]
)
async def deactivate_object(
    object: ConstructionObject = Depends(get_object_or_404),
    db: AsyncSession = Depends(get_db_session)
):
    object.is_active = False
    db.add(object)
    await db.commit()
    await db.refresh(object)
    return object