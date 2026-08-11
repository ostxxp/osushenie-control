import { Link } from 'react-router-dom'
import { formatDateRu } from '@/utils'
import type { ObjectSummary, ObjectTask, User } from '@/types'
import CurrentStepCell from './CurrentStepCell'
import ResponsibleBadge from './ResponsibleBadge'
import StageStepper from './StageStepper'
import StatusFlag from './StatusFlag'

type ObjectTableProps = {
  objects: ObjectSummary[]
  responsibleByObjectId: Record<number, User | undefined>
  stagesByObjectId: Record<number, ObjectTask[]>
}

const isWaiting = (object: ObjectSummary) => object.stats.todo > 0 && object.stats.in_progress === 0 && object.stats.overdue === 0

function DeadlineCell({ object }: { object: ObjectSummary }) {
  if (!object.end_date) return <span className="text-sm text-base-content/50">Не указан</span>
  return (
    <div className="space-y-1 whitespace-nowrap">
      <div className="text-sm font-medium text-slate-800">{formatDateRu(object.end_date)}</div>
      {object.stats.overdue > 0 && <div className="text-xs font-medium text-red-600">Просрочено задач: {object.stats.overdue}</div>}
    </div>
  )
}

export default function ObjectTable({ objects, responsibleByObjectId, stagesByObjectId }: ObjectTableProps) {
  return (
    <div className="overflow-x-auto border border-base-200 bg-base-100">
      <table className="w-full min-w-[960px] table-fixed text-left">
        <colgroup>
          <col className="w-[20%]" />
          <col className="w-[15%]" />
          <col className="w-[24%]" />
          <col className="w-[14%]" />
          <col className="w-[14%]" />
          <col className="w-[13%]" />
        </colgroup>
        <thead className="bg-base-200 text-sm text-black">
          <tr>
            <th className="px-3 py-3 font-semibold">Объект</th>
            <th className="px-3 py-3 font-semibold">Этап</th>
            <th className="px-3 py-3 font-semibold">Текущий шаг</th>
            <th className="px-3 py-3 font-semibold">Прогресс</th>
            <th className="px-3 py-3 font-semibold">Срок</th>
            <th className="px-3 py-3 font-semibold">Флаг</th>
          </tr>
        </thead>
        <tbody>
          {objects.length === 0 ? (
            <tr><td colSpan={6} className="px-5 py-8 text-center text-base-content/60">Объектов не найдено.</td></tr>
          ) : objects.map((object) => (
            <tr key={object.id} className="border-b border-slate-100 align-middle transition-colors last:border-b-0 hover:bg-base-200">
              <td className="px-3 py-3">
                <Link to={`/objects/${object.id}`} className="font-semibold text-slate-900 hover:text-primary hover:underline">{object.name}</Link>
                <p className="mt-1 truncate text-xs text-slate-500" title={object.address}>{object.address}</p>
              </td>
              <td className="px-3 py-3"><StageStepper stages={stagesByObjectId[object.id] || []} /></td>
              <td className="px-3 py-3">
                <CurrentStepCell />
                <div className="mt-2 border-t border-slate-100 pt-2">
                  <ResponsibleBadge user={responsibleByObjectId[object.id]} />
                </div>
              </td>
              <td className="px-3 py-3">
                <div className="min-w-0">
                  <div className="mb-1 flex justify-between text-xs"><span className="text-slate-500">Готово</span><span className="font-semibold text-slate-800">{object.progress}%</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#ff4539]" style={{ width: `${Math.max(0, Math.min(100, object.progress))}%` }} /></div>
                </div>
              </td>
              <td className="px-3 py-3"><DeadlineCell object={object} /></td>
              <td className="px-3 py-3"><StatusFlag overdueCount={object.stats.overdue} waiting={isWaiting(object)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
