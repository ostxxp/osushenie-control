import { useEffect, useState, useMemo } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { objectApi } from '@services/api'
import { calculateLogicalTaskStats, formatDateRu } from '@/utils'
import type { ConstructionObject, ObjectTaskTree, User } from '@/types'

const objectTypeStorageKey = (objectId: number) => `object-type:${objectId}`

function ObjectDetailsPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [objectItem, setObjectItem] = useState<ConstructionObject | null>(null)
  const [tasks, setTasks] = useState<ObjectTaskTree[]>([])
  const [progress, setProgress] = useState<number>(0)
  const [overdueCount, setOverdueCount] = useState(0)
  const [employees, setEmployees] = useState<User[]>([])
  const [responsibleUsers, setResponsibleUsers] = useState<User[]>([])
  const [objectType, setObjectType] = useState('')
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
        setObjectType(localStorage.getItem(objectTypeStorageKey(objData.id)) || objData.object_type || '')
        setTasks(tasksData)
        try {
          const [progressValue, overdueValue] = await Promise.all([
            objectApi.getProgress(Number(id)),
            objectApi.getOverdueCount(Number(id)),
          ])
          setProgress(progressValue)
          setOverdueCount(overdueValue)
        } catch (e) {
          console.warn('Failed to load object progress', e)
          setProgress(0)
          setOverdueCount(0)
        }
        try {
          const [users, responsible] = await Promise.all([
            objectApi.getAssignedUsers(Number(id)),
            objectApi.getResponsibleUsers(Number(id)).catch(() => []),
          ])
          setEmployees(users)
          setResponsibleUsers(responsible)
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
      {/* Карточка с информацией об объекте и прогрессом */}
      <div className="rounded-[1.75rem] border border-base-200 bg-base-100 p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-stretch gap-6">
          {/* Левая часть - информация об объекте */}
          <div className="flex-1">
            <div className="flex flex-col items-start gap-2 mb-4">
              <button onClick={() => navigate('/objects')} className="btn btn-ghost btn-xs text-sm px-2">
                ← К списку объектов
              </button>
              <h1 className="text-3xl font-semibold">{objectItem.name}</h1>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-base-content/50 text-xs uppercase tracking-wide">Адрес</div>
                <div className="font-medium mt-0.5">{objectItem.address}</div>
              </div>
              <div>
                <div className="text-base-content/50 text-xs uppercase tracking-wide">Тип объекта</div>
                <div className="font-medium mt-0.5">{objectType || '—'}</div>
              </div>
              <div>
                <div className="text-base-content/50 text-xs uppercase tracking-wide">Ответственный</div>
                <div className="font-medium mt-0.5">
                  {responsibleUsers.length > 0
                    ? responsibleUsers.map((user) => user.full_name).join(', ')
                    : '—'}
                </div>
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

          {/* Правая часть - прогресс объекта */}
          <div className="lg:w-64 lg:min-w-[200px] flex flex-col justify-center items-center bg-slate-50/50 rounded-2xl p-6 border border-slate-200/50">
            <div className="text-sm text-base-content/60 font-medium uppercase tracking-wider mb-2">
              Прогресс
            </div>
            <div className="text-5xl font-bold tabular-nums text-primary">
              {progress}%
            </div>
            
            {/* Мини-прогресс бар */}
            <div className="mt-4 w-full h-2 overflow-hidden rounded-full bg-base-200">
              <div
                className="h-full rounded-full bg-primary transition-all duration-700 ease-out"
                style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
              />
            </div>

            {/* Статус прогресса */}
            <div className="mt-3 text-xs text-base-content/50">
              {progress === 0 && 'Ещё не начат'}
              {progress > 0 && progress < 30 && 'Только начали'}
              {progress >= 30 && progress < 70 && 'В процессе'}
              {progress >= 70 && progress < 100 && 'Почти готово'}
              {progress === 100 && 'Завершён!'}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link to={`/objects/${id}/tasks`} className="block rounded-3xl border border-base-200 bg-base-100 p-6 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
            <div>
              <div className="flex items-center justify-between gap-4 mb-2">
                <div className="text-lg font-semibold mb-2 inline-flex">
                  Задачи
                </div>
              </div>
              <div className="text-3xl font-bold">{stats.total}</div>
              <div className="text-sm text-base-content/70">всего задач</div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <span className="text-sm text-base-content/80 min-w-[100px]">Завершено</span>
                <span className="font-semibold tabular-nums">{stats.done}</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                <span className="text-sm text-base-content/80 min-w-[100px]">К выполнению</span>
                <span className="font-semibold tabular-nums">{stats.todo}</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <span className="text-sm text-base-content/80 min-w-[100px]">Просрочено</span>
                <span className="font-semibold tabular-nums">{overdueCount}</span>
              </div>
            </div>
          </div>
        </Link>

        <Link to={`/objects/${id}/employees`} className="block rounded-3xl border border-base-200 bg-base-100 p-6 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-lg font-semibold mb-2 inline-flex">
                Пользователи на объекте
              </div>
              <div className="text-3xl font-bold">{employees.length}</div>
              <div className="text-sm text-base-content/70">всего сотрудников</div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-blue-800"></div>
                <span className="text-sm text-base-content/80 min-w-[80px]">Инженеры</span>
                <span className="font-semibold tabular-nums">
                  {employees.filter((u) => u.role === 'chief_engineer').length}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-green-800"></div>
                <span className="text-sm text-base-content/80 min-w-[80px]">Прорабы</span>
                <span className="font-semibold tabular-nums">
                  {employees.filter((u) => u.role === 'foreman').length}
                </span>
              </div>
            </div>
          </div>
        </Link>
      </div>

      {/* tasks table intentionally removed */}
    </div>
  )
}

export default ObjectDetailsPage
