from typing import Literal

from pydantic import BaseModel, Field, field_validator


MAX_RECEIVED_HISTORY_MESSAGES = 100


class AIChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class AIChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    history: list[AIChatMessage] = Field(default_factory=list)

    @field_validator("history", mode="before")
    @classmethod
    def trim_history(cls, value):
        if isinstance(value, list):
            return value[-MAX_RECEIVED_HISTORY_MESSAGES:]
        return value


class AIChatResponse(BaseModel):
    answer: str
