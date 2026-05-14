from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.modules.users.service import create_user, get_user_by_email, get_current_user
from app.modules.users.service import is_chief_engineer, user_exists

from app.modules.objects.models import ObjectToForeman, ConstructionObject
from app.modules.users.models import User

from sqlalchemy import select

from app.core.security import hash_password

from app.modules.objects.schemas import ObjectBase, ObjectRead, ObjectUpdate

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


router = APIRouter()


@router.post(
        "", response_model=ObjectRead,
        status_code=status.HTTP_201_CREATED,
        summary="Create a new object"    
)
async def create_object(
    object_in: ObjectBase,
    db: AsyncSession = Depends(get_db_session),
    token: str = Depends(oauth2_scheme)
):
    if not is_chief_engineer(db=db, token=token):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only chief engineers can create objects"
        )
    
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
    object_id: int,
    db: AsyncSession = Depends(get_db_session)
):
    result = await db.execute(select(ConstructionObject).where(ConstructionObject.id == object_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Object not found"
        )
    return obj

@router.patch(
    "/{object_id}", response_model=ObjectRead,
    summary="Update object details by ID"
)
async def update_object(
    object_id: int,
    object_in: ObjectUpdate,
    db: AsyncSession = Depends(get_db_session),
    token: str = Depends(oauth2_scheme)
):
    if not is_chief_engineer(db=db, token=token):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only chief engineers can update objects"
        )
    
    result = await db.execute(select(ConstructionObject).where(ConstructionObject.id == object_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Object not found"
        )
    
    for field, value in object_in.dict(exclude_unset=True).items():
        setattr(obj, field, value)
    
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj

@router.patch(
    "/{object_id}/deactivate", response_model=ObjectRead,
    summary="Deactivate an object by ID"
)
async def deactivate_object(
    object_id: int,
    db: AsyncSession = Depends(get_db_session),
    token: str = Depends(oauth2_scheme)
):
    if not is_chief_engineer(db=db, token=token):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only chief engineers can deactivate objects"
        )
    
    result = await db.execute(select(ConstructionObject).where(ConstructionObject.id == object_id))
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Object not found"
        )
    
    obj.is_active = False
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj