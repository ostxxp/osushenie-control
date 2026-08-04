import { Link } from 'react-router-dom'
import type { ObjectSummary, ObjectTask, User } from '@/types'
import { getCurrentStage } from './StageStepper'
import ResponsibleBadge from './ResponsibleBadge'

type ObjectKanbanProps = {
  objects: ObjectSummary[]
  responsibleByObjectId: Record<number, User | undefined>
  stagesByObjectId: Record<number, ObjectTask[]>
}

export default function ObjectKanban({ objects, responsibleByObjectId, stagesByObjectId }: ObjectKanbanProps) {
  const objectsByStage = Array.from({ length: 6 }, (_, index) => objects.filter(
    (object) => getCurrentStage(stagesByObjectId[object.id] || []) === index + 1,
  ))

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
      {objectsByStage.map((stageObjects, index) => (
        <section key={index} className="min-w-0 rounded-2xl border border-slate-200 bg-slate-100 p-3">
          <header className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-800">Этап {index + 1}</h2>
            <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-500">{stageObjects.length}</span>
          </header>
          <div className="space-y-3">
            {stageObjects.map((object) => (
              <article key={object.id} className="rounded-xl border border-slate-200 bg-white p-3">
                <Link to={`/objects/${object.id}`} className="block truncate font-semibold text-slate-900 hover:text-primary hover:underline">{object.name}</Link>
                <p className="mt-1 truncate text-xs text-slate-500">{object.address}</p>
                <div className="mt-3 flex items-center justify-between text-xs"><span className="text-slate-500">Прогресс</span><span className="font-semibold">{object.progress}%</span></div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#ff4539]" style={{ width: `${Math.max(0, Math.min(100, object.progress))}%` }} /></div>
                <div className="mt-3 border-t border-slate-100 pt-3"><ResponsibleBadge user={responsibleByObjectId[object.id]} /></div>
                {object.stats.overdue > 0 && <p className="mt-2 text-xs font-medium text-red-600">Просрочено задач: {object.stats.overdue}</p>}
              </article>
            ))}
            {stageObjects.length === 0 && <p className="py-4 text-center text-xs text-slate-400">Нет объектов</p>}
          </div>
        </section>
      ))}
    </div>
  )
}
