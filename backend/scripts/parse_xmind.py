from __future__ import annotations

import argparse
import json
import zipfile
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INPUT = PROJECT_ROOT / "devdata" / "Контроль за объектом. Карта.xmind"
DEFAULT_OUTPUT = PROJECT_ROOT / "devdata" / "task_templates.preview.json"


def normalize_title(value: str | None) -> str:
    return " ".join((value or "").strip().split())


def get_children(topic: dict[str, Any]) -> list[dict[str, Any]]:
    children = topic.get("children") or {}
    result: list[dict[str, Any]] = []

    for children_type in ("attached", "detached"):
        child_topics = children.get(children_type) or []
        if isinstance(child_topics, list):
            result.extend(child_topics)

    return result


def parse_topic(
    topic: dict[str, Any],
    *,
    parent_source_id: str | None = None,
    depth: int = 0,
    sort_order: int = 0,
    path: list[str] | None = None,
) -> dict[str, Any]:
    title = normalize_title(topic.get("title"))
    current_path = [*(path or []), title]

    return {
        "source_id": topic.get("id"),
        "parent_source_id": parent_source_id,
        "title": title,
        "depth": depth,
        "sort_order": sort_order,
        "path": current_path,
        "children": [
            parse_topic(
                child,
                parent_source_id=topic.get("id"),
                depth=depth + 1,
                sort_order=index,
                path=current_path,
            )
            for index, child in enumerate(get_children(topic))
        ],
    }


def flatten_topic(
    topic: dict[str, Any],
    *,
    sheet_source_id: str | None,
    sheet_title: str | None,
) -> list[dict[str, Any]]:
    children = topic["children"]
    current = {
        "sheet_source_id": sheet_source_id,
        "sheet_title": sheet_title,
        "source_id": topic["source_id"],
        "parent_source_id": topic["parent_source_id"],
        "title": topic["title"],
        "depth": topic["depth"],
        "sort_order": topic["sort_order"],
        "path": topic["path"],
        "has_children": bool(children),
    }

    result = [current]
    for child in children:
        result.extend(
            flatten_topic(
                child,
                sheet_source_id=sheet_source_id,
                sheet_title=sheet_title,
            )
        )

    return result


def read_content_json(xmind_path: Path) -> list[dict[str, Any]]:
    with zipfile.ZipFile(xmind_path) as archive:
        if "content.json" not in archive.namelist():
            raise ValueError(f"{xmind_path} does not contain content.json")

        content = json.loads(archive.read("content.json").decode("utf-8"))

    if not isinstance(content, list) or not content:
        raise ValueError("content.json must contain at least one sheet")

    return content


def parse_xmind(xmind_path: Path) -> dict[str, Any]:
    sheets = []
    flat_nodes = []

    for sheet in read_content_json(xmind_path):
        root_topic = sheet.get("rootTopic")
        if not isinstance(root_topic, dict):
            continue

        sheet_title = normalize_title(sheet.get("title"))
        root = parse_topic(root_topic)
        sheet_data = {
            "source_id": sheet.get("id"),
            "title": sheet_title,
            "root": root,
        }

        sheets.append(sheet_data)
        flat_nodes.extend(
            flatten_topic(
                root,
                sheet_source_id=sheet.get("id"),
                sheet_title=sheet_title,
            )
        )

    return {
        "source_file": str(xmind_path),
        "sheets": sheets,
        "nodes": flat_nodes,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Parse XMind task map into a JSON preview for task template import."
    )
    parser.add_argument(
        "--input",
        type=Path,
        default=DEFAULT_INPUT,
        help=f"Path to .xmind file. Default: {DEFAULT_INPUT}",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help=f"Path to output JSON file. Default: {DEFAULT_OUTPUT}",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    result = parse_xmind(args.input)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(result, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(
        f"Parsed {len(result['nodes'])} nodes from {len(result['sheets'])} sheet(s) "
        f"into {args.output}"
    )


if __name__ == "__main__":
    main()
