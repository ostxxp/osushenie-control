import argparse
import asyncio
import json
import sys
from pathlib import Path

from sqlalchemy import select
from sqlalchemy import update

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.db.session import AsyncSessionLocal
from app.modules.tasks.models import ObjectTask, TaskChildrenMode, TaskTemplate
from app.modules.tasks.stages import ProjectStage, infer_project_stage
from scripts.task_branch_classifier import classify_children_mode


def resolve_node_stages(
    nodes: list[dict],
    *,
    root_source_ids: set[str],
) -> dict[str, ProjectStage]:
    stages_by_source_id: dict[str, ProjectStage] = {}

    for node in sorted(nodes, key=lambda item: (item["depth"], item["sort_order"])):
        source_id = node["source_id"]
        parent_source_id = node["parent_source_id"]
        explicit_stage = node.get("stage")

        if explicit_stage:
            stage = ProjectStage(explicit_stage)
        elif parent_source_id in root_source_ids:
            stage = infer_project_stage(node["title"])
        else:
            stage = stages_by_source_id.get(parent_source_id)
            if stage is None:
                path = node.get("path") or []
                stage_root_title = path[1] if len(path) > 1 else node["title"]
                stage = infer_project_stage(stage_root_title)

        stages_by_source_id[source_id] = stage

    return stages_by_source_id


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
    children_by_parent_source_id: dict[str | None, list[dict]] = {}
    for node in data["nodes"]:
        children_by_parent_source_id.setdefault(
            node["parent_source_id"],
            [],
        ).append(node)

    source_ids = {node["source_id"] for node in nodes}
    stages_by_source_id = resolve_node_stages(
        nodes,
        root_source_ids=root_source_ids,
    )

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
            template.children_mode = TaskChildrenMode(
                node.get("children_mode")
                or classify_children_mode(
                    node,
                    children_by_parent_source_id.get(source_id, []),
                )
            )
            template.stage = stages_by_source_id[source_id]
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

            await db.execute(
                update(ObjectTask)
                .where(ObjectTask.template_id == template.id)
                .values(
                    children_mode=template.children_mode,
                    stage=template.stage,
                )
            )

        await db.commit()

    print(f"Imported {len(nodes)} task templates")

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    args = parser.parse_args()

    asyncio.run(import_task_templates(args.input))


if __name__ == "__main__":
    main()
