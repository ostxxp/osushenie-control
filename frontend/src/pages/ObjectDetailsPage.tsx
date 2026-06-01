import { useEffect, useState, useMemo } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { objectApi } from '@services/api'
import { calculateLogicalTaskStats, formatDateRu } from '@/utils'
import type { ConstructionObject, ObjectTaskTree, User } from '@/types'

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
          objectApi.getFullTasksTree(Number(id)),
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
      } catch (err: unknown) {
        const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        setError(detail || 'Ошибка загрузки данных')
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [id])

  const stats = useMemo(() => calculateLogicalTaskStats(tasks), [tasks])

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
                <span className="font-semibold">{employees.filter((u) => u.role === 'chief_engineer').length}</span>
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
