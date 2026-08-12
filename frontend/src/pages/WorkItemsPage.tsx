import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { workApi } from '@services/api'
import { formatApiError, formatDateRu } from '@/utils'
import type { MyTask } from '@/types'

const labels: Record<string, string> = { todo: 'К выполнению', in_progress: 'В работе', submitted: 'На проверке', rejected: 'Возвращено', done: 'Готово' }

export default function WorkItemsPage({ today = false }: { today?: boolean }) {
  const [params, setParams] = useSearchParams()
  const [items, setItems] = useState<MyTask[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const limit = 20
  const page = Math.max(1, Number(params.get('page')) || 1)
  const status = params.get('status') || ''

  useEffect(() => {
    setLoading(true); setError('')
    const request = today ? workApi.getToday : workApi.getMy
    request({ limit, offset: (page - 1) * limit, status: status || undefined })
      .then((data) => { setItems(data.items); setTotal(data.total) })
      .catch((err) => setError(formatApiError(err, 'Не удалось загрузить задачи.')))
      .finally(() => setLoading(false))
  }, [page, status, today])

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params); value ? next.set(key, value) : next.delete(key); if (key !== 'page') next.delete('page'); setParams(next)
  }

  return <div className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-4 rounded-3xl bg-white p-5 shadow-sm">
      <div><div className="text-sm text-slate-500">Рабочий список</div><h1 className="text-3xl font-semibold">{today ? 'На сегодня' : 'Мои задачи'}</h1></div>
      {!today && <select className="select select-bordered" value={status} onChange={(e) => update('status', e.target.value)}>
        <option value="">Все статусы</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>}
    </div>
    {error && <div className="alert alert-error">{error}</div>}
    {loading ? <div className="flex justify-center p-16"><span className="loading loading-spinner" /></div> : items.length === 0 ?
      <div className="rounded-3xl border border-dashed bg-white p-12 text-center text-slate-500">Задач не найдено.</div> :
      <div className="space-y-3">{items.map((task) => <Link key={task.id} to={`/objects/${task.object_id}/tasks/${task.main_task_id}#task-${task.id}`} className="block rounded-2xl border bg-white p-5 shadow-sm transition hover:border-[#ff4539]/40">
        <div className="flex flex-wrap justify-between gap-3"><div><div className="text-sm text-slate-500">{task.object_name} · {task.object_address}</div><div className="mt-1 text-lg font-semibold">{task.title}</div></div><span className={`badge ${task.flag === 'overdue' || task.flag === 'rejected' ? 'badge-error' : 'badge-ghost'}`}>{labels[task.status] || task.action_required}</span></div>
        <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-600"><span>{task.action_required}</span>{task.deadline && <span>Срок: {formatDateRu(task.deadline)}</span>}{task.rejection_reason && <span className="text-red-700">Причина: {task.rejection_reason}</span>}</div>
      </Link>)}</div>}
    {total > limit && <div className="join flex justify-center"><button className="btn join-item" disabled={page === 1} onClick={() => update('page', String(page - 1))}>Назад</button><span className="btn join-item pointer-events-none">{page} / {Math.ceil(total / limit)}</span><button className="btn join-item" disabled={page * limit >= total} onClick={() => update('page', String(page + 1))}>Далее</button></div>}
  </div>
}
