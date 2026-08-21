from dataclasses import dataclass
from enum import StrEnum


class ProjectStage(StrEnum):
    CONTRACT_START = "contract_start"
    DOCUMENTATION_APPROVALS = "documentation_approvals"
    PREPARATION_MOBILIZATION = "preparation_mobilization"
    SAFETY_INDUSTRIAL = "safety_industrial"
    CONSTRUCTION_INSTALLATION = "construction_installation"
    OPERATION_MONITORING = "operation_monitoring"
    HANDOVER_ACCEPTANCE = "handover_acceptance"
    COMPLETION_WARRANTY = "completion_warranty"


@dataclass(frozen=True)
class ProjectStageDefinition:
    code: ProjectStage
    title: str
    order: int


PROJECT_STAGES = (
    ProjectStageDefinition(ProjectStage.CONTRACT_START, "Договор подряда", 1),
    ProjectStageDefinition(
        ProjectStage.DOCUMENTATION_APPROVALS,
        "Рабочая документация",
        2,
    ),
    ProjectStageDefinition(
        ProjectStage.PREPARATION_MOBILIZATION,
        "Ответственный ИТР за объект",
        3,
    ),
    ProjectStageDefinition(
        ProjectStage.SAFETY_INDUSTRIAL,
        "Охрана труда",
        4,
    ),
    ProjectStageDefinition(
        ProjectStage.CONSTRUCTION_INSTALLATION,
        "Основной этап СМР",
        5,
    ),
    ProjectStageDefinition(
        ProjectStage.OPERATION_MONITORING,
        "Эксплуатация системы водопонижения",
        6,
    ),
    ProjectStageDefinition(
        ProjectStage.HANDOVER_ACCEPTANCE,
        "Сдача и приёмка работ",
        7,
    ),
    ProjectStageDefinition(
        ProjectStage.COMPLETION_WARRANTY,
        "Завершение работ по договору",
        8,
    ),
)


def infer_project_stage(title: str) -> ProjectStage:
    normalized = title.casefold()
    if "охрана труд" in normalized or "промбезопас" in normalized:
        return ProjectStage.SAFETY_INDUSTRIAL
    if "рабочая документац" in normalized or "согласован" in normalized:
        return ProjectStage.DOCUMENTATION_APPROVALS
    if (
        "мобилизац" in normalized
        or "подготов" in normalized
        or "ответственный итр" in normalized
    ):
        return ProjectStage.PREPARATION_MOBILIZATION
    if "эксплуатац" in normalized or "мониторинг" in normalized:
        return ProjectStage.OPERATION_MONITORING
    if "заверш" in normalized or "демобилизац" in normalized or "гарант" in normalized:
        return ProjectStage.COMPLETION_WARRANTY
    if "сдач" in normalized or "приёмк" in normalized or "приемк" in normalized:
        return ProjectStage.HANDOVER_ACCEPTANCE
    if "договор" in normalized:
        return ProjectStage.CONTRACT_START
    return ProjectStage.CONSTRUCTION_INSTALLATION
