from typing import Literal

from pydantic import BaseModel, Field


class AIChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class AIChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    history: list[AIChatMessage] = Field(default_factory=list, max_length=20)


class AIChatResponse(BaseModel):
    answer: str
