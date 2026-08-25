import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { DatePickerInput, formatDateInputValue, SearchableSelect, StyledSelect } from '@/components'
import { objectApi } from '@services/api'
import { formatApiError, formatDateRu } from '@/utils'
import type { ConstructionObject, MyTask, ObjectTaskTree } from '@/types'

const labels: Record<string, string> = {
  todo: 'К выполнению',
  in_progress: 'В работе',
  done: 'Сделано',
  overdue: 'Просрочено',
}

const filterStatuses = ['todo', 'in_progress', 'done', 'overdue']

const buildObjectWorkItems = (objectItem: ConstructionObject, roots: ObjectTaskTree[]): MyTask[] => {
  const items: MyTask[] = []

  const appendTask = (task: ObjectTaskTree, mainTaskId: number, mainTaskTitle: string, parentPath: string[]) => {
    if (task.status === 'skipped' || task.status === 'not_applicable' || !task.is_active) return

    const deadlineTime = task.deadline ? new Date(task.deadline).getTime() : null
    const daysRemaining = deadlineTime === null
      ? null
      : Math.ceil((deadlineTime - Date.now()) / 86_400_000)
    const flag: MyTask['flag'] = deadlineTime !== null && deadlineTime < Date.now() && task.status !== 'done'
        ? 'overdue'
        : daysRemaining !== null && daysRemaining <= 3
          ? 'due_soon'
          : 'normal'

    items.push({
      ...task,
      main_task_id: mainTaskId,
      main_task_title: mainTaskTitle,
      origin_path: parentPath,
      object_name: objectItem.name,
      object_address: objectItem.address,
      flag,
      days_remaining: daysRemaining,
    })

    if (task.status !== 'done') return

    const activeChildren = task.children.filter((child) => (
      child.is_active && child.status !== 'skipped' && child.status !== 'not_applicable'
    ))
    if (task.children_mode === 'all') {
      activeChildren.forEach((child) => appendTask(child, mainTaskId, mainTaskTitle, [...parentPath, task.title]))
      return
    }

    const selectedChild = activeChildren.find((child) => child.id === task.selected_child_id)
      || activeChildren.find((child) => child.status === 'done')
    ;(selectedChild ? [selectedChild] : activeChildren).forEach((child) => appendTask(child, mainTaskId, mainTaskTitle, [...parentPath, task.title]))
  }

  roots.forEach((root) => {
    const activeChildren = root.children.filter((child) => (
      child.is_active && child.status !== 'skipped' && child.status !== 'not_applicable'
    ))
    if (root.children_mode === 'all') {
      activeChildren.forEach((child) => appendTask(child, root.id, root.title, [root.title]))
      return
    }

    const selectedChild = activeChildren.find((child) => child.id === root.selected_child_id)
      || activeChildren.find((child) => child.status === 'done')
    ;(selectedChild ? [selectedChild] : activeChildren).forEach((child) => appendTask(child, root.id, root.title, [root.title]))
  })

  return items
}

export default function WorkItemsPage() {
  const [params, setParams] = useSearchParams()
  const [allItems, setAllItems] = useState<MyTask[]>([])
  const [objects, setObjects] = useState<ConstructionObject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [objectSearch, setObjectSearch] = useState('')
  const [dateFromInput, setDateFromInput] = useState(() => formatDateInputValue(params.get('dateFrom') || ''))
  const [dateToInput, setDateToInput] = useState(() => formatDateInputValue(params.get('dateTo') || ''))
  const limit = 20
  const page = Math.max(1, Number(params.get('page')) || 1)
  const status = params.get('status') || ''
  const search = params.get('search') || ''
  const objectId = params.get('objectId') || ''
  const sectionId = params.get('sectionId') || ''
  const dateFrom = params.get('dateFrom') || ''
  const dateTo = params.get('dateTo') || ''

  useEffect(() => {
    setLoading(true)
    setError('')
    objectApi.getAll()
      .then(async (availableObjects) => {
        setObjects(availableObjects)
        const objectItems = await Promise.all(availableObjects.map(async (objectItem) => (
          buildObjectWorkItems(objectItem, await objectApi.getFullTasksTree(objectItem.id))
        )))
        setAllItems(objectItems.flat())
      })
      .catch((err) => {
        setObjects([])
        setAllItems([])
        setError(formatApiError(err, 'Не удалось загрузить задачи.'))
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const selectedObject = objects.find((objectItem) => String(objectItem.id) === objectId)
    setObjectSearch(selectedObject?.name || '')
  }, [objectId, objects])

  const filteredItems = useMemo(() => allItems.filter((task) => {
    if (status === 'overdue' ? task.flag !== 'overdue' : status && task.status !== status) return false
    if (objectId && String(task.object_id) !== objectId) return false
    if (sectionId && String(task.main_task_id) !== sectionId) return false
    if (search.trim() && !task.title.toLowerCase().includes(search.trim().toLowerCase())) return false
    if (dateFrom && (!task.deadline || task.deadline.slice(0, 10) < dateFrom)) return false
    if (dateTo && (!task.deadline || task.deadline.slice(0, 10) > dateTo)) return false
    return true
  }).sort((first, second) => {
    if (!first.deadline) return 1
    if (!second.deadline) return -1
    return new Date(first.deadline).getTime() - new Date(second.deadline).getTime()
  }), [allItems, dateFrom, dateTo, objectId, search, sectionId, status])
  const total = filteredItems.length
  const items = filteredItems.slice((page - 1) * limit, page * limit)

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    value ? next.set(key, value) : next.delete(key)
    if (key === 'objectId') next.delete('sectionId')
    if (key !== 'page') next.delete('page')
    setParams(next)
  }

  const filteredObjects = useMemo(() => {
    const query = objectSearch.trim().toLowerCase()
    if (!query || objectId) return objects
    return objects.filter((objectItem) => objectItem.name.toLowerCase().includes(query))
  }, [objectId, objectSearch, objects])

  const sectionOptions = useMemo(() => {
    const sections = new Map<number, string>()
    allItems
      .filter((task) => !objectId || String(task.object_id) === objectId)
      .forEach((task) => sections.set(task.main_task_id, task.main_task_title))
    return Array.from(sections, ([value, label]) => ({ value: String(value), label }))
  }, [allItems, objectId])

  const hasActiveFilters = Boolean(search.trim() || objectId || objectSearch.trim() || sectionId || dateFrom || dateTo || status)

  const clearFilters = () => {
    setParams(new URLSearchParams())
    setObjectSearch('')
    setDateFromInput('')
    setDateToInput('')
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-base-200 bg-base-100 p-3 shadow-sm sm:p-4">
        <div className="mb-4 px-4">
          <h1 className="text-2xl font-semibold sm:text-3xl">Мои задачи</h1>
        </div>

        <div className="grid gap-2 px-4 md:grid-cols-2 xl:grid-cols-[minmax(180px,1.1fr)_minmax(150px,.9fr)_minmax(170px,1fr)_minmax(250px,1.35fr)_minmax(145px,.8fr)_auto] xl:items-center">
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-base-content/50">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-3.35-3.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            </span>
            <input className="h-10 w-full rounded-lg border border-base-300 bg-white pl-9 pr-3 text-left text-sm text-slate-900 outline-none transition placeholder:text-left placeholder:text-base-content/50 hover:border-slate-400 focus:border-[#ff4539] focus:ring-2 focus:ring-[#ff4539]/15" value={search} onChange={(event) => update('search', event.target.value)} placeholder="Название задачи" aria-label="Поиск по названию задачи" />
          </div>

          <SearchableSelect
            searchValue={objectSearch}
            onSearchChange={(value) => { setObjectSearch(value); update('objectId', '') }}
            onSelect={(value) => {
              setObjectSearch(objects.find((objectItem) => String(objectItem.id) === value)?.name || '')
              update('objectId', value)
            }}
            selectedValues={objectId ? [objectId] : []}
            options={filteredObjects.map((objectItem) => ({ value: String(objectItem.id), label: objectItem.name }))}
            placeholder="Объект"
            ariaLabel="Фильтр по объекту"
            emptyMessage="Объекты не найдены"
          />

          <StyledSelect
            value={sectionId}
            onChange={(value) => update('sectionId', value)}
            ariaLabel="Фильтр по разделу задач"
            options={[{ value: '', label: 'Все разделы' }, ...sectionOptions]}
          />

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
          {loading ? <div className="flex justify-center p-16"><span className="loading loading-spinner text-[#ff4539]" /></div> : items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-base-300 bg-base-50 p-8 text-center"><div className="text-lg font-medium">Задачи не найдены</div><div className="mt-1 text-sm text-base-content/60">Попробуйте изменить или очистить фильтры.</div></div>
          ) : (
            <div className="space-y-2">{items.map((task) => (
              <Link key={task.id} to={`/objects/${task.object_id}/tasks/${task.main_task_id}#task-${task.id}`} className="block rounded-xl border border-base-200 bg-base-100 px-4 py-3 transition hover:border-[#ff4539]/40 hover:shadow-sm">
                <div className="flex items-start justify-between gap-3"><div className="min-w-0 flex-1"><div className="text-sm text-base-content/60">{task.object_name} · {task.object_address}</div><div className="mt-1 break-words text-base font-semibold sm:text-lg">{task.title}</div></div>{task.status !== 'done' && labels[task.status] && <span className={`badge shrink-0 whitespace-nowrap border-transparent ${task.flag === 'overdue' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>{task.flag === 'overdue' ? labels.overdue : labels[task.status]}</span>}</div>
                <div className="mt-2 text-xs text-base-content/55">Раздел: <span className="font-medium text-base-content/70">{task.origin_path.join(' → ')}</span></div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-base-content/65"><span>{task.status === 'done' ? 'Задача выполнена' : 'Требуется выполнение'}</span>{task.deadline && <span>Срок: {formatDateRu(task.deadline)}</span>}</div>
              </Link>
            ))}</div>
          )}
        </div>

        {total > limit && <div className="join mt-4 flex justify-center"><button className="btn join-item" disabled={page === 1} onClick={() => update('page', String(page - 1))}>Назад</button><span className="btn join-item pointer-events-none">{page} / {Math.ceil(total / limit)}</span><button className="btn join-item" disabled={page * limit >= total} onClick={() => update('page', String(page + 1))}>Далее</button></div>}
      </div>
    </div>
  )
}
