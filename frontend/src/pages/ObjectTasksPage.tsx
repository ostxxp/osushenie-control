import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { getStoredAvatarUrl, NOTIFICATIONS_UPDATED_EVENT, objectApi, photoApi } from '@services/api'
import { DatePickerInput, formatDateInputValue, StyledSelect } from '@/components'
import { formatDateTimeRu, formatDateRu } from '@/utils'
import type {
  ConstructionObject,
  ObjectTask,
  ObjectTaskListGroup,
  ObjectTaskStatus,
  ObjectTaskStats,
  ObjectTaskTree,
  ObjectTaskUpsertPayload,
  TaskChildrenMode,
  TaskAttachment,
  ProjectStageSummary,
} from '@/types'

type FlatTaskOption = {
  task: ObjectTaskTree
  depth: number
}

type TaskStatusFilter = 'all' | 'done' | 'in_progress' | 'todo' | 'overdue'

const taskStatusFilters: TaskStatusFilter[] = ['all', 'done', 'in_progress', 'todo', 'overdue']

const parseTaskStatusFilter = (value: string | null): TaskStatusFilter =>
  taskStatusFilters.includes(value as TaskStatusFilter) ? value as TaskStatusFilter : 'all'

type TaskFormState = {
  title: string
  parentId: string
  sortOrder: string
  childrenMode: TaskChildrenMode
  status: ObjectTaskStatus
  deadline: string
  deadlineInput: string
}

const emptyTaskForm = (): TaskFormState => ({
  title: '',
  parentId: '',
  sortOrder: '',
  childrenMode: 'all',
  status: 'todo',
  deadline: '',
  deadlineInput: '',
})

const taskEditorFieldClass = 'w-full focus:border-[#ff4539] focus:outline-none'

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

const findTaskPath = (tasks: ObjectTaskTree[], taskId: number): number[] | null => {
  for (const task of tasks) {
    if (task.id === taskId) return [task.id]
    const childPath = findTaskPath(task.children, taskId)
    if (childPath) return [task.id, ...childPath]
  }
  return null
}

const findTaskParent = (tasks: ObjectTaskTree[], taskId: number): ObjectTaskTree | null => {
  for (const task of tasks) {
    if (task.children.some((child) => child.id === taskId)) return task
    const parent = findTaskParent(task.children, taskId)
    if (parent) return parent
  }
  return null
}

const findSavedSelectionPath = (task: ObjectTaskTree): number[] => {
  if (task.selected_child_id) {
    const selectedChild = task.children.find((child) => child.id === task.selected_child_id)
    if (selectedChild?.status === 'done') {
      return [selectedChild.id, ...findSavedSelectionPath(selectedChild)]
    }
  }

  for (const child of task.children) {
    if (child.status !== 'done') continue
    const descendantPath = findSavedSelectionPath(child)
    if (descendantPath.length > 0) return [child.id, ...descendantPath]
  }

  return []
}

const hasAlternativeChildren = (task: ObjectTaskTree): boolean =>
  task.children_mode === 'single_choice'
  && task.children.length > 1

const buildProgressiveTaskList = (
  root: ObjectTaskTree | undefined,
  focusedPath: number[] = [],
): FlatTaskOption[] => {
  if (!root) return []

  const visible: FlatTaskOption[] = [{ task: root, depth: 0 }]
  const appendChildren = (parent: ObjectTaskTree, depth: number) => {
    const activeChildren = parent.children.filter((task) => task.status !== 'not_applicable' && task.status !== 'skipped')
    if (!hasAlternativeChildren(parent)) {
      activeChildren.forEach((child) => {
        visible.push({ task: child, depth })
        if (child.status === 'done' || focusedPath[depth - 1] === child.id) {
          appendChildren(child, depth + 1)
        }
      })
      return
    }

    const focusedChild = parent.children.find((task) => task.id === focusedPath[depth - 1])
    const selectedChild = focusedChild
      || activeChildren.find((task) => task.id === parent.selected_child_id)
      || activeChildren.find((task) => task.status === 'done')
    if (!selectedChild) {
      visible.push(...activeChildren.map((task) => ({ task, depth })))
      return
    }
    // Keep every active alternative visible. Only the focused/selected branch
    // is expanded, so a newly added root child neither hides its siblings nor
    // disappears when the saved branch selection is restored after a reload.
    visible.push(...activeChildren.map((task) => ({ task, depth })))
    if (selectedChild.status === 'done' || focusedPath[depth - 1] === selectedChild.id) {
      appendChildren(selectedChild, depth + 1)
    }
  }
  appendChildren(root, 1)

  return visible
}

const resetTaskSubtree = (task: ObjectTaskTree): ObjectTaskTree => ({
  ...task,
  status: 'todo',
  completed_at: null,
  completed_by: undefined,
  completed_by_id: null,
  children: task.children.map(resetTaskSubtree),
})

const applyOptimisticTaskStatus = (
  tasks: ObjectTaskTree[],
  taskId: number,
  status: 'todo' | 'done',
): ObjectTaskTree[] => tasks.map((task) => {
  const isChoiceParent = task.children_mode === 'single_choice'
    && task.children.some((child) => child.id === taskId)

  if (isChoiceParent) {
    return {
      ...task,
      selected_child_id: status === 'done' ? taskId : null,
      children: task.children.map((child) => {
        if (child.id === taskId) {
          return status === 'todo'
            ? resetTaskSubtree(child)
            : {
                ...resetTaskSubtree(child),
                status: 'done',
                completed_at: new Date().toISOString(),
              }
        }

        if (status === 'done') {
          return { ...child, status: 'not_applicable', completed_at: null, completed_by: undefined, completed_by_id: null }
        }

        return child.status === 'not_applicable' ? { ...child, status: 'todo' } : child
      }),
    }
  }

  const nextTask = task.id === taskId
    ? status === 'todo'
      ? resetTaskSubtree(task)
      : {
          ...resetTaskSubtree(task),
          status: 'done' as const,
          completed_at: new Date().toISOString(),
        }
    : task

  return { ...nextTask, children: applyOptimisticTaskStatus(nextTask.children, taskId, status) }
})

const replaceTaskInTree = (
  tasks: ObjectTaskTree[],
  updatedTask: ObjectTask,
): ObjectTaskTree[] => tasks.map((task) => {
  const nextTask = task.id === updatedTask.id ? { ...task, ...updatedTask } : task
  return { ...nextTask, children: replaceTaskInTree(nextTask.children, updatedTask) }
})

const visibleTaskTree = (task: ObjectTaskTree): ObjectTaskTree => {
  const completedAlternativeSelected = hasAlternativeChildren(task)
    && task.children.some((child) => child.status === 'done')

  return {
    ...task,
    selected_child_id: hasAlternativeChildren(task) && !completedAlternativeSelected
      ? null
      : task.selected_child_id,
    children: task.children
      .filter((child) => child.status !== 'not_applicable' || !completedAlternativeSelected)
      .map((child) => visibleTaskTree(
        child.status === 'not_applicable' && !completedAlternativeSelected
          ? { ...child, status: 'todo' }
          : child,
      )),
  }
}

const isBlockingStatus = (status: ObjectTaskStatus): boolean =>
  status === 'skipped' || status === 'not_applicable'

function ModalBackdrop({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-3 pt-10 sm:p-4 sm:pt-14">
      <button type="button" className="absolute inset-0 bg-black/50" onClick={onClose} aria-label="Закрыть окно" />
      <div className="relative z-10 max-h-[calc(100dvh-1.5rem)] w-full max-w-[44rem] overflow-visible rounded-2xl border border-base-200 bg-base-100 shadow-2xl sm:rounded-3xl">
        {children}
      </div>
    </div>
  )
}

const isNegativeTaskTitle = (title: string): boolean => {
  const normalizedTitle = title.trim().toLowerCase()
  return /(^|[\s(«"—-])(нет|не|без|отсутствует|отсутствуют|отсутствовал|отсутствовала|отсутствовало)(?=$|[\s.,;:!?»")—-])/u.test(normalizedTitle)
}

function TaskStateIcon({ task }: { task: ObjectTask }) {
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

function UserAvatar({ userId, name }: { userId: number; name: string }) {
  const [avatarUrl, setAvatarUrl] = useState(() => getStoredAvatarUrl(userId))

  useEffect(() => {
    const storedUrl = getStoredAvatarUrl(userId)
    if (storedUrl) {
      setAvatarUrl(storedUrl)
      return
    }

    let cancelled = false
    let objectUrl = ''
    photoApi.getUserAvatar(userId).then((avatar) => {
      if (!avatar || cancelled) return
      objectUrl = URL.createObjectURL(avatar)
      setAvatarUrl(objectUrl)
    }).catch((error) => {
      console.warn(`Не удалось загрузить аватар пользователя ${userId}`, error)
    })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [userId])

  if (avatarUrl) {
    return <img src={avatarUrl} alt="" className="h-5 w-5 shrink-0 rounded-full object-cover" />
  }

  return (
    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-base-200 text-[10px] font-semibold text-base-content/60" aria-hidden="true">
      {name.trim().charAt(0).toUpperCase()}
    </span>
  )
}

function TaskOperations({ task, onChanged }: { task: ObjectTaskTree; onChanged: () => Promise<unknown> }) {
  const [open, setOpen] = useState(false); const [message, setMessage] = useState('')
  const [attachments, setAttachments] = useState<TaskAttachment[]>([])
  const run = async (action: () => Promise<unknown>) => { setMessage(''); try { await action(); await onChanged() } catch (error: unknown) { const status = (error as { response?: { status?: number } })?.response?.status; setMessage(status === 409 ? 'Задача уже изменилась. Данные обновлены — повторите действие.' : 'Не удалось выполнить действие.'); if (status === 409) await onChanged() } }
  useEffect(() => { if (!open) return; objectApi.getAttachments(task.object_id, task.id).then(setAttachments).catch(() => setAttachments([])) }, [open, task.id, task.object_id])
  const upload = async (file?: File) => { if (!file) return; await run(async () => { await objectApi.uploadAttachment(task.object_id, task.id, file); setAttachments(await objectApi.getAttachments(task.object_id, task.id)) }) }
  const openPreview = async (file: TaskAttachment) => {
    const previewWindow = window.open('', '_blank')
    if (!previewWindow) { setMessage('Браузер заблокировал новую вкладку. Разрешите всплывающие окна.'); return }
    previewWindow.document.title = file.original_filename
    previewWindow.document.body.textContent = 'Загрузка файла…'
    try {
      const blob = await objectApi.downloadAttachment(task.object_id, task.id, file.id)
      const url = URL.createObjectURL(blob)
      previewWindow.location.replace(url)
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch {
      previewWindow.close()
      setMessage('Не удалось открыть файл.')
    }
  }
  const download = async (file: TaskAttachment) => {
    try {
      const blob = await objectApi.downloadAttachment(task.object_id, task.id, file.id)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = file.original_filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch { setMessage('Не удалось скачать файл.') }
  }
  return <div className="text-left"><button type="button" className={`inline-flex items-center justify-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-left text-xs font-semibold shadow-sm transition active:scale-[0.98] ${open ? 'border-slate-300 bg-slate-100 text-slate-700' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`} onClick={() => setOpen(!open)}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" stroke="currentColor" strokeWidth="2"><path d="m8 12 4-4a3 3 0 0 1 4 4l-6 6a5 5 0 0 1-7-7l7-7" strokeLinecap="round" strokeLinejoin="round" /></svg>{open ? 'Скрыть файлы' : 'Открыть файлы'}</button>{open && <div className="mt-3 space-y-3 rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm">
    {message && <div className="text-xs text-red-600">{message}</div>}
    <div><label className="btn btn-outline btn-xs justify-start text-left">+ Файл<input type="file" className="hidden" onChange={(e) => void upload(e.target.files?.[0])} /></label><ul className="mt-2 space-y-2">{attachments.map(file => <li key={file.id} className="rounded-lg border border-base-200 p-2 text-left text-xs"><button type="button" className="block max-w-full truncate text-left font-medium text-primary hover:underline" title={file.original_filename} onClick={() => void openPreview(file)}>{file.original_filename}</button><div className="mt-1 flex flex-wrap justify-start gap-3"><button type="button" className="text-left text-slate-600 hover:text-primary hover:underline" onClick={() => void download(file)}>Скачать</button><button type="button" className="text-left text-red-600 hover:underline" onClick={() => void run(async () => { await objectApi.deleteAttachment(task.object_id, task.id, file.id); setAttachments(await objectApi.getAttachments(task.object_id, task.id)) })}>Удалить</button></div></li>)}</ul></div>
  </div>}</div>
}

function TaskTreeNode({
  task,
  onToggleTask,
  expandedTaskIds,
  onToggleExpand,
  onEditTask,
  onCreateChild,
  overdueTaskIds,
  onChanged,
  depth = 0,
}: {
  task: ObjectTaskTree
  onToggleTask: (taskId: number) => Promise<void>
  expandedTaskIds: number[]
  onToggleExpand: (taskId: number) => void
  onEditTask: (task: ObjectTaskTree) => void
  onCreateChild: (task: ObjectTaskTree) => void
  overdueTaskIds: Set<number>
  onChanged: () => Promise<unknown>
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
                <div className="flex items-center gap-1.5 font-medium text-base-content">
                  <UserAvatar userId={task.completed_by.id} name={task.completed_by.full_name} />
                  <span>{task.completed_by.full_name}</span>
                </div>
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
        <TaskOperations task={task} onChanged={onChanged} />
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
                onChanged={onChanged}
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
  // Keep the former renderer available while old deep links are migrated to the list view.
  void TaskTreeNode
  const { id, taskId } = useParams<{ id: string; taskId?: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [objectItem, setObjectItem] = useState<ConstructionObject | null>(null)
  const [tasks, setTasks] = useState<ObjectTaskTree[]>([])
  const [taskHeaders, setTaskHeaders] = useState<ObjectTask[]>([])
  const [allTasks, setAllTasks] = useState<ObjectTaskTree[]>([])
  const [statusTaskGroups, setStatusTaskGroups] = useState<ObjectTaskListGroup[]>([])
  const [stats, setStats] = useState<ObjectTaskStats>({ total: 0, done: 0, todo: 0, inProgress: 0, overdue: 0 })
  const [sectionStats, setSectionStats] = useState<Record<number, ObjectTaskStats>>({})
  const [stages, setStages] = useState<ProjectStageSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedTaskIds, setExpandedTaskIds] = useState<number[]>([])
  const [selectedTaskPath, setSelectedTaskPath] = useState<number[]>([])
  const [taskEditorOpen, setTaskEditorOpen] = useState(false)
  const [taskEditorTarget, setTaskEditorTarget] = useState<ObjectTask | null>(null)
  const [taskEditorMode, setTaskEditorMode] = useState<'create' | 'edit'>('create')
  const [taskForm, setTaskForm] = useState<TaskFormState>(emptyTaskForm())
  const [taskAttachmentFiles, setTaskAttachmentFiles] = useState<File[]>([])
  const [savingTask, setSavingTask] = useState(false)
  const [pendingTaskIds, setPendingTaskIds] = useState<number[]>([])
  const handledScrollLocationRef = useRef('')
  const [taskStatusFilter, setTaskStatusFilter] = useState<TaskStatusFilter>(() =>
    parseTaskStatusFilter(searchParams.get('status')),
  )
  const returnStatusFilter = parseTaskStatusFilter(searchParams.get('returnStatus'))

  const flatTaskOptions = useMemo(() => flattenTaskTree(allTasks), [allTasks])
  const overdueTaskIds = useMemo(() => new Set(
    flatTaskOptions
      .filter(({ task }) => Boolean(task.deadline)
        && new Date(task.deadline as string).getTime() < Date.now()
        && task.status !== 'done'
        && !isBlockingStatus(task.status))
      .map(({ task }) => task.id),
  ), [flatTaskOptions])
  const loadData = async (): Promise<ObjectTaskTree[]> => {
    if (!id) return []

    try {
      const objectId = Number(id)
      const selectedTaskId = taskId ? Number(taskId) : null
      const groupedStatus = taskStatusFilter === 'done' || taskStatusFilter === 'in_progress' || taskStatusFilter === 'todo' || taskStatusFilter === 'overdue'
        ? taskStatusFilter
        : null
      const statusGroupsRequest = groupedStatus
        ? objectApi.getTaskGroups(objectId, groupedStatus, selectedTaskId ?? undefined).catch(() => [])
        : Promise.resolve([])
      const headersRequest = selectedTaskId === null
        ? objectApi.getTasksHeaders(objectId)
        : Promise.resolve([])
      const treeRequest = selectedTaskId !== null
        ? objectApi.getFullTasksTree(objectId)
        : Promise.resolve([])
      const [objData, headersData, fullTreeData, taskStats, filteredGroups, stageData] = await Promise.all([
        objectApi.getById(objectId),
        headersRequest,
        treeRequest,
        objectApi.getTaskStats(objectId, selectedTaskId ?? undefined),
        statusGroupsRequest,
        objectApi.getStages(objectId),
      ])
      const statsBySection = Object.fromEntries(await Promise.all(
        headersData.map(async (header) => [header.id, await objectApi.getTaskStats(objectId, header.id)] as const),
      ))
      const treeData = selectedTaskId === null
        ? []
        : fullTreeData.filter((task) => task.id === selectedTaskId).map(visibleTaskTree)
      setObjectItem(objData)
      setTasks(treeData)
      setTaskHeaders(headersData)
      setAllTasks(fullTreeData)
      setStatusTaskGroups(filteredGroups)
      setStats(taskStats)
      setSectionStats(statsBySection)
      setStages(stageData)
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
    setLoading(true)
    setError('')
    setExpandedTaskIds([])
    setSelectedTaskPath([])
    loadData().then((loadedTasks) => {
      setExpandedTaskIds(loadedTasks.map((task) => task.id))
      const hashTaskId = Number(decodeURIComponent(location.hash).match(/^#task-(\d+)$/)?.[1])
      if (!Number.isNaN(hashTaskId) && loadedTasks[0]) {
        const path = findTaskPath(loadedTasks[0].children, hashTaskId)
        if (path) setSelectedTaskPath(path)
      } else if (loadedTasks[0]) {
        setSelectedTaskPath(findSavedSelectionPath(loadedTasks[0]))
      }
    })
  }, [id, taskId, taskStatusFilter, location.hash])

  useEffect(() => {
    setTaskStatusFilter(parseTaskStatusFilter(searchParams.get('status')))
  }, [searchParams])

  const updateTaskStatusFilter = (filter: TaskStatusFilter) => {
    setTaskStatusFilter(filter)

    const nextSearchParams = new URLSearchParams(searchParams)
    if (filter === 'all') {
      nextSearchParams.delete('status')
    } else {
      nextSearchParams.set('status', filter)
    }

    setSearchParams(nextSearchParams)
  }

  const toggleExpand = (taskId: number) => {
    setExpandedTaskIds((prev) =>
      prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId],
    )
  }
  void toggleExpand

  const handleToggleTask = async (clickedTaskId: number): Promise<void> => {
    if (!id || pendingTaskIds.includes(clickedTaskId)) return

    const currentTask = flattenTaskTree(allTasks).find(({ task }) => task.id === clickedTaskId)?.task
    if (!currentTask) return
    const optimisticStatus: ObjectTaskStatus = currentTask.status === 'done' ? 'todo' : 'done'
    const choiceParent = findTaskParent(allTasks, clickedTaskId)
    const clearsSelectedBranch = optimisticStatus === 'todo'
      && choiceParent?.children_mode === 'single_choice'
    const hasStaleDescendants = currentTask.children.some((child) =>
      flattenTaskTree([child]).some(({ task }) => task.status !== 'todo'),
    )
    if (optimisticStatus === 'todo') {
      const selectedRoot = allTasks.find((task) => task.id === Number(taskId))
      const clickedPath = selectedRoot
        ? findTaskPath(selectedRoot.children, clickedTaskId)
        : null
      setSelectedTaskPath((currentPath) => clickedPath
        ? clickedPath.slice(0, -1)
        : currentPath.filter((pathTaskId) => pathTaskId !== clickedTaskId))
    }
    setPendingTaskIds((current) => [...current, clickedTaskId])
    const optimisticTree = applyOptimisticTaskStatus(allTasks, clickedTaskId, optimisticStatus)
    setAllTasks(optimisticTree)
    const selectedTaskId = taskId ? Number(taskId) : null
    setTasks(selectedTaskId === null
      ? []
      : optimisticTree
        .filter((task) => task.id === selectedTaskId)
        .map(visibleTaskTree))

    try {
      let updatedTask: ObjectTask
      if (clearsSelectedBranch) {
        await objectApi.clearBranch(Number(id), choiceParent.id)
        updatedTask = await objectApi.updateTaskStatus(Number(id), clickedTaskId, 'todo')
      } else {
        if (optimisticStatus === 'done' && hasStaleDescendants) {
          await objectApi.updateTaskStatus(Number(id), clickedTaskId, 'todo')
        }
        updatedTask = await objectApi.updateTaskStatus(Number(id), clickedTaskId, optimisticStatus)
      }
      const updatedTree = replaceTaskInTree(optimisticTree, updatedTask)
      const selectedTree = selectedTaskId === null
        ? updatedTree
        : updatedTree.filter((task) => task.id === selectedTaskId)

      setAllTasks(updatedTree)
      setTasks(selectedTaskId === null ? [] : selectedTree.map(visibleTaskTree))

      // Completing a parent can move its children to in_progress on the backend.
      // Statistics are server-owned: refresh them together with the tree after the mutation.
      await loadData()
      if (currentTask.children.length > 0) {
        setExpandedTaskIds((current) => optimisticStatus === 'done'
          ? (current.includes(clickedTaskId) ? current : [...current, clickedTaskId])
          : current.filter((expandedId) => expandedId !== clickedTaskId))
      }
      window.dispatchEvent(new Event(NOTIFICATIONS_UPDATED_EVENT))
    } catch (err: unknown) {
      console.error('Ошибка обновления статуса:', err)
      await loadData()
    } finally {
      setPendingTaskIds((current) => current.filter((pendingId) => pendingId !== clickedTaskId))
    }
  }

  const openCreateTask = (parentTask?: ObjectTaskTree) => {
    setTaskEditorMode('create')
    setTaskEditorTarget(parentTask ?? null)
    setTaskForm({
      ...emptyTaskForm(),
      parentId: parentTask ? String(parentTask.id) : '',
    })
    setTaskAttachmentFiles([])
    setTaskEditorOpen(true)
  }

  const openEditTask = (task: ObjectTask) => {
    const deadline = toDateInputValue(task.deadline)

    setTaskEditorMode('edit')
    setTaskEditorTarget(task)
    setTaskForm({
      title: task.title,
      parentId: task.parent_id ? String(task.parent_id) : '',
      sortOrder: String(task.sort_order),
      childrenMode: task.children_mode,
      status: task.status,
      deadline,
      deadlineInput: formatDateInputValue(deadline),
    })
    setTaskEditorOpen(true)
  }

  const closeTaskEditor = () => {
    setTaskEditorOpen(false)
    setTaskEditorTarget(null)
    setTaskForm(emptyTaskForm())
    setTaskAttachmentFiles([])
  }

  const handleSaveTask = async () => {
    if (!id || !taskForm.title.trim()) {
      return
    }

    setSavingTask(true)
    try {
      const deadline = toDeadlineIso(taskForm.deadline)
      let createdTaskId: number | null = null
      if (taskEditorMode === 'create') {
        const payload: ObjectTaskUpsertPayload = {
          parent_id: taskForm.parentId ? Number(taskForm.parentId) : null,
          title: taskForm.title.trim(),
          sort_order: taskForm.sortOrder === '' ? null : Number(taskForm.sortOrder),
          children_mode: taskForm.childrenMode,
          deadline,
        }
        const createdTask = await objectApi.createTask(Number(id), payload)
        createdTaskId = createdTask.id
        await Promise.all(
          taskAttachmentFiles.map((file) => objectApi.uploadAttachment(Number(id), createdTask.id, file)),
        )
      } else if (taskEditorTarget) {
        const payload: ObjectTaskUpsertPayload = {
          title: taskForm.title.trim(),
          sort_order: taskForm.sortOrder === '' ? null : Number(taskForm.sortOrder),
          children_mode: taskForm.childrenMode,
          deadline,
          expected_version: taskEditorTarget.version,
        }
        await objectApi.updateTask(Number(id), taskEditorTarget.id, payload)
      }

      closeTaskEditor()
      const loadedTasks = await loadData()
      if (createdTaskId !== null && loadedTasks[0]) {
        const createdTaskPath = findTaskPath(loadedTasks[0].children, createdTaskId)
        if (createdTaskPath) setSelectedTaskPath(createdTaskPath)
      }
      window.dispatchEvent(new Event(NOTIFICATIONS_UPDATED_EVENT))
    } catch (err: unknown) {
      const responseStatus = (err as { response?: { status?: number } }).response?.status
      if (responseStatus === 409) {
        await loadData()
        setTaskEditorOpen(false)
      }
      console.error('Ошибка сохранения задачи:', err)
    } finally {
      setSavingTask(false)
    }
  }

  const taskMatchesFilter = (task: ObjectTaskTree): boolean => {
    if (taskStatusFilter === 'all') return true
    if (taskStatusFilter === 'overdue') return overdueTaskIds.has(task.id)
    if (taskStatusFilter === 'done') {
      return task.status === 'done' || task.status === 'skipped' || task.status === 'not_applicable'
    }
    if (taskStatusFilter === 'todo') return task.status === 'todo'
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

  const filterDoneTaskBranch = (task: ObjectTaskTree): ObjectTaskTree | null => {
    if (task.status !== 'done') return null

    return {
      ...task,
      children: task.children
        .map(filterDoneTaskBranch)
        .filter((child): child is ObjectTaskTree => child !== null),
    }
  }

  const filteredTasks = useMemo(
    () => {
      if (taskStatusFilter !== 'done') {
        return tasks.map(filterTaskTree).filter((task): task is ObjectTaskTree => task !== null)
      }

      return tasks.flatMap((root) => {
        const children = root.children
          .map(filterDoneTaskBranch)
          .filter((child): child is ObjectTaskTree => child !== null)

        return children.length > 0 ? [{ ...root, children }] : []
      })
    },
    [overdueTaskIds, taskStatusFilter, tasks],
  )

  const progressiveTasks = useMemo(
    () => buildProgressiveTaskList(filteredTasks[0], selectedTaskPath),
    [filteredTasks, selectedTaskPath],
  )

  const handleTaskTextClick = (task: ObjectTaskTree, depth: number) => {
    if (depth === 0) return
    if (taskStatusFilter === 'done' && id && taskId) {
      navigate(`/objects/${id}/tasks/${taskId}#task-${task.id}`)
      return
    }
    if (task.status === 'not_applicable' || task.status === 'skipped') return
    void handleToggleTask(task.id)
  }

  const filteredTaskHeaders = useMemo(() => {
    if (taskStatusFilter === 'all' || taskStatusFilter === 'done') return taskHeaders

    const visibleHeaderIds = new Set(
      allTasks
        .filter((task) => filterTaskTree(task) !== null)
        .map((task) => task.id),
    )
    return taskHeaders.filter((header) => visibleHeaderIds.has(header.id))
  }, [allTasks, overdueTaskIds, taskHeaders, taskStatusFilter])

  const validDoneTaskIds = useMemo(() => {
    const ids = new Set<number>()

    const registerDonePath = (items: ObjectTaskTree[], parentsDone: boolean) => {
      items.forEach((item) => {
        const pathIsDone = parentsDone && item.status === 'done'
        if (pathIsDone) ids.add(item.id)
        registerDonePath(item.children, pathIsDone)
      })
    }

    allTasks.forEach((section) => registerDonePath(section.children, true))
    return ids
  }, [allTasks])
  const displayedStatusGroups = taskStatusFilter === 'done' && taskId
    ? statusTaskGroups
      .map((group) => ({
        ...group,
        tasks: group.tasks.filter((task) => validDoneTaskIds.has(task.id)),
      }))
      .filter((group) => group.tasks.length > 0)
    : statusTaskGroups

  useLayoutEffect(() => {
    if (!location.hash) {
      handledScrollLocationRef.current = ''
      return
    }
    if (tasks.length === 0) return

    const scrollLocation = `${location.pathname}${location.hash}`
    if (handledScrollLocationRef.current === scrollLocation) return

    const elementId = decodeURIComponent(location.hash.slice(1))
    const frame = window.requestAnimationFrame(() => {
      const element = Array.from(document.querySelectorAll<HTMLElement>(`[data-task-anchor="${elementId}"]`))
        .find((candidate) => candidate.offsetParent !== null)
      if (!element) return
      handledScrollLocationRef.current = scrollLocation
      element.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest',
      })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [expandedTaskIds, location.hash, tasks])

  const linkedTaskId = Number(decodeURIComponent(location.hash).match(/^#task-(\d+)$/)?.[1])
  const containsTask = (task: ObjectTaskTree, targetId: number): boolean => (
    task.id === targetId || task.children.some((child) => containsTask(child, targetId))
  )
  const renderMobileTask = (task: ObjectTaskTree, depth = 0, isRoot = false): ReactNode => {
    const children = task.children.filter((child) => child.status !== 'not_applicable' && child.status !== 'skipped')
    const canToggle = !isRoot && task.status !== 'not_applicable' && task.status !== 'skipped'
    const canRevealChildren = isRoot || task.status === 'done'
    const overdue = overdueTaskIds.has(task.id)
    const shouldOpen = isRoot
      || expandedTaskIds.includes(task.id)
      || (!Number.isNaN(linkedTaskId) && containsTask(task, linkedTaskId))

    return (
      <article key={task.id} data-task-anchor={`task-${task.id}`} className={`scroll-mt-6 rounded-2xl border bg-white p-4 shadow-sm ${isRoot ? 'border-base-200' : 'border-base-200 border-l-4 border-l-[#ff4539]/70'}`}>
        <div className="flex items-start gap-3">
          {!isRoot && taskStatusFilter !== 'done' && <button type="button" disabled={!canToggle} onClick={() => void handleToggleTask(task.id)} className="mt-0.5 shrink-0 rounded-full disabled:opacity-50" aria-label={task.status === 'done' ? `Отменить выполнение задачи «${task.title}»` : `Выполнить задачу «${task.title}»`}><TaskStateIcon task={task} /></button>}
          <div className="min-w-0 flex-1">
            {isRoot ? <div className="break-words font-semibold text-slate-900">{task.title}</div> : <button type="button" disabled={!canToggle} onClick={() => handleTaskTextClick(task, depth)} className="break-words text-left font-medium text-slate-900 disabled:opacity-50" aria-label={taskStatusFilter === 'done' ? `Показать задачу «${task.title}» во вкладке «Всего»` : task.status === 'done' ? `Сбросить задачу «${task.title}»` : `Выполнить задачу «${task.title}»`}>{task.title}</button>}
            {taskStatusFilter !== 'done' && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-base-content/55">
                <span>{task.deadline ? `Дедлайн: ${formatDateRu(task.deadline)}` : 'Без срока'}</span>
                {overdue && <span className="badge badge-error badge-sm">Просрочено</span>}
              </div>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2">
          <TaskOperations task={task} onChanged={loadData} />
          {taskStatusFilter !== 'done' && <div className="flex items-center gap-1">
          <button
            type="button"
            className="inline-flex items-center justify-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-slate-400 transition hover:bg-slate-50 hover:text-slate-600 active:scale-[0.98]"
            onClick={() => openEditTask(task)}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-3 w-3 shrink-0" stroke="currentColor" strokeWidth="2">
              <path d="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16v4Z" strokeLinecap="round" strokeLinejoin="round" />
              <path d="m13.5 6.5 4 4" strokeLinecap="round" />
            </svg>
            <span>Редактировать</span>
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-slate-400 transition hover:bg-slate-50 hover:text-slate-600 active:scale-[0.98]"
            onClick={() => openCreateTask(task)}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-3 w-3 shrink-0" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
            <span>Подзадача</span>
          </button>
          </div>}
        </div>

        {children.length > 0 && (canRevealChildren ? (
          <details
            className="group mt-4 border-t border-base-200 pt-3"
            open={shouldOpen}
            onToggle={(event) => {
              if (isRoot) return
              const isOpen = event.currentTarget.open
              setExpandedTaskIds((current) => isOpen
                ? (current.includes(task.id) ? current : [...current, task.id])
                : current.filter((expandedId) => expandedId !== task.id))
            }}
          >
            <summary className="cursor-pointer list-none rounded-xl bg-base-200 px-3 py-2 text-sm font-semibold text-slate-800">
              <span className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  <span aria-hidden="true" className="inline-block text-base transition-transform group-open:rotate-90">›</span>
                  <span>{hasAlternativeChildren(task) ? 'Варианты' : 'Подзадачи'}</span>
                </span>
                <span className="badge badge-ghost badge-sm">{children.length}</span>
              </span>
            </summary>
            <div className="mt-3 space-y-3 border-l-2 border-slate-200 pl-3">
              {children.map((child) => renderMobileTask(child, depth + 1))}
            </div>
          </details>
        ) : (
          <div className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">Подзадачи откроются после выполнения этой задачи.</div>
        ))}
      </article>
    )
  }

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <span className="loading loading-spinner text-[#ff4539]" />
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
            to={taskId
              ? `/objects/${objectItem.id}/tasks${returnStatusFilter === 'all' ? '' : `?status=${returnStatusFilter}`}`
              : `/objects/${objectItem.id}`}
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
            onClick={() => updateTaskStatusFilter('all')}
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
            onClick={() => updateTaskStatusFilter('done')}
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
            onClick={() => updateTaskStatusFilter('in_progress')}
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
            onClick={() => updateTaskStatusFilter('todo')}
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
            onClick={() => updateTaskStatusFilter('overdue')}
            aria-pressed={taskStatusFilter === 'overdue'}
          >
            <div className="text-xs uppercase tracking-wide text-rose-700">Просрочено</div>
            <div className="font-semibold text-lg text-rose-700">{stats.overdue}</div>
          </button>
        </div>
      </div>

      {taskStatusFilter !== 'all' && taskStatusFilter !== 'done' ? (
        displayedStatusGroups.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-base-300 bg-base-100 p-10 text-center text-base-content/60">
            Задачи с выбранным статусом не найдены.
          </div>
        ) : (
          <div className="space-y-4">
            {displayedStatusGroups.map((group) => (
              <section key={group.main_task_id} className="overflow-hidden rounded-3xl border border-base-200 bg-base-100 shadow-sm">
                <ul className="divide-y divide-base-200">
                  {group.tasks.map((task) => {
                    const isDone = task.status === 'done'
                    const isOverdue = taskStatusFilter === 'overdue'
                    const taskDestination = `/objects/${objectItem.id}/tasks/${group.main_task_id}?returnStatus=${taskStatusFilter}#task-${task.id}`
                    const taskPath = task.path.slice(0, -1)

                    return (
                      <li key={task.id} className="p-4 sm:px-5">
                        <div className="flex min-w-0 items-start gap-3">
                          <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full" aria-label={isDone ? 'Задача выполнена' : 'Задача не выполнена'}>
                            <TaskStateIcon task={task} />
                          </span>
                          <Link to={taskDestination} className="group min-w-0 flex-1 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#ff4539]/30">
                            {taskPath.length > 0 && (
                              <div className="mb-1 truncate text-xs text-base-content/45">{taskPath.join(' / ')}</div>
                            )}
                            <div className="break-words font-medium text-base-content transition-colors group-hover:text-[#ff4539]">{task.title}</div>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-base-content/60">
                              {task.deadline && <span>Дедлайн: {formatDateRu(task.deadline)}</span>}
                              {isOverdue && <span className="badge badge-error badge-sm">Просрочено</span>}
                              {task.completed_by?.full_name && (
                                <span className="inline-flex items-center gap-1.5">
                                  <UserAvatar userId={task.completed_by.id} name={task.completed_by.full_name} />
                                  Выполнил: {task.completed_by.full_name}
                                </span>
                              )}
                            </div>
                          </Link>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>
        )
      ) : !taskId ? (
        filteredTaskHeaders.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-base-300 bg-base-100 p-10 text-center text-base-content/60">
            {taskStatusFilter === 'all'
              ? 'Разделы задач пока не добавлены.'
              : 'Разделы с выбранным статусом не найдены.'}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredTaskHeaders.map((header) => {
              const stageSummary = stages.find((stage) => stage.code === header.stage)
              const headerStats = sectionStats[header.id]
              const sectionComplete = Boolean(headerStats?.total) && headerStats.done === headerStats.total
              const sectionProgress = headerStats?.total
                ? Math.round(headerStats.done / headerStats.total * 100)
                : 0
              return (
              <Link
                key={header.id}
                to={taskStatusFilter === 'done'
                  ? `/objects/${objectItem.id}/tasks/${header.id}?status=done&returnStatus=done`
                  : `/objects/${objectItem.id}/tasks/${header.id}`}
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
                {headerStats && (
                  <div className="mt-4 border-t border-slate-100 pt-3">
                    <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
                      <span>{stageSummary?.title || header.title}</span>
                      <span className="font-semibold text-slate-700">{sectionProgress}%</span>
                    </div>
                    <progress className="progress progress-success mt-2 w-full" value={sectionProgress} max="100" />
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                      <span>{headerStats.done} из {headerStats.total} готово</span>
                      <span>{headerStats.inProgress} в работе</span>
                      {headerStats.overdue > 0 && <span className="text-red-600">{headerStats.overdue} просрочено</span>}
                    </div>
                  </div>
                )}
                <div className="mt-5 flex items-center justify-between gap-3 text-sm text-base-content/60">
                  <span>
                    {header.deadline ? `Дедлайн: ${formatDateRu(header.deadline)}` : 'Без дедлайна'}
                  </span>
                  <span className={[
                    'rounded-full px-2.5 py-1 text-xs font-medium',
                    sectionComplete
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-slate-100 text-slate-600',
                  ].join(' ')}>
                    {sectionComplete ? 'Завершён' : 'Открыть'}
                  </span>
                </div>
              </Link>
              )
            })}
          </div>
        )
      ) : filteredTasks.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-base-300 bg-base-100 p-10 text-center text-base-content/60">
          Задачи с выбранным статусом не найдены.
        </div>
      ) : (
        <div className="overflow-hidden rounded-[1.75rem] border border-base-200 bg-base-100">
          <div className="space-y-3 p-3 lg:hidden">
            {tasks[0] && renderMobileTask(tasks[0], 0, true)}
          </div>

          <div className="hidden overflow-x-auto lg:block">
            <table className={`${taskStatusFilter === 'done' ? 'min-w-[640px]' : 'min-w-[980px]'} w-full table-fixed text-left`}>
              {taskStatusFilter === 'done' ? (
                <colgroup><col className="w-[65%]" /><col className="w-[35%]" /></colgroup>
              ) : (
                <colgroup><col className="w-[35%]" /><col className="w-[14%]" /><col className="w-[25%]" /><col className="w-[13%]" /><col className="w-[13%]" /></colgroup>
              )}
              <thead className="bg-base-200">
                <tr>
                  <th className="px-3 py-3 2xl:px-5">Задача</th>
                  {taskStatusFilter !== 'done' && <th className="whitespace-nowrap px-3 py-3 2xl:px-5">Дедлайн</th>}
                  <th className="px-3 py-3 2xl:px-5">Файлы</th>
                  {taskStatusFilter !== 'done' && <th className="px-3 py-3 2xl:px-5">Редактировать</th>}
                  {taskStatusFilter !== 'done' && <th className="px-3 py-3 2xl:px-5">+ Подзадача</th>}
                </tr>
              </thead>
              <tbody>
                {progressiveTasks.map(({ task, depth }) => {
                  const overdue = overdueTaskIds.has(task.id)
                  const isMainTask = depth === 0
                  const canToggle = !isMainTask && task.status !== 'not_applicable' && task.status !== 'skipped'
                  const isSelected = selectedTaskPath[depth - 1] === task.id
                  return <tr key={task.id} id={`task-${task.id}`} data-task-anchor={`task-${task.id}`} className="scroll-mt-6 border-t border-base-200 align-top transition-colors hover:bg-base-200">
                    <td className="px-3 py-3 2xl:px-5">
                      <div style={{ paddingLeft: `${Math.min(Math.max(depth - 1, 0), 5) * 18}px` }}>
                        <div className="flex items-start gap-3">
                          {!isMainTask && taskStatusFilter !== 'done' && (
                            <button type="button" disabled={!canToggle} onClick={() => void handleToggleTask(task.id)} className="mt-0.5 shrink-0 rounded-full transition disabled:cursor-not-allowed disabled:opacity-50" aria-label={task.status === 'done' ? `Отменить выполнение задачи «${task.title}»` : `Выполнить задачу «${task.title}»`}>
                              <TaskStateIcon task={task} />
                            </button>
                          )}
                          {isMainTask ? (
                            <div className="min-w-0 flex-1 font-semibold text-slate-900">{task.title}</div>
                          ) : (
                            <button type="button" disabled={!canToggle} onClick={() => handleTaskTextClick(task, depth)} className="group flex min-w-0 flex-1 items-start rounded-xl text-left font-medium transition hover:text-[#d9362c] disabled:cursor-not-allowed disabled:opacity-50" aria-expanded={task.children.length > 0 ? isSelected : undefined} aria-label={taskStatusFilter === 'done' ? `Показать задачу «${task.title}» во вкладке «Всего»` : task.status === 'done' ? `Сбросить задачу «${task.title}»` : `Выполнить задачу «${task.title}»`}>
                              <span className="min-w-0 text-slate-900 group-hover:text-[#d9362c]">{task.title}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </td>
                    {taskStatusFilter !== 'done' && <td className="px-3 py-3 2xl:px-5"><div className={overdue ? 'font-medium text-red-600' : 'text-slate-600'}>{task.deadline ? formatDateRu(task.deadline) : 'Без срока'}</div>{overdue && <div className="mt-1 text-xs text-red-600">Просрочено</div>}</td>}
                    <td className="px-3 py-3 2xl:px-5"><TaskOperations task={task} onChanged={loadData} /></td>
                    {taskStatusFilter !== 'done' && <td className="px-3 py-3 2xl:px-5"><button type="button" className="rounded-xl py-2 text-left text-sm font-medium text-slate-700 transition hover:text-[#d9362c]" onClick={() => openEditTask(task)} aria-label="Редактировать задачу">Редактировать</button></td>}
                    {taskStatusFilter !== 'done' && <td className="px-3 py-3 2xl:px-5"><button type="button" className="whitespace-nowrap rounded-xl py-2 text-left text-sm font-medium text-slate-700 transition hover:text-[#d9362c]" onClick={() => openCreateTask(task)} aria-label="Добавить подзадачу">+ Подзадача</button></td>}
                  </tr>
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {taskEditorOpen && (
        <ModalBackdrop onClose={closeTaskEditor}>
          <div className="rounded-2xl sm:rounded-3xl">
            <div className="rounded-t-2xl border-b border-base-200 bg-base-200/40 px-4 py-3 sm:rounded-t-3xl sm:px-6">
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

            <div className="space-y-5 p-4 pt-3 sm:p-6 sm:pt-3">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="space-y-3">
                  <span className="text-sm font-medium">Название задачи</span>
                  <input
                    className={`input ${taskEditorFieldClass}`}
                    value={taskForm.title}
                    onChange={(event) => setTaskForm((prev) => ({ ...prev, title: event.target.value }))}
                    placeholder="Введите название задачи"
                  />
                </label>

                {taskEditorMode === 'create' && !taskEditorTarget ? (
                  <label className="space-y-3">
                    <span className="text-sm font-medium">Родительская задача</span>
                    <StyledSelect
                      className="w-full"
                      value={taskForm.parentId}
                      onChange={(value) => setTaskForm((prev) => ({ ...prev, parentId: value }))}
                      options={[{ value: '', label: 'Корневая задача' }, ...flatTaskOptions.map(({ task, depth }) => ({ value: String(task.id), label: `${'— '.repeat(depth)}${task.title}` }))]}
                    />
                  </label>
                ) : null}

                <label className="space-y-3">
                  <span className="text-sm font-medium">Дедлайн</span>
                  <DatePickerInput
                    value={taskForm.deadline}
                    inputValue={taskForm.deadlineInput}
                    placeholder="Дата дедлайна"
                    ariaLabel="Дедлайн задачи"
                    onChange={(deadline, deadlineInput) => (
                      setTaskForm((prev) => ({ ...prev, deadline, deadlineInput }))
                    )}
                  />
                </label>

                {taskEditorMode === 'create' && taskEditorTarget && (
                  <div className="space-y-3 md:col-span-2">
                    <span className="text-sm font-medium">Файлы</span>
                    <label className="flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-base-300 bg-base-100 px-4 py-4 text-sm font-medium text-slate-700 transition hover:border-[#ff4539]/50 hover:bg-[#fff8f7]">
                      + Добавить файлы
                      <input
                        type="file"
                        multiple
                        className="hidden"
                        onChange={(event) => {
                          const selectedFiles = Array.from(event.target.files || [])
                          setTaskAttachmentFiles((current) => [...current, ...selectedFiles])
                          event.target.value = ''
                        }}
                      />
                    </label>
                    {taskAttachmentFiles.length > 0 && (
                      <ul className="space-y-2">
                        {taskAttachmentFiles.map((file, index) => (
                          <li key={`${file.name}-${file.size}-${index}`} className="flex items-center justify-between gap-3 rounded-xl border border-base-200 px-3 py-2 text-sm">
                            <span className="min-w-0 truncate" title={file.name}>{file.name}</span>
                            <button type="button" className="shrink-0 text-red-600 hover:underline" onClick={() => setTaskAttachmentFiles((files) => files.filter((_, fileIndex) => fileIndex !== index))}>
                              Удалить
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

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
