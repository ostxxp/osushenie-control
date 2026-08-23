import type { ProjectStageSummary } from '@/types'

type StageStepperProps = {
  stages: ProjectStageSummary[]
}

const isComplete = (stage: ProjectStageSummary): boolean =>
  stage.stats.total > 0 && stage.stats.done === stage.stats.total

export const getCurrentStage = (stages: ProjectStageSummary[]): number => Math.min(
  6,
  Math.max(1, stages.findIndex((stage) => !isComplete(stage)) + 1 || stages.length + 1),
)

export default function StageStepper({ stages }: StageStepperProps) {
  const currentStage = getCurrentStage(stages)

  return (
    <div className="min-w-0" aria-label={`Макроэтап ${currentStage} из 6`}>
      <div className="flex items-center gap-1">
        {Array.from({ length: 6 }, (_, index) => {
          const stageNumber = index + 1
          const isDone = stageNumber < currentStage
          const isCurrent = stageNumber === currentStage
          return (
            <div
              key={stageNumber}
              className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                isDone
                  ? 'bg-emerald-500 text-white'
                  : isCurrent
                    ? 'bg-[#ff4539] text-white ring-4 ring-[#ff4539]/15'
                    : 'bg-slate-100 text-slate-400'
              }`}
              title={stages[index]?.title || `Макроэтап ${stageNumber}`}
            >
              {stageNumber}
            </div>
          )
        })}
      </div>
      <p className="mt-1 text-xs font-medium text-slate-600">Этап {currentStage} из 6</p>
    </div>
  )
}
