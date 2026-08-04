type CurrentStepCellProps = {
  step?: string
}

export default function CurrentStepCell({ step = 'Заявка в ПТО' }: CurrentStepCellProps) {
  return <span className="font-medium text-slate-800">{step}</span>
}
