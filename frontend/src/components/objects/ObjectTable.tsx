import { Link } from 'react-router-dom'
import { formatDateRu } from '@/utils'
import type { ObjectSummary, ProjectStageSummary, User } from '@/types'
import CurrentStepCell from './CurrentStepCell'
import ResponsibleBadge from './ResponsibleBadge'
import StageStepper from './StageStepper'

type ObjectTableProps = {
  objects: ObjectSummary[]
  responsibleByObjectId: Record<number, User | undefined>
  stagesByObjectId: Record<number, ProjectStageSummary[]>
}

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
    <div>
      <div className="space-y-3 lg:hidden">
        {objects.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-base-300 bg-base-100 px-4 py-8 text-center text-sm text-base-content/60">Объектов не найдено.</div>
        ) : objects.map((object) => (
          <article key={object.id} className="rounded-2xl border border-base-200 bg-base-100 p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link to={`/objects/${object.id}`} className="break-words font-semibold text-slate-900 hover:text-primary">{object.name}</Link>
                <p className="mt-1 break-words text-xs text-slate-500">{object.address}</p>
              </div>
              <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${object.is_active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-100 text-slate-600'}`}>
                {object.is_active ? 'Активен' : 'Неактивен'}
              </span>
            </div>
            <div className="mt-4"><StageStepper stages={stagesByObjectId[object.id] || []} /></div>
            <div className="mt-4 border-t border-slate-100 pt-3">
              <div className="mb-1 flex justify-between text-xs"><span className="text-slate-500">Прогресс</span><span className="font-semibold text-slate-800">{object.progress}%</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#ff4539]" style={{ width: `${Math.max(0, Math.min(100, object.progress))}%` }} /></div>
            </div>
            <div className="mt-4 grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2">
              <div><div className="mb-1 text-xs text-slate-500">Ответственный</div><ResponsibleBadge user={responsibleByObjectId[object.id]} /></div>
              <div><div className="mb-1 text-xs text-slate-500">Срок</div><DeadlineCell object={object} /></div>
            </div>
            <Link to={`/objects/${object.id}`} className="mt-4 block rounded-xl bg-base-200 px-3 py-2 text-center text-sm font-medium text-slate-800">Открыть объект</Link>
          </article>
        ))}
      </div>

      <div className="hidden overflow-x-auto border border-base-200 bg-base-100 lg:block">
      <table className="w-full min-w-[960px] table-fixed text-left">
        <colgroup>
          <col className="w-[20%]" />
          <col className="w-[15%]" />
          <col className="w-[27%]" />
          <col className="w-[14%]" />
          <col className="w-[11%]" />
          <col className="w-[13%]" />
        </colgroup>
        <thead className="bg-base-200 text-sm text-black">
          <tr>
            <th className="px-3 py-3 font-semibold">Объект</th>
            <th className="px-3 py-3 font-semibold">Этап</th>
            <th className="px-3 py-3 font-semibold">Текущий шаг</th>
            <th className="px-3 py-3 font-semibold">Прогресс</th>
            <th className="px-3 py-3 font-semibold">Срок</th>
            <th className="px-3 py-3 font-semibold">Статус</th>
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
                <CurrentStepCell step={object.current_step.task?.title || 'Нет доступных задач'} />
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
              <td className="px-3 py-3">
                <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
                  object.is_active
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-slate-200 bg-slate-100 text-slate-600'
                }`}>
                  {object.is_active ? 'Активен' : 'Неактивен'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  )
}
