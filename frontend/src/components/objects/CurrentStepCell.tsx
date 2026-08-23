import { useState } from 'react'

type CurrentStepCellProps = {
  step?: string
}

const COLLAPSED_LENGTH = 90

export default function CurrentStepCell({ step = 'Заявка в ПТО' }: CurrentStepCellProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const isLong = step.length > COLLAPSED_LENGTH
  const visibleStep = isLong && !isExpanded
    ? `${step.slice(0, COLLAPSED_LENGTH).trimEnd()}…`
    : step

  return (
    <div className="min-w-0">
      <span className="break-words font-medium text-slate-800">{visibleStep}</span>
      {isLong && (
        <button
          type="button"
          className="mt-1 block text-left text-xs font-semibold text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          aria-expanded={isExpanded}
          onClick={() => setIsExpanded((value) => !value)}
        >
          {isExpanded ? 'Свернуть' : 'Показать полностью'}
        </button>
      )}
    </div>
  )
}
