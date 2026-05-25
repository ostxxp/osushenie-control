import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { objectApi } from '@services/api'
import { formatDateRu } from '@/utils'
import type { ConstructionObject, ObjectTask, ObjectTaskStatus, ObjectTaskTree } from '@/types'

function TaskTreeRow({
  task,
  objectId,
  onStatusChange,
  depth = 0,
}: {
  task: ObjectTaskTree
  objectId: number
  onStatusChange: (taskId: number, status: ObjectTaskStatus) => void
  depth?: number
}) {
  const [isExpanded, setIsExpanded] = useState(true)
  const hasChildren = task.children && task.children.length > 0

  const statusColor = (status: ObjectTaskStatus) => {
    switch (status) {
      case 'DONE':
        return 'text-green-600'
      case 'IN_PROGRESS':
        return 'text-blue-600'
      case 'TODO':
      default:
        return 'text-gray-400'
    }
  }

  const statusIcon = (status: ObjectTaskStatus) => {
    switch (status) {
      case 'DONE':
        return '✓'
      case 'IN_PROGRESS':
        return '●'
      case 'TODO':
      default:
        return '○'
    }
  }

  const nextStatus = (current: ObjectTaskStatus): ObjectTaskStatus => {
    switch (current) {
      case 'TODO':
        return 'IN_PROGRESS'
      case 'IN_PROGRESS':
        return 'DONE'
      case 'DONE':
      default:
        return 'TODO'
    }
  }

  return (
    <>
      <tr className="border-t border-base-200 hover:bg-base-100">
        <td className="px-4 py-3" style={{ paddingLeft: `${depth * 2 + 1}rem` }}>
          <div className="flex items-center gap-2">
            {hasChildren && (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="text-base-content/70 hover:text-base-content"
              >
                {isExpanded ? '−' : '+'}
              </button>
            )}
            {!hasChildren && <span className="w-6" />}
            <span className="font-medium">{task.title}</span>
          </div>
        </td>
        <td className="px-4 py-3">
          <button
            onClick={() => onStatusChange(task.id, nextStatus(task.status))}
            className={`text-2xl hover:opacity-70 transition-opacity ${statusColor(task.status)}`}
            title={`Статус: ${task.status}`}
          >
            {statusIcon(task.status)}
          </button>
        </td>
        <td className="px-4 py-3 text-sm text-base-content/70">
          {task.completed_at ? formatDateRu(task.completed_at) : '—'}
        </td>
        <td className="px-4 py-3 text-sm text-base-content/70">
          {task.completed_by?.full_name || '—'}
        </td>
      </tr>
      {isExpanded &&
        hasChildren &&
        task.children.map((child) => (
          <TaskTreeRow
            key={child.id}
            task={child}
            objectId={objectId}
            onStatusChange={onStatusChange}
            depth={depth + 1}
          />
        ))}
    </>
  )
}

function ObjectTasksPage() {
  const { id } = useParams<{ id: string }>()
  const [objectItem, setObjectItem] = useState<ConstructionObject | null>(null)
  const [taskHeaders, setTaskHeaders] = useState<ObjectTask[]>([])
  const [tasks, setTasks] = useState<ObjectTaskTree[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadData = async () => {
    if (!id) return

    try {
      const [objData, headersData, treeData] = await Promise.all([
        objectApi.getById(Number(id)),
        objectApi.getTasksHeaders(Number(id)),
        objectApi.getTasksTree(Number(id)),
      ])
      setObjectItem(objData)
      setTaskHeaders(headersData)
      setTasks(treeData)
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

  const handleStatusChange = async (taskId: number, newStatus: ObjectTaskStatus) => {
    if (!id) return

    try {
      await objectApi.updateTaskStatus(Number(id), taskId, newStatus)
      await loadData()
    } catch (err: any) {
      console.error('Ошибка обновления статуса:', err)
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
        <div className="flex flex-col items-start gap-2">
          <Link to={`/objects/${objectItem.id}`} className="btn btn-ghost btn-xs text-sm px-2">
            ← К объекту
          </Link>
          <h1 className="text-3xl font-semibold mt-1">{objectItem.name}</h1>
          <p className="text-base-content/70">Дерево задач объекта</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
        <div className="rounded-lg border border-base-200 bg-base-100 p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">Основные задачи</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-base-content/70">Всего узлов</span>
              <span className="font-semibold">{stats.total}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-base-content/70">Корневых задач</span>
              <span className="font-semibold">{taskHeaders.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-base-content/70">В работе</span>
              <span className="font-semibold">{stats.inProgress}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-base-content/70">Завершено</span>
              <span className="font-semibold">{stats.done}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-base-content/70">К выполнению</span>
              <span className="font-semibold">{stats.todo}</span>
            </div>
          </div>

          <div className="divider my-4" />

          <div className="space-y-2">
            {taskHeaders.map((task) => (
              <div key={task.id} className="rounded-lg border border-base-200 bg-base-100 px-3 py-2">
                <div className="text-sm font-medium">{task.title}</div>
                <div className="text-xs text-base-content/60 capitalize">
                  {task.status === 'IN_PROGRESS' ? 'в работе' : task.status === 'DONE' ? 'завершено' : 'к выполнению'}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-base-200 bg-base-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between border-b border-base-200 px-6 py-4">
            <div>
              <h2 className="text-lg font-semibold">Дерево задач</h2>
              <p className="text-sm text-base-content/70">Нажимайте на статус, чтобы быстро обновить задачу.</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-base-200">
                <tr>
                  <th className="px-4 py-3">Наименование узла</th>
                  <th className="px-4 py-3">Статус</th>
                  <th className="px-4 py-3">Выполнено</th>
                  <th className="px-4 py-3">Выполнено</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <TaskTreeRow
                    key={task.id}
                    task={task}
                    objectId={Number(id)}
                    onStatusChange={handleStatusChange}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ObjectTasksPage