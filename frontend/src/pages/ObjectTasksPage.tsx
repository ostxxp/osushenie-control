import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { objectApi } from '@services/api'
import { formatDateTimeRu } from '@/utils'
import type { ConstructionObject, ObjectTaskStatus, ObjectTaskTree } from '@/types'

function TaskTreeRow({
  task,
  onPickTask,
  onRevertTask,
  expandedTaskIds,
  onToggleExpand,
  onFocusTask,
  depth = 0,
}: {
  task: ObjectTaskTree
  onPickTask: (taskId: number) => Promise<boolean>
  onRevertTask: (taskId: number) => Promise<boolean>
  expandedTaskIds: number[]
  onToggleExpand: (taskId: number) => void
  onFocusTask: (taskId: number) => void
  depth?: number
}) {
  const hasChildren = task.children && task.children.length > 0
  const isExpanded = expandedTaskIds.includes(task.id)
  

  const formatCompletedBy = (task: ObjectTaskTree) => {
    return task.completed_by?.full_name || '—'
  }


  return (
    <>
      <tr className="border-t border-base-200 hover:bg-base-100">
        <td className="px-4 py-3" style={{ paddingLeft: `${depth * 2 + 1}rem` }}>
          <div className="flex items-center gap-2">
            {hasChildren && (
              <button
                type="button"
                onClick={() => onToggleExpand(task.id)}
                className="text-base-content/70 hover:text-base-content"
              >
                {isExpanded ? '−' : '+'}
              </button>
            )}
            {!hasChildren && <span className="w-6" />}
            <button
              type="button"
              onClick={async () => {
                // If this task itself is already DONE, revert it (even if it has children).
                if (task.status === 'DONE') {
                  await onRevertTask(task.id)
                  return
                }

                // Otherwise, if it has children, focus the header/tree.
                if (hasChildren) {
                  onFocusTask(task.id)
                  return
                }

                // Leaf node not done -> pick it.
                await onPickTask(task.id)
              }}
              className="font-medium text-left transition-colors hover:text-primary"
            >
              {task.title}
            </button>
          </div>
        </td>
        <td className="px-4 py-3 text-sm text-base-content/70">
          {task.status === 'DONE' ? (
            <div className="space-y-0.5">
              <div className="font-medium text-base-content">
                {formatCompletedBy(task)}
              </div>
              <div className="text-xs text-base-content/60">
                {task.completed_at ? formatDateTimeRu(task.completed_at) : '—'}
              </div>
            </div>
          ) : (
            <span></span>
          )}
        </td>
      </tr>
      {isExpanded &&
        hasChildren &&
        task.children.map((child) => (
          <TaskTreeRow
            key={child.id}
            task={child}
            onPickTask={onPickTask}
            onRevertTask={onRevertTask}
            expandedTaskIds={expandedTaskIds}
            onToggleExpand={onToggleExpand}
            onFocusTask={onFocusTask}
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedTaskIds, setExpandedTaskIds] = useState<number[]>([])

  const collectExpandedTaskIds = (nodes: ObjectTaskTree[]): number[] => {
    const expandedIds = new Set<number>()

    const traverse = (items: ObjectTaskTree[], depth = 0): boolean => {
      let hasDoneInBranch = false

      for (const node of items) {
        const childHasDone = node.children.length > 0 ? traverse(node.children, depth + 1) : false
        const isDone = node.status === 'DONE'

        if (childHasDone || isDone) {
          // do not auto-expand top-level (root) nodes (depth === 0)
          if (depth > 0) {
            expandedIds.add(node.id)
          }
          hasDoneInBranch = true
        }
      }

      return hasDoneInBranch
    }

    traverse(nodes, 0)
    return Array.from(expandedIds)
  }

  const loadData = async () => {
    if (!id) return

    try {
      const [objData, treeData] = await Promise.all([
        objectApi.getById(Number(id)),
        objectApi.getTasksTree(Number(id)),
      ])
      setObjectItem(objData)
      setTasks(treeData)
      setExpandedTaskIds(collectExpandedTaskIds(treeData))
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка загрузки задач')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [id])

  const findAncestorIds = (nodes: ObjectTaskTree[], targetId: number): number[] => {
    for (const node of nodes) {
      if (node.children?.some((child) => child.id === targetId)) {
        return [node.id]
      }

      const descendants = findAncestorIds(node.children || [], targetId)
      if (descendants.length > 0) {
        return [node.id, ...descendants]
      }
    }

    return []
  }

  const findPathIds = (nodes: ObjectTaskTree[], targetId: number): number[] => {
    for (const node of nodes) {
      if (node.id === targetId) {
        return [node.id]
      }

      const childPath = findPathIds(node.children || [], targetId)
      if (childPath.length > 0) {
        return [node.id, ...childPath]
      }
    }

    return []
  }

  const toggleExpand = (taskId: number) => {
    setExpandedTaskIds((prev) =>
      prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId],
    )
  }

  const focusTask = (taskId: number) => {
    const pathIds = findPathIds(tasks, taskId)
    if (pathIds.length > 0) {
      setExpandedTaskIds(pathIds)
    }
  }

  const handlePickTask = async (taskId: number): Promise<boolean> => {
    if (!id) return false

    try {
      await objectApi.toggleTaskStatus(Number(id), taskId)
      const ancestorIds = findAncestorIds(tasks, taskId)
      await loadData()
      const pathIds = findPathIds(tasks, taskId)
      setExpandedTaskIds(Array.from(new Set([...pathIds, ...ancestorIds])))
      return true
    } catch (err: any) {
      console.error('Ошибка обновления статуса:', err)
      return false
    }
  }

  const handleRevertTask = async (taskId: number): Promise<boolean> => {
    if (!id) return false

    try {
      await objectApi.toggleTaskStatus(Number(id), taskId)
      await loadData()
      const pathIds = findPathIds(tasks, taskId)
      setExpandedTaskIds(pathIds)
      return true
    } catch (err: any) {
      console.error('Ошибка отката статуса:', err)
      return false
    }
  }

  const stats = useMemo(() => {
    const countStatus = (status: ObjectTaskStatus, items: ObjectTaskTree[]): number => {
      let count = 0
      const traverse = (nodes: ObjectTaskTree[]) => {
        for (const node of nodes) {
          if (node.status === status) count++
          if (node.children) traverse(node.children)
        }
      }
      traverse(items)
      return count
    }

    const countTotal = (items: ObjectTaskTree[]): number => {
      let count = 0
      const traverse = (nodes: ObjectTaskTree[]) => {
        count += nodes.length
        for (const node of nodes) {
          if (node.children) traverse(node.children)
        }
      }
      traverse(items)
      return count
    }

    return {
      total: countTotal(tasks),
      done: countStatus('DONE', tasks),
      inProgress: countStatus('IN_PROGRESS', tasks),
      todo: countStatus('TODO', tasks),
    }
  }, [tasks])

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
                <th className="px-4 py-3">Выполнено</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <TaskTreeRow
                  key={task.id}
                  task={task}
                  onPickTask={handlePickTask}
                  onRevertTask={handleRevertTask}
                  expandedTaskIds={expandedTaskIds}
                  onToggleExpand={toggleExpand}
                  onFocusTask={focusTask}
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