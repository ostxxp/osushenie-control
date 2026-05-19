from datetime import datetime
import re

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.modules.users.models import UserRole


_PHONE_ALLOWED_PATTERN = re.compile(r"^\+?[0-9\s().-]+$")


def _validate_phone_number(value: str | None) -> str | None:
    if value is None:
        return None

    phone_number = " ".join(value.strip().split())
    if phone_number == "":
        return None

    if not _PHONE_ALLOWED_PATTERN.fullmatch(phone_number):
        raise ValueError(
            "Phone number can contain only digits, spaces, '.', '-', parentheses, and one leading '+'."
        )

    if not _has_valid_parentheses(phone_number):
        raise ValueError("Phone number contains invalid parentheses.")

    digits_count = sum(char.isdigit() for char in phone_number)
    if digits_count < 7 or digits_count > 15:
        raise ValueError("Phone number must contain 7 to 15 digits.")

    return phone_number


def _has_valid_parentheses(value: str) -> bool:
    opened = False
    has_digit_inside = False

    for char in value:
        if char == "(":
            if opened:
                return False
            opened = True
            has_digit_inside = False
        elif char == ")":
            if not opened or not has_digit_inside:
                return False
            opened = False
        elif opened and char.isdigit():
            has_digit_inside = True

    return not opened


class PhoneNumberMixin(BaseModel):
    @field_validator("phone_number", mode="before", check_fields=False)
    @classmethod
    def validate_phone_number(cls, value: str | None) -> str | None:
        return _validate_phone_number(value)


class UserBase(PhoneNumberMixin):
    full_name: str = Field(min_length=2, max_length=255)
    email: EmailStr
    phone_number: str | None = Field(default=None, max_length=32)
    role: UserRole
    is_active: bool = True


class UserCreate(UserBase):
    password: str = Field(min_length=8, max_length=128)


class UserUpdate(PhoneNumberMixin):
    full_name: str | None = Field(default=None, min_length=2, max_length=255)
    password: str | None = Field(default=None, min_length=8, max_length=128)
    email: EmailStr | None = None
    phone_number: str | None = Field(default=None, max_length=32)
    role: UserRole | None = None
    is_active: bool | None = None


class UserRead(UserBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = {
        "from_attributes": True,
    }
