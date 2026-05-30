import { useEffect, useState, useMemo } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { objectApi } from '@services/api'
import { formatDateRu } from '@/utils'
import type { ConstructionObject, ObjectTaskTree, ObjectTaskStatus, User } from '@/types'

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
  const [isExpanded, setIsExpanded] = useState(false)
  const hasChildren = task.children && task.children.length > 0

  const statusColor = (status: ObjectTaskStatus) => {
    switch (status) {
      case 'DONE':
        return 'text-green-600'
      case 'IN_PROGRESS':
        return 'text-blue-600'
      case 'TODO':
        return 'text-gray-400'
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
        return '○'
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
        return 'TODO'
      default:
        return 'TODO'
    }
  }

  return (
    <>
      <tr className="border-t border-base-200 hover:bg-base-100">
        {/* node name column removed */}
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

function ObjectDetailsPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [objectItem, setObjectItem] = useState<ConstructionObject | null>(null)
  const [tasks, setTasks] = useState<ObjectTaskTree[]>([])
  const [employees, setEmployees] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return
      try {
        const [objData, tasksData] = await Promise.all([
          objectApi.getById(Number(id)),
          objectApi.getTasksTree(Number(id)),
        ])
        setObjectItem(objData)
        setTasks(tasksData)
        // Try to fetch responsible users for this object (may be empty)
        try {
          // fetch actual assigned users for this object
          const users = await objectApi.getAssignedUsers(Number(id))
          setEmployees(users)
        } catch (e) {
          console.warn('Failed to load object users', e)
        }
      } catch (err: any) {
        setError(err.response?.data?.detail || 'Ошибка загрузки данных')
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [id])

  const handleStatusChange = async (taskId: number, newStatus: ObjectTaskStatus) => {
    if (!id) return
    try {
      await objectApi.updateTaskStatus(Number(id), taskId, newStatus)
      // Refresh tasks
      const updatedTasks = await objectApi.getTasksTree(Number(id))
      setTasks(updatedTasks)
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
        <span className="loading loading-spinner text-primary"></span>
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
          <button onClick={() => navigate('/objects')} className="btn btn-ghost btn-xs text-sm px-2">← К списку объектов</button>
          <h1 className="text-3xl font-semibold mt-1">{objectItem.name}</h1>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-base-content/50 text-xs uppercase tracking-wide">Адрес</div>
            <div className="font-medium mt-0.5">{objectItem.address}</div>
          </div>
          <div>
            <div className="text-base-content/50 text-xs uppercase tracking-wide">Тип объекта</div>
            <div className="font-medium mt-0.5">—</div>
          </div>
          <div>
            <div className="text-base-content/50 text-xs uppercase tracking-wide">Ответственный</div>
            <div className="font-medium mt-0.5">—</div>
          </div>
          <div>
            <div className="text-base-content/50 text-xs uppercase tracking-wide">Период работ</div>
            <div className="font-medium mt-0.5">
              {objectItem.start_date && objectItem.end_date 
                ? `${formatDateRu(objectItem.start_date)} — ${formatDateRu(objectItem.end_date)}`
                : objectItem.start_date 
                  ? `с ${formatDateRu(objectItem.start_date)}`
                  : '—'}
            </div>
          </div>
        </div>
      </div>

      

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-lg border border-base-200 bg-base-100 p-6 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
            <div>
              <div className="flex items-center justify-between gap-4 mb-2">
                <Link to={`/objects/${id}/tasks`} className="text-lg font-semibold mb-2 inline-flex hover:text-primary hover:underline">
                  Задачи
                </Link>
              </div>
              <div className="text-3xl font-bold">{stats.total}</div>
              <div className="text-sm text-base-content/70">всего задач</div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                <span className="text-sm text-base-content/80 min-w-[80px]">В работе</span>
                <span className="font-semibold">{stats.inProgress}</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <span className="text-sm text-base-content/80 min-w-[80px]">Завершено</span>
                <span className="font-semibold">{stats.done}</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                <span className="text-sm text-base-content/80 min-w-[80px]">К выполнению</span>
                <span className="font-semibold">{stats.todo}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-base-200 bg-base-100 p-6 shadow-sm">
          <Link to={`/objects/${id}/employees`} className="text-lg font-semibold mb-2 inline-flex hover:text-primary hover:underline">
            Пользователи на объекте
          </Link>
          <div className="flex items-start justify-between">
            <div>
              <div className="text-3xl font-bold">{employees.length}</div>
              <div className="text-sm text-base-content/70">всего сотрудников</div>
            </div>

            <div className="flex flex-col items-end space-y-2">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-blue-800"></div>
                <span className="text-sm text-base-content/80">Инженеры</span>
                <span className="font-semibold">{employees.filter((u) => u.role === 'engineer' || u.role === 'chief_engineer').length}</span>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-green-800"></div>
                <span className="text-sm text-base-content/80">Прорабы</span>
                <span className="font-semibold">{employees.filter((u) => u.role === 'foreman').length}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* tasks table intentionally removed */}
    </div>
  )
}

export default ObjectDetailsPage
