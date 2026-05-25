from app.modules.users.schemas import UserRead
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session

from app.modules.objects.models import ConstructionObject, ObjectToUser

from sqlalchemy import select

from app.modules.objects.dependencies import get_object_or_404, get_object_to_user_or_404

from app.modules.objects.schemas import ObjectBase, ObjectRead, ObjectUpdate

from app.modules.users.dependencies import get_current_auth_user, require_admin, get_user_or_404
from app.modules.users.dependencies import require_chief_engineer_or_admin, require_logged_in_user
from app.modules.users.models import User
from app.modules.objects.service import set_responsible_status
from app.modules.tasks.service import copy_task_templates_to_object


router = APIRouter()


@router.post(
        "", response_model=ObjectRead,
        status_code=status.HTTP_201_CREATED,
        summary="Create a new object",
        dependencies=[Depends(require_admin)]
)
async def create_object(
    object_in: ObjectBase,
    db: AsyncSession = Depends(get_db_session)
):
    new_object = ConstructionObject(
        name=object_in.name,
        address=object_in.address,
        is_active=object_in.is_active,
        start_date=object_in.start_date,
        end_date=object_in.end_date
    )
    db.add(new_object)
    await db.flush()
    await copy_task_templates_to_object(db, object_id=new_object.id)
    await db.commit()
    await db.refresh(new_object)
    return new_object

@router.get(
        "", response_model=list[ObjectRead],
        summary="Get a list of all objects that user has access to"
)
async def list_objects(
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_auth_user)
):
    query = select(ConstructionObject)

    if user.role == "foreman":
        query = (
            query
            .join(ObjectToUser)
            .where(ObjectToUser.user_id == user.id)
        )
    elif user.role != "admin" and user.role != "chief_engineer":
        raise HTTPException(status_code=403, detail="Forbidden")

    result = await db.execute(query)
    objects = result.scalars().all()
    return objects

@router.get(
    "/responsible", response_model=list[ObjectRead],
    summary="Get a list of all objects the user is responsible for",
    dependencies=[Depends(require_logged_in_user)]
)
async def list_responsible_objects(
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_auth_user)
):
    result = await db.execute(
        select(ConstructionObject)
        .join(ObjectToUser)
        .where(
            ObjectToUser.user_id == user.id,
            ObjectToUser.is_responsible == True
        )
    )

    objects = result.scalars().all()
    return objects

@router.get(
    "/responsible/{object_id}", response_model=list[UserRead],
    summary="Get a list of all users responsible for an object",
    dependencies=[Depends(require_logged_in_user)]
)
async def list_responsible_users(
    object: ConstructionObject = Depends(get_object_or_404),
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_auth_user)
):  
    result = await db.execute(
        select(User)
        .join(ObjectToUser)
        .where(
            ObjectToUser.object_id == object.id,
            ObjectToUser.user_id == user.id,
            ObjectToUser.is_responsible == True
        )
    )
    users = result.scalars().all()
    return users
        

@router.get(
    "/{object_id}", response_model=ObjectRead,
    summary="Get object details by ID"
)
async def get_object(
    object: ConstructionObject = Depends(get_object_or_404),
    user: User = Depends(get_current_auth_user),
    db: AsyncSession = Depends(get_db_session)
):
    if user.role == "foreman":
        result = await db.execute(
            select(ObjectToUser).where(
                ObjectToUser.object_id == object.id,
                ObjectToUser.user_id == user.id,
            )
        )

        association = result.scalar_one_or_none()

        if association is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have access to this object.",
            )
    return object

@router.patch(
    "/{object_id}", response_model=ObjectRead,
    summary="Update object details by ID",
    dependencies=[Depends(require_admin)]
)
async def update_object(
    object_data: ObjectUpdate,
    object: ConstructionObject = Depends(get_object_or_404),
    db: AsyncSession = Depends(get_db_session)
):
    for field, value in object_data.model_dump(exclude_unset=True).items():
        setattr(object, field, value)
    
    db.add(object)
    await db.commit()
    await db.refresh(object)
    return object

@router.patch(
    "/{object_id}/deactivate", response_model=ObjectRead,
    summary="Deactivate an object by ID",
    dependencies=[Depends(require_admin)]
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


## OBJECT ASSIGNMENT ENDPOINTS ##

@router.post(
    "/{object_id}/assign/{user_id}",
    response_model=ObjectRead,
    summary="Assign a user to an object",
    dependencies=[Depends(require_chief_engineer_or_admin)]
)
async def assign_user_to_object(
    object: ConstructionObject = Depends(get_object_or_404),
    user: User = Depends(get_user_or_404),
    db: AsyncSession = Depends(get_db_session)
):
    existing_association = await db.execute(
        select(ObjectToUser).where(
            ObjectToUser.object_id == object.id,
            ObjectToUser.user_id == user.id,
        )
    )
    if existing_association.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is already assigned to the object.",
        )
    association = ObjectToUser(
        object_id=object.id,
        user_id=user.id,
        is_responsible=False
    )
    db.add(association)
    await db.commit()
    await db.refresh(object)
    return object

@router.delete(
    "/{object_id}/unassign/{user_id}",
    response_model=ObjectRead,
    summary="Unassign a user from an object",
    dependencies=[Depends(require_chief_engineer_or_admin)]
)
async def unassign_user_from_object(
    object_to_user: ObjectToUser = Depends(get_object_to_user_or_404),
    db: AsyncSession = Depends(get_db_session)
):
    if object_to_user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User is not assigned to the object.",
        )
    await db.delete(object_to_user)
    await db.commit()
    object = await get_object_or_404(object_id=object_to_user.object_id, db=db)
    return object

@router.patch(
    "/{object_id}/assign/{user_id}/responsible",
    response_model=ObjectRead,
    summary="Assign a user as responsible for an object",
    dependencies=[Depends(require_chief_engineer_or_admin)]
)
async def assign_responsible_to_object(
    object: ConstructionObject = Depends(get_object_or_404),
    user: User = Depends(get_user_or_404),
    db: AsyncSession = Depends(get_db_session)
):
    return await set_responsible_status(object, user, db, True)

@router.patch(
    "/{object_id}/unassign/{user_id}/responsible",
    response_model=ObjectRead,
    summary="Unassign a user as responsible for an object",
    dependencies=[Depends(require_chief_engineer_or_admin)]
)
async def unassign_responsible_from_object(
    object: ConstructionObject = Depends(get_object_or_404),
    user: User = Depends(get_user_or_404),
    db: AsyncSession = Depends(get_db_session)
):
    return await set_responsible_status(object, user, db, False)
