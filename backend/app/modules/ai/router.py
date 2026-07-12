from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.modules.ai.schemas import AIChatRequest, AIChatResponse
from app.modules.ai.service import get_ai_chat_answer
from app.modules.users.dependencies import require_admin


router = APIRouter()


@router.post(
    "/chat",
    response_model=AIChatResponse,
    summary="Chat with AI assistant",
    dependencies=[Depends(require_admin)],
)
async def chat_with_ai_assistant(
    chat_data: AIChatRequest,
    db: AsyncSession = Depends(get_db_session),
) -> AIChatResponse:
    answer = await get_ai_chat_answer(
        db,
        message=chat_data.message,
        history=chat_data.history,
    )
    return AIChatResponse(answer=answer)
