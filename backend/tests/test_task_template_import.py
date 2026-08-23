from app.modules.tasks.stages import ProjectStage
from scripts.import_task_templates import resolve_node_stages


def test_resolve_node_stages_inherits_stage_from_main_branch() -> None:
    nodes = [
        {
            "source_id": "contract",
            "parent_source_id": "project",
            "title": "Договор подряда",
            "depth": 1,
            "sort_order": 0,
            "path": ["Проект", "Договор подряда"],
        },
        {
            "source_id": "contract-signed",
            "parent_source_id": "contract",
            "title": "Подписан",
            "depth": 2,
            "sort_order": 0,
            "path": ["Проект", "Договор подряда", "Подписан"],
        },
        {
            "source_id": "safety",
            "parent_source_id": "project",
            "title": "Охрана Труда",
            "depth": 1,
            "sort_order": 1,
            "path": ["Проект", "Охрана Труда"],
        },
    ]

    stages = resolve_node_stages(nodes, root_source_ids={"project"})

    assert stages == {
        "contract": ProjectStage.CONTRACT_START,
        "contract-signed": ProjectStage.CONTRACT_START,
        "safety": ProjectStage.SAFETY_INDUSTRIAL,
    }


def test_resolve_node_stages_prefers_explicit_stage() -> None:
    nodes = [
        {
            "source_id": "operations",
            "parent_source_id": "project",
            "title": "Работа насосов",
            "depth": 1,
            "sort_order": 0,
            "stage": "operation_monitoring",
        }
    ]

    stages = resolve_node_stages(nodes, root_source_ids={"project"})

    assert stages["operations"] == ProjectStage.OPERATION_MONITORING
