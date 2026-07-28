type StatusFlagProps = {
  overdueCount: number
  waiting: boolean
}

export default function StatusFlag({ overdueCount, waiting }: StatusFlagProps) {
  const status = overdueCount > 0 ? 'overdue' : waiting ? 'waiting' : 'ok'
  const styles = {
    overdue: 'bg-red-50 text-red-700 ring-red-200',
    waiting: 'bg-amber-50 text-amber-700 ring-amber-200',
    ok: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  }[status]
  const labels = { overdue: 'Просрочено', waiting: 'Ожидание', ok: 'Всё в порядке' }[status]

  return <span className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1.5 text-xs font-semibold ring-1 ${styles}`}><span className="h-2 w-2 rounded-full bg-current" />{labels}</span>
}
