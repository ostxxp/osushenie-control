import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { NOTIFICATIONS_UPDATED_EVENT, objectApi } from '@services/api'
import { calculateLogicalTaskStats, formatDateTimeRu, formatDateRu, formatTaskCountAccusative } from '@/utils'
import type {
  ConstructionObject,
  ObjectTask,
  ObjectTaskStatus,
  ObjectTaskTree,
  ObjectTaskUpsertPayload,
  TaskChildrenMode,
} from '@/types'

type FlatTaskOption = {
  task: ObjectTaskTree
  depth: number
}

type TaskStatusFilter = 'all' | 'done' | 'in_progress' | 'todo' | 'overdue'

type TaskFormState = {
  title: string
  parentId: string
  sortOrder: string
  childrenMode: TaskChildrenMode
  status: ObjectTaskStatus
  deadline: string
}

const emptyTaskForm = (): TaskFormState => ({
  title: '',
  parentId: '',
  sortOrder: '',
  childrenMode: 'all',
  status: 'todo',
  deadline: '',
})

const toDateInputValue = (value: string | null | undefined): string => {
  if (!value) {
    return ''
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return date.toISOString().slice(0, 10)
}

const toDeadlineIso = (value: string): string | null => {
  if (!value) {
    return null
  }

  return new Date(`${value}T23:59:59.999`).toISOString()
}

const flattenTaskTree = (tasks: ObjectTaskTree[], depth = 0): FlatTaskOption[] =>
  tasks.flatMap((task) => [
    { task, depth },
    ...flattenTaskTree(task.children, depth + 1),
  ])

function ModalBackdrop({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <button type="button" className="absolute inset-0 bg-black/50" onClick={onClose} aria-label="Закрыть окно" />
      <div className="relative z-10 max-h-[calc(100dvh-1.5rem)] w-full max-w-xl overflow-y-auto rounded-2xl border border-base-200 bg-base-100 shadow-2xl sm:rounded-3xl">
        {children}
      </div>
    </div>
  )
}

const isNegativeTaskTitle = (title: string): boolean => {
  const normalizedTitle = title.trim().toLowerCase()
  return /(^|[\s(«"—-])(нет|не|без|отсутствует|отсутствуют|отсутствовал|отсутствовала|отсутствовало)(?=$|[\s.,;:!?»")—-])/u.test(normalizedTitle)
}

function TaskStateIcon({ task }: { task: ObjectTaskTree }) {
  if (task.status === 'done') {
    if (isNegativeTaskTitle(task.title)) {
      return (
        <span
          className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white"
          aria-label="Отрицательный вариант выбран"
        >
          ×
        </span>
      )
    }

    return (
      <span
        className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-xs font-bold text-white"
        aria-label="Задача выполнена"
      >
        ✓
      </span>
    )
  }

  return <span className="inline-block h-5 w-5 rounded-full border-2 border-base-300 bg-white" />
}

function TaskTreeNode({
  task,
  onToggleTask,
  expandedTaskIds,
  onToggleExpand,
  onEditTask,
  onCreateChild,
  overdueTaskIds,
  depth = 0,
}: {
  task: ObjectTaskTree
  onToggleTask: (taskId: number) => Promise<void>
  expandedTaskIds: number[]
  onToggleExpand: (taskId: number) => void
  onEditTask: (task: ObjectTaskTree) => void
  onCreateChild: (task: ObjectTaskTree) => void
  overdueTaskIds: Set<number>
  depth?: number
}) {
  const hasChildren = task.children.length > 0
  const isMainTask = depth === 0
  const isExpanded = expandedTaskIds.includes(task.id)
  const isDone = task.status === 'done'
  const isNegative = isNegativeTaskTitle(task.title)
  const canToggle = task.status !== 'not_applicable' && task.status !== 'skipped'
  const isOverdue = overdueTaskIds.has(task.id)
  const shouldShowChildren = hasChildren && (!isMainTask || isExpanded)
  const taskClickClass = canToggle || isMainTask ? 'cursor-pointer hover:text-primary' : 'cursor-not-allowed text-base-content/60'

  const handleTaskClick = () => {
    if (isMainTask && hasChildren) {
      onToggleExpand(task.id)
      return
    }

    if (canToggle) {
      onToggleTask(task.id)
    }
  }

  return (
    <div className="task-tree-node">
      <article
        id={`task-${task.id}`}
        className={[
          'w-72 scroll-mt-6 rounded-2xl border bg-white p-4 shadow-sm transition-shadow hover:shadow-md target:ring-2 target:ring-rose-400 target:ring-offset-2',
          isOverdue || (isDone && isNegative)
            ? 'border-rose-400'
            : isDone
              ? 'border-emerald-300'
              : 'border-slate-200',
        ].join(' ')}
      >
        <div className="flex min-w-0 items-start gap-3">
          {isMainTask && hasChildren ? (
            <button
              type="button"
              onClick={() => onToggleExpand(task.id)}
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-base-200 text-base-content/70 transition hover:text-base-content"
              aria-label={isExpanded ? 'Свернуть задачу' : 'Развернуть задачу'}
            >
              {isExpanded ? '−' : '+'}
            </button>
          ) : (
            <button
              type="button"
              disabled={!canToggle}
              onClick={() => onToggleTask(task.id)}
              className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-opacity ${
                canToggle ? 'cursor-pointer hover:opacity-75' : 'cursor-not-allowed opacity-60'
              }`}
              aria-label={isDone ? 'Отменить выполнение задачи' : 'Выполнить задачу'}
            >
              <TaskStateIcon task={task} />
            </button>
          )}

          <button
            type="button"
            disabled={!canToggle && !isMainTask}
            onClick={handleTaskClick}
            className={`min-w-0 flex-1 break-words text-left font-semibold leading-5 transition-colors ${taskClickClass} ${isDone ? 'text-base-content' : ''}`}
          >
            {task.title}
          </button>
        </div>

        <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-3 text-xs text-base-content/65">
          {task.deadline && (
            <div>
              Дедлайн: <span className="font-medium text-base-content">{formatDateRu(task.deadline)}</span>
            </div>
          )}
          {isOverdue && <span className="badge badge-error badge-sm">Просрочено</span>}
          {isDone && (
            <div className="space-y-0.5">
              {task.completed_by?.full_name && (
                <div className="font-medium text-base-content">{task.completed_by.full_name}</div>
              )}
              {task.completed_at && <div>{formatDateTimeRu(task.completed_at)}</div>}
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-nowrap items-center justify-center gap-1 whitespace-nowrap border-t border-slate-100 pt-2">
          <button type="button" className="btn btn-ghost btn-xs" onClick={() => onEditTask(task)}>
            Редактировать
          </button>
          <button type="button" className="btn btn-ghost btn-xs" onClick={() => onCreateChild(task)}>
            + Подзадача
          </button>
        </div>
      </article>

      {shouldShowChildren && (
        <ul className="task-tree-children">
          {task.children.map((child) => (
            <li key={child.id}>
              <TaskTreeNode
                task={child}
                onToggleTask={onToggleTask}
                expandedTaskIds={expandedTaskIds}
                onToggleExpand={onToggleExpand}
                onEditTask={onEditTask}
                onCreateChild={onCreateChild}
                overdueTaskIds={overdueTaskIds}
                depth={depth + 1}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ObjectTasksPage() {
  const { id, taskId } = useParams<{ id: string; taskId?: string }>()
  const location = useLocation()
  const [objectItem, setObjectItem] = useState<ConstructionObject | null>(null)
  const [tasks, setTasks] = useState<ObjectTaskTree[]>([])
  const [taskHeaders, setTaskHeaders] = useState<ObjectTask[]>([])
  const [allTasks, setAllTasks] = useState<ObjectTaskTree[]>([])
  const [overdueTasks, setOverdueTasks] = useState<ObjectTask[]>([])
  const [overdueCount, setOverdueCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedTaskIds, setExpandedTaskIds] = useState<number[]>([])
  const [taskEditorOpen, setTaskEditorOpen] = useState(false)
  const [taskEditorTarget, setTaskEditorTarget] = useState<ObjectTaskTree | null>(null)
  const [taskEditorMode, setTaskEditorMode] = useState<'create' | 'edit'>('create')
  const [taskForm, setTaskForm] = useState<TaskFormState>(emptyTaskForm())
  const [savingTask, setSavingTask] = useState(false)
  const [taskStatusFilter, setTaskStatusFilter] = useState<TaskStatusFilter>('all')

  const flatTaskOptions = useMemo(() => flattenTaskTree(allTasks), [allTasks])
  const overdueTaskIds = useMemo(() => new Set(overdueTasks.map((task) => task.id)), [overdueTasks])

  const loadData = async (): Promise<ObjectTaskTree[]> => {
    if (!id) return []

    try {
      const objectId = Number(id)
      const selectedTaskId = taskId ? Number(taskId) : null
      const [objData, fullTreeData, overdueData, overdueCountValue] = await Promise.all([
        objectApi.getById(objectId),
        objectApi.getFullTasksTree(objectId),
        objectApi.getOverdueTasks(objectId).catch(() => []),
        objectApi.getOverdueCount(objectId).catch(() => 0),
      ])
      const headersData = selectedTaskId === null
        ? await objectApi.getTasksHeaders(objectId)
        : []
      const treeData = selectedTaskId === null
        ? []
        : [await objectApi.getAvailableTaskTree(objectId, selectedTaskId)]
      setObjectItem(objData)
      setTasks(treeData)
      setTaskHeaders(headersData)
      setAllTasks(fullTreeData)
      setOverdueTasks(overdueData)
      setOverdueCount(overdueCountValue)
      setError('')
      return treeData
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(message || 'Ошибка загрузки задач')
      console.error(err)
      return []
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setExpandedTaskIds([])
    setTaskStatusFilter('all')
    loadData().then((loadedTasks) => {
      setExpandedTaskIds(loadedTasks.map((task) => task.id))
    })
  }, [id, taskId])

  const toggleExpand = (taskId: number) => {
    setExpandedTaskIds((prev) =>
      prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId],
    )
  }

  const handleToggleTask = async (taskId: number): Promise<void> => {
    if (!id) return

    try {
      await objectApi.toggleTaskStatus(Number(id), taskId)
      await loadData()
      window.dispatchEvent(new Event(NOTIFICATIONS_UPDATED_EVENT))
    } catch (err: unknown) {
      console.error('Ошибка обновления статуса:', err)
    }
  }

  const openCreateTask = (parentTask?: ObjectTaskTree) => {
    setTaskEditorMode('create')
    setTaskEditorTarget(parentTask ?? null)
    setTaskForm({
      ...emptyTaskForm(),
      parentId: parentTask ? String(parentTask.id) : '',
    })
    setTaskEditorOpen(true)
  }

  const openEditTask = (task: ObjectTaskTree) => {
    setTaskEditorMode('edit')
    setTaskEditorTarget(task)
    setTaskForm({
      title: task.title,
      parentId: task.parent_id ? String(task.parent_id) : '',
      sortOrder: String(task.sort_order),
      childrenMode: task.children_mode,
      status: task.status,
      deadline: toDateInputValue(task.deadline),
    })
    setTaskEditorOpen(true)
  }

  const closeTaskEditor = () => {
    setTaskEditorOpen(false)
    setTaskEditorTarget(null)
    setTaskForm(emptyTaskForm())
  }

  const handleSaveTask = async () => {
    if (!id || !taskForm.title.trim()) {
      return
    }

    setSavingTask(true)
    try {
      const deadline = toDeadlineIso(taskForm.deadline)
      if (taskEditorMode === 'create') {
        const payload: ObjectTaskUpsertPayload = {
          parent_id: taskForm.parentId ? Number(taskForm.parentId) : null,
          title: taskForm.title.trim(),
          sort_order: taskForm.sortOrder === '' ? null : Number(taskForm.sortOrder),
          children_mode: taskForm.childrenMode,
          deadline,
        }
        await objectApi.createTask(Number(id), payload)
      } else if (taskEditorTarget) {
        const payload: ObjectTaskUpsertPayload = {
          title: taskForm.title.trim(),
          sort_order: taskForm.sortOrder === '' ? null : Number(taskForm.sortOrder),
          children_mode: taskForm.childrenMode,
          status: taskForm.status,
          deadline,
        }
        await objectApi.updateTask(Number(id), taskEditorTarget.id, payload)
      }

      closeTaskEditor()
      await loadData()
      window.dispatchEvent(new Event(NOTIFICATIONS_UPDATED_EVENT))
    } catch (err) {
      console.error('Ошибка сохранения задачи:', err)
    } finally {
      setSavingTask(false)
    }
  }

  const stats = useMemo(
    () => calculateLogicalTaskStats(taskId ? tasks : allTasks),
    [allTasks, taskId, tasks],
  )
  const sectionTaskIds = useMemo(
    () => new Set(flattenTaskTree(tasks).map(({ task }) => task.id)),
    [tasks],
  )
  const displayedOverdueTasks = taskId
    ? overdueTasks.filter((task) => sectionTaskIds.has(task.id))
    : overdueTasks
  const displayedOverdueCount = taskId ? displayedOverdueTasks.length : overdueCount
  const taskSectionIds = useMemo(() => {
    const sectionIds = new Map<number, number>()

    const registerTasks = (items: ObjectTaskTree[], sectionId?: number) => {
      items.forEach((item) => {
        const rootId = sectionId ?? item.id
        sectionIds.set(item.id, rootId)
        registerTasks(item.children, rootId)
      })
    }

    registerTasks(allTasks)
    return sectionIds
  }, [allTasks])

  const taskMatchesFilter = (task: ObjectTaskTree): boolean => {
    if (taskStatusFilter === 'all') return true
    if (taskStatusFilter === 'overdue') return overdueTaskIds.has(task.id)
    if (taskStatusFilter === 'todo') {
      return task.status !== 'done' && task.status !== 'in_progress'
    }
    return task.status === taskStatusFilter
  }

  const filterTaskTree = (task: ObjectTaskTree): ObjectTaskTree | null => {
    if (taskStatusFilter === 'all') return task

    const children = task.children
      .map(filterTaskTree)
      .filter((child): child is ObjectTaskTree => child !== null)

    if (!taskMatchesFilter(task) && children.length === 0) return null
    return { ...task, children }
  }

  const filteredTasks = useMemo(
    () => tasks.map(filterTaskTree).filter((task): task is ObjectTaskTree => task !== null),
    [overdueTaskIds, taskStatusFilter, tasks],
  )

  const filteredTaskHeaders = useMemo(() => {
    if (taskStatusFilter === 'all') return taskHeaders

    const visibleHeaderIds = new Set(
      allTasks
        .filter((task) => filterTaskTree(task) !== null)
        .map((task) => task.id),
    )
    return taskHeaders.filter((header) => visibleHeaderIds.has(header.id))
  }, [allTasks, overdueTaskIds, taskHeaders, taskStatusFilter])

  useEffect(() => {
    if (!location.hash || tasks.length === 0) return

    const elementId = decodeURIComponent(location.hash.slice(1))
    const frameId = window.requestAnimationFrame(() => {
      document.getElementById(elementId)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'center',
      })
    })

    return () => window.cancelAnimationFrame(frameId)
  }, [expandedTaskIds, location.hash, tasks])

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <span className="loading loading-spinner text-primary" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="alert alert-error shadow-lg w-full max-w-md">
          <span>{error}</span>
        </div>
      </div>
    )
  }

  if (!objectItem) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-base-content/70">Объект не найден.</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-3xl border border-base-200 bg-base-100 p-4 shadow-sm sm:p-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <Link
            to={taskId ? `/objects/${objectItem.id}/tasks` : `/objects/${objectItem.id}`}
            className="inline-flex w-fit items-center gap-1.5 rounded-xl bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 hover:text-slate-950"
          >
            <span aria-hidden="true">←</span>
            {taskId ? 'К разделам задач' : 'К объекту'}
          </Link>
          <div>
            <h1 className="mt-1 break-words text-2xl font-semibold sm:text-3xl">{objectItem.name}</h1>
            {taskId && tasks[0] && (
              <p className="mt-1 text-base text-base-content/65">{tasks[0].title}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          <button
            type="button"
            className={`rounded-2xl border bg-base-100 px-3 py-2 text-center shadow-sm transition hover:border-[#ff4539]/40 ${
              taskStatusFilter === 'all' ? 'border-[#ff4539] ring-2 ring-[#ff4539]/15' : 'border-base-200'
            }`}
            onClick={() => setTaskStatusFilter('all')}
            aria-pressed={taskStatusFilter === 'all'}
          >
            <div className="text-xs uppercase tracking-wide text-base-content/60">Всего</div>
            <div className="font-semibold text-lg">{stats.total}</div>
          </button>

          <button
            type="button"
            className={`rounded-2xl border bg-base-100 px-3 py-2 text-center shadow-sm transition hover:border-emerald-400 ${
              taskStatusFilter === 'done' ? 'border-emerald-500 ring-2 ring-emerald-500/15' : 'border-base-200'
            }`}
            onClick={() => setTaskStatusFilter('done')}
            aria-pressed={taskStatusFilter === 'done'}
          >
            <div className="text-xs uppercase tracking-wide text-base-content/60">Готово</div>
            <div className="font-semibold text-lg">{stats.done}</div>
          </button>

          <button
            type="button"
            className={`rounded-2xl border bg-base-100 px-3 py-2 text-center shadow-sm transition hover:border-blue-400 ${
              taskStatusFilter === 'in_progress' ? 'border-blue-500 ring-2 ring-blue-500/15' : 'border-base-200'
            }`}
            onClick={() => setTaskStatusFilter('in_progress')}
            aria-pressed={taskStatusFilter === 'in_progress'}
          >
            <div className="text-xs uppercase tracking-wide text-base-content/60">В работе</div>
            <div className="font-semibold text-lg">{stats.inProgress}</div>
          </button>

          <button
            type="button"
            className={`rounded-2xl border bg-base-100 px-3 py-2 text-center shadow-sm transition hover:border-amber-400 ${
              taskStatusFilter === 'todo' ? 'border-amber-500 ring-2 ring-amber-500/15' : 'border-base-200'
            }`}
            onClick={() => setTaskStatusFilter('todo')}
            aria-pressed={taskStatusFilter === 'todo'}
          >
            <div className="text-xs uppercase tracking-wide text-base-content/60">К выполнению</div>
            <div className="font-semibold text-lg">{stats.todo}</div>
          </button>

          <button
            type="button"
            className={`rounded-2xl border bg-rose-50 px-3 py-2 text-center shadow-sm transition hover:border-rose-500 ${
              taskStatusFilter === 'overdue' ? 'border-rose-500 ring-2 ring-rose-500/15' : 'border-rose-200'
            }`}
            onClick={() => setTaskStatusFilter('overdue')}
            aria-pressed={taskStatusFilter === 'overdue'}
          >
            <div className="text-xs uppercase tracking-wide text-rose-700">Просрочено</div>
            <div className="font-semibold text-lg text-rose-700">{displayedOverdueCount}</div>
          </button>
        </div>
      </div>

      {displayedOverdueCount > 0 && (
        <div className="rounded-3xl border border-rose-200 bg-rose-50 p-5 text-rose-950 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm uppercase tracking-wide text-rose-700">Просроченные задачи</div>
              <div className="text-lg font-semibold">Нужно закрыть {formatTaskCountAccusative(displayedOverdueCount)}</div>
            </div>
            <div className="badge badge-error badge-lg">{displayedOverdueCount}</div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {displayedOverdueTasks.slice(0, 8).map((task) => {
              const sectionId = taskSectionIds.get(task.id)
              const destination = sectionId
                ? `/objects/${objectItem.id}/tasks/${sectionId}#task-${task.id}`
                : `/objects/${objectItem.id}/tasks`

              return (
                <Link
                  key={task.id}
                  to={destination}
                  className="rounded-full bg-white px-3 py-1.5 text-sm font-medium text-rose-900 shadow-sm transition hover:bg-rose-100"
                  onClick={() => {
                    if (sectionId && String(sectionId) === taskId) {
                      setExpandedTaskIds((current) =>
                        current.includes(sectionId) ? current : [...current, sectionId],
                      )
                      window.requestAnimationFrame(() => {
                        document.getElementById(`task-${task.id}`)?.scrollIntoView({
                          behavior: 'smooth',
                          block: 'center',
                          inline: 'center',
                        })
                      })
                    }
                  }}
                >
                  {task.title}
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {!taskId ? (
        filteredTaskHeaders.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-base-300 bg-base-100 p-10 text-center text-base-content/60">
            {taskStatusFilter === 'all'
              ? 'Разделы задач пока не добавлены.'
              : 'Разделы с выбранным статусом не найдены.'}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredTaskHeaders.map((header) => (
              <Link
                key={header.id}
                to={`/objects/${objectItem.id}/tasks/${header.id}`}
                className="group flex min-h-36 flex-col justify-between rounded-3xl border border-base-200 bg-base-100 p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#ff4539]/30 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-4">
                  <h2 className="text-lg font-semibold leading-6 text-base-content">
                    {header.title}
                  </h2>
                  <span className="text-xl text-base-content/35 transition group-hover:translate-x-1 group-hover:text-[#ff4539]">
                    →
                  </span>
                </div>
                <div className="mt-5 flex items-center justify-between gap-3 text-sm text-base-content/60">
                  <span>
                    {header.deadline ? `Дедлайн: ${formatDateRu(header.deadline)}` : 'Без дедлайна'}
                  </span>
                  <span className={[
                    'rounded-full px-2.5 py-1 text-xs font-medium',
                    header.status === 'done'
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-slate-100 text-slate-600',
                  ].join(' ')}>
                    {header.status === 'done' ? 'Завершён' : 'Открыть'}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )
      ) : filteredTasks.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-base-300 bg-base-100 p-10 text-center text-base-content/60">
          Задачи с выбранным статусом не найдены.
        </div>
      ) : (
        <div className="space-y-4">
          {filteredTasks.map((task) => (
            <section
              key={task.id}
              className="overflow-hidden rounded-2xl border border-base-200 bg-base-100 shadow-sm"
            >
              <div className="overflow-x-auto p-3 sm:p-6">
                <div className="flex min-w-0 justify-center pb-2 sm:min-w-max sm:px-4">
                  <TaskTreeNode
                    task={task}
                    onToggleTask={handleToggleTask}
                    expandedTaskIds={expandedTaskIds}
                    onToggleExpand={toggleExpand}
                    onEditTask={openEditTask}
                    onCreateChild={(parentTask) => openCreateTask(parentTask)}
                    overdueTaskIds={overdueTaskIds}
                  />
                </div>
              </div>
            </section>
          ))}
        </div>
      )}

      {taskEditorOpen && (
        <ModalBackdrop onClose={closeTaskEditor}>
          <div className="overflow-hidden rounded-2xl sm:rounded-3xl">
            <div className="border-b border-base-200 bg-base-200/40 px-4 py-4 sm:px-6 sm:py-5">
              <div>
                <h2 className="text-xl font-semibold leading-tight sm:text-2xl">
                  {taskEditorMode === 'create' ? 'Добавить задачу' : 'Изменить задачу'}
                </h2>
                {taskEditorMode === 'create' && taskEditorTarget && (
                  <p className="mt-1 text-sm text-base-content/60">
                    Подзадача для: <span className="font-medium text-base-content">{taskEditorTarget.title}</span>
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-5 p-4 sm:p-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="space-y-3 md:col-span-2">
                  <span className="text-sm font-medium">Название задачи</span>
                  <input
                    className="input w-full"
                    value={taskForm.title}
                    onChange={(event) => setTaskForm((prev) => ({ ...prev, title: event.target.value }))}
                    placeholder="Введите название задачи"
                  />
                </label>

                {taskEditorMode === 'create' && !taskEditorTarget ? (
                  <label className="space-y-3">
                    <span className="text-sm font-medium">Родительская задача</span>
                    <select
                      className="select w-full"
                      value={taskForm.parentId}
                      onChange={(event) => setTaskForm((prev) => ({ ...prev, parentId: event.target.value }))}
                    >
                      <option value="">Корневая задача</option>
                      {flatTaskOptions.map(({ task, depth }) => (
                        <option key={task.id} value={task.id}>
                          {`${'— '.repeat(depth)}${task.title}`}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                <label className={`space-y-3 ${taskEditorMode === 'create' && !taskEditorTarget ? '' : 'md:col-span-2 md:max-w-64'}`}>
                  <span className="text-sm font-medium">Дедлайн</span>
                  <input
                    className="input w-full"
                    value={taskForm.deadline}
                    onChange={(event) => setTaskForm((prev) => ({ ...prev, deadline: event.target.value }))}
                    type="date"
                  />
                </label>
              </div>

              <div className="flex flex-col gap-2 border-t border-base-200 pt-5 sm:flex-row sm:justify-end">
                <button type="button" className="btn btn-ghost" onClick={closeTaskEditor}>
                  Отмена
                </button>
                <button
                  type="button"
                  className="rounded-2xl bg-[#ff4539] px-4 py-2 font-medium text-white transition-colors hover:bg-[#cc372e] focus:outline-none focus:ring-2 focus:ring-[#ff4539] focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-[#ff918a]"
                  onClick={handleSaveTask}
                  disabled={savingTask}
                >
                  {savingTask ? 'Сохранение...' : taskEditorMode === 'create' ? 'Добавить задачу' : 'Сохранить изменения'}
                </button>
              </div>
            </div>
          </div>
        </ModalBackdrop>
      )}
    </div>
  )
}

export default ObjectTasksPage
