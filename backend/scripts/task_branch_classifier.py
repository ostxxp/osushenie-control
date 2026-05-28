from __future__ import annotations

import re
from typing import Any


ALL_CHILDREN_MODE = "all"
SINGLE_CHOICE_CHILDREN_MODE = "single_choice"


def normalize_title(value: str | None) -> str:
    value = (value or "").lower().replace("ё", "е")
    value = re.sub(r"[^а-яa-z0-9]+", " ", value)
    return " ".join(value.split())


def is_negative_choice(value: str | None) -> bool:
    title = normalize_title(value)
    return (
        title in {"не", "нет", "без"}
        or title.startswith(("не ", "нет ", "без "))
        or " не " in title
        or " без " in title
    )


def classify_children_mode(
    parent: dict[str, Any],
    children: list[dict[str, Any]],
) -> str:
    if len(children) < 2:
        return ALL_CHILDREN_MODE

    child_titles = [normalize_title(child.get("title")) for child in children]

    if len(children) == 2 and set(child_titles) == {"есть", "нет"}:
        return SINGLE_CHOICE_CHILDREN_MODE

    if len(children) == 2 and all("финансирован" in title for title in child_titles):
        return SINGLE_CHOICE_CHILDREN_MODE

    if (
        len(children) == 2
        and "утвердил рд" in child_titles
        and any("выявил замечания" in title for title in child_titles)
    ):
        return SINGLE_CHOICE_CHILDREN_MODE

    if len(children) == 2 and sum(
        is_negative_choice(child.get("title"))
        for child in children
    ) == 1:
        return SINGLE_CHOICE_CHILDREN_MODE

    return ALL_CHILDREN_MODE
