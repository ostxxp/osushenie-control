import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { objectApi } from '@services/api'
import { calculateLogicalTaskStats, formatDateTimeRu } from '@/utils'
import type { ConstructionObject, ObjectTaskTree } from '@/types'

function TaskStateIcon({ task }: { task: ObjectTaskTree }) {
  if (task.status === 'done') {
    return (
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-xs font-bold text-white">
        ✓
      </span>
    )
  }

  return <span className="inline-block h-5 w-5 rounded-full border-2 border-base-300 bg-white" />
}

function TaskTreeRow({
  task,
  onToggleTask,
  expandedTaskIds,
  onToggleExpand,
  depth = 0,
}: {
  task: ObjectTaskTree
  onToggleTask: (taskId: number) => Promise<void>
  expandedTaskIds: number[]
  onToggleExpand: (taskId: number) => void
  depth?: number
}) {
  const hasChildren = task.children.length > 0
  const isMainTask = depth === 0
  const isExpanded = expandedTaskIds.includes(task.id)
  const isDone = task.status === 'done'
  const canToggle = task.status !== 'not_applicable' && task.status !== 'skipped'
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
    <>
      <tr className="border-t border-base-200 hover:bg-base-100">
        <td className="px-4 py-3" style={{ paddingLeft: `${depth * 2 + 1}rem` }}>
          <div className="flex items-center gap-3">
            {isMainTask ? (
              hasChildren ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    onToggleExpand(task.id)
                  }}
                  className="inline-flex h-6 w-6 items-center justify-center rounded text-base-content/70 hover:bg-base-200 hover:text-base-content"
                  aria-label={isExpanded ? 'Свернуть задачу' : 'Развернуть задачу'}
                >
                  {isExpanded ? '−' : '+'}
                </button>
              ) : (
                <span className="inline-block h-6 w-6" />
              )
            ) : (
              <TaskStateIcon task={task} />
            )}

            <button
              type="button"
              disabled={!canToggle && !isMainTask}
              onClick={handleTaskClick}
              className={`text-left font-medium transition-colors ${taskClickClass} ${isDone ? 'text-base-content' : ''}`}
            >
              {task.title}
            </button>
          </div>
        </td>
        <td className="px-4 py-3 text-sm text-base-content/70">
          {isDone ? (
            <div className="space-y-0.5">
              <div className="font-medium text-base-content">{task.completed_by?.full_name || '—'}</div>
              <div className="text-xs text-base-content/60">
                {task.completed_at ? formatDateTimeRu(task.completed_at) : '—'}
              </div>
            </div>
          ) : (
            '—'
          )}
        </td>
      </tr>
      {shouldShowChildren &&
        task.children.map((child) => (
          <TaskTreeRow
            key={child.id}
            task={child}
            onToggleTask={onToggleTask}
            expandedTaskIds={expandedTaskIds}
            onToggleExpand={onToggleExpand}
            depth={depth + 1}
          />
        ))}
    </>
  )
}

function ObjectTasksPage() {
  const { id } = useParams<{ id: string }>()
  const [objectItem, setObjectItem] = useState<ConstructionObject | null>(null)
  const [tasks, setTasks] = useState<ObjectTaskTree[]>([])
  const [allTasks, setAllTasks] = useState<ObjectTaskTree[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedTaskIds, setExpandedTaskIds] = useState<number[]>([])

  const loadData = async (): Promise<ObjectTaskTree[]> => {
    if (!id) return []

    try {
      const [objData, treeData, fullTreeData] = await Promise.all([
        objectApi.getById(Number(id)),
        objectApi.getTasksTree(Number(id)),
        objectApi.getFullTasksTree(Number(id)),
      ])
      setObjectItem(objData)
      setTasks(treeData)
      setAllTasks(fullTreeData)
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
    loadData()
  }, [id])

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
    } catch (err: unknown) {
      console.error('Ошибка обновления статуса:', err)
    }
  }

  const stats = useMemo(() => calculateLogicalTaskStats(allTasks), [allTasks])

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
      <div className="space-y-2">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex flex-col items-start gap-2">
            <Link to={`/objects/${objectItem.id}`} className="btn btn-ghost btn-xs text-sm px-2">
              ← К объекту
            </Link>
            <h1 className="text-3xl font-semibold mt-1">{objectItem.name}</h1>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:mt-1">
            <div className="rounded-md border border-base-200 bg-base-100 px-3 py-2 text-center">
              <div className="text-xs text-base-content/70">Всего задач</div>
              <div className="font-semibold">{stats.total}</div>
            </div>

            <div className="rounded-md border border-base-200 bg-base-100 px-3 py-2 text-center">
              <div className="text-xs text-base-content/70">Выполнено</div>
              <div className="font-semibold">{stats.done}</div>
            </div>

            <div className="rounded-md border border-base-200 bg-base-100 px-3 py-2 text-center">
              <div className="text-xs text-base-content/70">Не выполнено</div>
              <div className="font-semibold">{stats.todo}</div>
            </div>

            <div className="rounded-md border border-base-200 bg-base-100 px-3 py-2 text-center">
              <div className="text-xs text-base-content/70">В работе</div>
              <div className="font-semibold">{stats.inProgress}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-base-200 bg-base-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-base-200">
              <tr>
                <th className="px-4 py-3">Наименование задачи</th>
                <th className="px-4 py-3">Кто выполнил</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <TaskTreeRow
                  key={task.id}
                  task={task}
                  onToggleTask={handleToggleTask}
                  expandedTaskIds={expandedTaskIds}
                  onToggleExpand={toggleExpand}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default ObjectTasksPage
