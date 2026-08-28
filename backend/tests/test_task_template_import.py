from scripts.parse_xmind import flatten_topic, parse_topic


def test_parsed_task_template_uses_tree_without_fixed_stage() -> None:
    topic = {
        "id": "root",
        "title": "Проект",
        "children": {
            "attached": [
                {
                    "id": "contract",
                    "title": "Договор подряда",
                }
            ]
        },
    }

    parsed = parse_topic(topic)
    nodes = flatten_topic(
        parsed,
        sheet_source_id="sheet",
        sheet_title="Карта проекта",
    )

    assert [node["title"] for node in nodes] == ["Проект", "Договор подряда"]
    assert nodes[1]["parent_source_id"] == "root"
    assert all("stage" not in node for node in nodes)
