import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { DatePickerInput, formatDateInputValue, StyledSelect } from '@/components'
import { objectApi, workApi } from '@services/api'
import { formatApiError, formatDateRu } from '@/utils'
import type { ConstructionObject, MyTask } from '@/types'

const labels: Record<string, string> = {
  todo: 'К выполнению',
  in_progress: 'В работе',
  pending_review: 'На проверке',
  rejected: 'Возвращено',
  done: 'Готово',
}

const filterStatuses = ['todo', 'in_progress', 'pending_review']

export default function WorkItemsPage() {
  const [params, setParams] = useSearchParams()
  const [items, setItems] = useState<MyTask[]>([])
  const [objects, setObjects] = useState<ConstructionObject[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [objectSearch, setObjectSearch] = useState('')
  const [objectDropdownOpen, setObjectDropdownOpen] = useState(false)
  const [dateFromInput, setDateFromInput] = useState(() => formatDateInputValue(params.get('dateFrom') || ''))
  const [dateToInput, setDateToInput] = useState(() => formatDateInputValue(params.get('dateTo') || ''))
  const limit = 20
  const page = Math.max(1, Number(params.get('page')) || 1)
  const status = params.get('status') || ''
  const search = params.get('search') || ''
  const objectId = params.get('objectId') || ''
  const dateFrom = params.get('dateFrom') || ''
  const dateTo = params.get('dateTo') || ''

  useEffect(() => {
    objectApi.getAll().then(setObjects).catch(() => setObjects([]))
  }, [])

  useEffect(() => {
    const selectedObject = objects.find((objectItem) => String(objectItem.id) === objectId)
    setObjectSearch(selectedObject?.name || '')
  }, [objectId, objects])

  useEffect(() => {
    setLoading(true)
    setError('')
    workApi.getMy({
      limit,
      offset: (page - 1) * limit,
      status: status || undefined,
      search: search.trim() || undefined,
      object_id: objectId || undefined,
      deadline_from: dateFrom || undefined,
      deadline_to: dateTo || undefined,
    })
      .then((data) => { setItems(data.items); setTotal(data.total) })
      .catch((err) => setError(formatApiError(err, 'Не удалось загрузить задачи.')))
      .finally(() => setLoading(false))
  }, [dateFrom, dateTo, objectId, page, search, status])

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    value ? next.set(key, value) : next.delete(key)
    if (key !== 'page') next.delete('page')
    setParams(next)
  }

  const filteredObjects = useMemo(() => {
    const query = objectSearch.trim().toLowerCase()
    if (!query || objectId) return objects
    return objects.filter((objectItem) => objectItem.name.toLowerCase().includes(query))
  }, [objectId, objectSearch, objects])

  const hasActiveFilters = Boolean(search.trim() || objectId || objectSearch.trim() || dateFrom || dateTo || status)

  const clearFilters = () => {
    setParams(new URLSearchParams())
    setObjectSearch('')
    setObjectDropdownOpen(false)
    setDateFromInput('')
    setDateToInput('')
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-base-200 bg-base-100 p-3 shadow-sm sm:p-4">
        <div className="mb-4">
          <div className="text-sm text-base-content/60">Рабочий список</div>
          <h1 className="text-2xl font-semibold sm:text-3xl">Мои задачи</h1>
        </div>

        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-[minmax(190px,1.2fr)_minmax(160px,1fr)_minmax(260px,1.4fr)_minmax(150px,.8fr)_auto] lg:items-center">
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-base-content/50">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-3.35-3.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            </span>
            <input className="input h-10 min-h-0 w-full rounded-lg border-base-300 bg-white pl-9 text-sm focus:border-[#ff4539] focus:outline-none" value={search} onChange={(event) => update('search', event.target.value)} placeholder="Название задачи" aria-label="Поиск по названию задачи" />
          </div>

          <div className="relative">
            <input
              className="input h-10 min-h-0 w-full rounded-lg border-base-300 bg-white text-sm focus:border-[#ff4539] focus:outline-none"
              value={objectSearch}
              onChange={(event) => { setObjectSearch(event.target.value); update('objectId', ''); setObjectDropdownOpen(true) }}
              onFocus={() => setObjectDropdownOpen(true)}
              onBlur={() => window.setTimeout(() => setObjectDropdownOpen(false), 150)}
              placeholder="Объект"
              aria-label="Фильтр по объекту"
            />
            {objectDropdownOpen && (
              <div className="absolute left-0 right-0 z-20 mt-2 max-h-56 overflow-y-auto rounded-lg border border-base-200 bg-white shadow-lg">
                {filteredObjects.length === 0 ? <div className="px-4 py-3 text-sm text-base-content/60">Объекты не найдены</div> : filteredObjects.map((objectItem) => (
                  <button type="button" key={objectItem.id} className={`w-full border-b border-base-200 px-4 py-3 text-left text-sm transition last:border-b-0 ${objectId === String(objectItem.id) ? 'bg-primary/10' : 'hover:bg-base-200'}`} onMouseDown={(event) => event.preventDefault()} onClick={() => { setObjectSearch(objectItem.name); update('objectId', String(objectItem.id)); setObjectDropdownOpen(false) }}>
                    <span className="font-medium text-slate-900">{objectItem.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <DatePickerInput value={dateFrom} inputValue={dateFromInput} onChange={(value, inputValue) => { update('dateFrom', value); setDateFromInput(inputValue) }} max={dateTo || undefined} placeholder="Срок с" ariaLabel="Срок задачи с" />
            <DatePickerInput value={dateTo} inputValue={dateToInput} onChange={(value, inputValue) => { update('dateTo', value); setDateToInput(inputValue) }} min={dateFrom || undefined} placeholder="Срок по" ariaLabel="Срок задачи по" />
          </div>

          <StyledSelect
            value={status}
            onChange={(value) => update('status', value)}
            ariaLabel="Фильтр по статусу"
            options={[{ value: '', label: 'Все статусы' }, ...filterStatuses.map((value) => ({ value, label: labels[value] }))]}
          />

          <button type="button" className="h-10 w-full rounded-lg bg-[#ff4539] px-4 text-sm font-semibold text-white transition hover:bg-[#cc372e] disabled:cursor-not-allowed disabled:bg-[#ff918a] lg:w-auto" onClick={clearFilters} disabled={!hasActiveFilters}>Очистить фильтр</button>
        </div>

        {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <div className="mt-4">
          {loading ? <div className="flex justify-center p-16"><span className="loading loading-spinner" /></div> : items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-base-300 bg-base-50 p-8 text-center"><div className="text-lg font-medium">Задачи не найдены</div><div className="mt-1 text-sm text-base-content/60">Попробуйте изменить или очистить фильтры.</div></div>
          ) : (
            <div className="space-y-2">{items.map((task) => (
              <Link key={task.id} to={`/objects/${task.object_id}/tasks/${task.main_task_id}#task-${task.id}`} className="block rounded-xl border border-base-200 bg-base-100 px-4 py-3 transition hover:border-[#ff4539]/40 hover:shadow-sm">
                <div className="flex flex-wrap justify-between gap-3"><div className="min-w-0"><div className="text-sm text-base-content/60">{task.object_name} · {task.object_address}</div><div className="mt-1 text-base font-semibold sm:text-lg">{task.title}</div></div><span className={`badge ${task.flag === 'overdue' || task.flag === 'rejected' ? 'badge-error' : 'badge-ghost'}`}>{labels[task.status] || task.action_required}</span></div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-base-content/65"><span>{task.action_required === 'review' ? 'Требуется проверка' : 'Требуется выполнение'}</span>{task.deadline && <span>Срок: {formatDateRu(task.deadline)}</span>}{task.rejection_reason && <span className="text-red-700">Причина: {task.rejection_reason}</span>}</div>
              </Link>
            ))}</div>
          )}
        </div>

        {total > limit && <div className="join mt-4 flex justify-center"><button className="btn join-item" disabled={page === 1} onClick={() => update('page', String(page - 1))}>Назад</button><span className="btn join-item pointer-events-none">{page} / {Math.ceil(total / limit)}</span><button className="btn join-item" disabled={page * limit >= total} onClick={() => update('page', String(page + 1))}>Далее</button></div>}
      </div>
    </div>
  )
}
