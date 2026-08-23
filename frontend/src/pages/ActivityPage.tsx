import { useEffect, useRef, useState } from 'react'
import { StyledSelect } from '@/components'
import { activityApi, objectApi } from '@services/api'
import { formatDateTimeRu } from '@/utils'
import type { ConstructionObject, TaskActivity } from '@/types'

const actionNames: Record<string, string> = { assigned: 'Назначение', started: 'Начало работы', branch_selected: 'Выбор ветки', branch_cleared: 'Сброс ветки', attachment_uploaded: 'Загрузка файла', attachment_deleted: 'Удаление файла' }
const getActionName = (action: string) => actionNames[action] || 'Изменение задачи'

export default function ActivityPage() {
  const [items, setItems] = useState<TaskActivity[]>([]); const [objects, setObjects] = useState<ConstructionObject[]>([])
  const [objectId, setObjectId] = useState(''); const [action, setAction] = useState(''); const [total, setTotal] = useState(0); const [loading, setLoading] = useState(false)
  const sentinel = useRef<HTMLDivElement>(null); const limit = 30
  const load = async (reset = false) => { if (loading) return; setLoading(true); const offset = reset ? 0 : items.length; try { const data = await activityApi.getAll({ object_id: objectId || undefined, action: action || undefined, limit, offset }); setItems((old) => reset ? data.items : [...old, ...data.items]); setTotal(data.total) } finally { setLoading(false) } }
  useEffect(() => { objectApi.getAll().then(setObjects); void load(true) }, [])
  useEffect(() => { void load(true) }, [objectId, action])
  useEffect(() => { const node = sentinel.current; if (!node) return; const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting && items.length < total) void load() }); observer.observe(node); return () => observer.disconnect() }, [items.length, total, loading])
  return <div className="space-y-5"><div className="rounded-3xl bg-white p-5 shadow-sm"><h1 className="text-3xl font-semibold">История действий</h1><div className="mt-4 flex flex-wrap gap-3"><StyledSelect className="min-w-52" value={objectId} onChange={setObjectId} options={[{ value: '', label: 'Все объекты' }, ...objects.map((objectItem) => ({ value: String(objectItem.id), label: objectItem.name }))]} /><StyledSelect className="min-w-52" value={action} onChange={setAction} options={[{ value: '', label: 'Все действия' }, ...Object.entries(actionNames).map(([value, label]) => ({ value, label }))]} /></div></div>
    <div className="space-y-2">{items.map((item) => <article key={item.id} className="rounded-2xl border bg-white p-4"><div className="flex flex-wrap justify-between gap-2"><strong>{item.task_title}</strong><time className="text-sm text-slate-500">{formatDateTimeRu(item.created_at)}</time></div><div className="mt-1 text-sm text-slate-600">{item.actor_full_name || 'Система'} · {getActionName(item.action)} · {item.object_name}</div></article>)}</div>
    <div ref={sentinel} className="flex justify-center p-4">{loading && <span className="loading loading-spinner" />}{!loading && items.length >= total && total > 0 && <span className="text-sm text-slate-400">Показана вся история</span>}</div>
  </div>
}
