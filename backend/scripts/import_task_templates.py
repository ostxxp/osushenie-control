import argparse
import asyncio
import json
import sys
from pathlib import Path

from sqlalchemy import select

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.db.session import AsyncSessionLocal
from app.modules.tasks.models import TaskTemplate


async def import_task_templates(input_path: Path) -> None:
    data = json.loads(input_path.read_text(encoding="utf-8"))

    root_source_ids = {
        sheet["root"]["source_id"]
        for sheet in data["sheets"]
    }

    nodes = [
        node
        for node in data["nodes"]
        if node["source_id"] not in root_source_ids
    ]

    source_ids = {node["source_id"] for node in nodes}

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(TaskTemplate).where(TaskTemplate.source_id.in_(source_ids))
        )
        existing = {
            template.source_id: template
            for template in result.scalars().all()
        }

        by_source_id: dict[str, TaskTemplate] = {}

        for node in nodes:
            source_id = node["source_id"]

            template = existing.get(source_id)
            if template is None:
                template = TaskTemplate(source_id=source_id)
                db.add(template)

            template.parent_source_id = node["parent_source_id"]
            template.title = node["title"]
            template.depth = max(node["depth"] - 1, 0)
            template.sort_order = node["sort_order"]
            template.is_active = True

            by_source_id[source_id] = template

        await db.flush()

        for node in nodes:
            template = by_source_id[node["source_id"]]
            parent_source_id = node["parent_source_id"]

            if parent_source_id in root_source_ids:
                template.parent_id = None
            else:
                parent = by_source_id.get(parent_source_id)
                template.parent_id = parent.id if parent else None

        await db.commit()

    print(f"Imported {len(nodes)} task templates")

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    args = parser.parse_args()

    asyncio.run(import_task_templates(args.input))


if __name__ == "__main__":
    main()
