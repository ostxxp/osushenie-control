import { useContext, useEffect, useState, useMemo } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { objectApi } from '@services/api'
import { AuthContext } from '@services/auth'
import { calculateLogicalTaskStats, formatApiError, formatDateRu } from '@/utils'
import type { ConstructionObject, ObjectTaskTree, User } from '@/types'

const objectTypeStorageKey = (objectId: number) => `object-type:${objectId}`

const toDateInputValue = (value: string | null | undefined): string => {
  if (!value) return ''
  return value.slice(0, 10)
}

function ObjectDetailsPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const authContext = useContext(AuthContext)
  const userRole = authContext?.userRole
  const [objectItem, setObjectItem] = useState<ConstructionObject | null>(null)
  const [tasks, setTasks] = useState<ObjectTaskTree[]>([])
  const [progress, setProgress] = useState<number>(0)
  const [overdueCount, setOverdueCount] = useState(0)
  const [employees, setEmployees] = useState<User[]>([])
  const [responsibleUsers, setResponsibleUsers] = useState<User[]>([])
  const [objectType, setObjectType] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [editForm, setEditForm] = useState({
    name: '',
    address: '',
    object_type: '',
    is_active: true,
    start_date: '',
    end_date: '',
  })
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
        setEditForm({
          name: objData.name,
          address: objData.address,
          object_type: localStorage.getItem(objectTypeStorageKey(objData.id)) || objData.object_type || '',
          is_active: objData.is_active,
          start_date: toDateInputValue(objData.start_date),
          end_date: toDateInputValue(objData.end_date),
        })
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
  const canEditObject = userRole === 'admin'

  const resetEditForm = () => {
    if (!objectItem) return

    setEditForm({
      name: objectItem.name,
      address: objectItem.address,
      object_type: objectType,
      is_active: objectItem.is_active,
      start_date: toDateInputValue(objectItem.start_date),
      end_date: toDateInputValue(objectItem.end_date),
    })
    setFormError('')
  }

  const startEditing = () => {
    resetEditForm()
    setIsEditing(true)
  }

  const cancelEditing = () => {
    resetEditForm()
    setIsEditing(false)
  }

  const updateEditForm = (field: keyof typeof editForm, value: string | boolean) => {
    setEditForm((prev) => ({ ...prev, [field]: value }))
  }

  const saveObject = async () => {
    if (!objectItem) return

    if (!editForm.name.trim() || !editForm.address.trim() || !editForm.start_date) {
      setFormError('Заполните название, адрес и дату начала.')
      return
    }

    if (editForm.end_date && editForm.end_date < editForm.start_date) {
      setFormError('Дата сдачи не может быть раньше даты начала.')
      return
    }

    setSaving(true)
    setFormError('')

    try {
      const updated = await objectApi.update(objectItem.id, {
        name: editForm.name.trim(),
        address: editForm.address.trim(),
        is_active: editForm.is_active,
        start_date: editForm.start_date,
        end_date: editForm.end_date || null,
      })

      const nextObjectType = editForm.object_type.trim()
      if (nextObjectType) {
        localStorage.setItem(objectTypeStorageKey(objectItem.id), nextObjectType)
      } else {
        localStorage.removeItem(objectTypeStorageKey(objectItem.id))
      }

      setObjectItem(updated)
      setObjectType(nextObjectType)
      setIsEditing(false)
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: unknown } })?.response?.data
      setFormError(formatApiError(detail, 'Не удалось сохранить изменения объекта.'))
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

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
            <div className="mb-4 flex flex-col gap-3">
              <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
                <button onClick={() => navigate('/objects')} className="btn btn-ghost btn-xs text-sm px-2">
                  ← К списку объектов
                </button>
                {canEditObject && !isEditing && (
                  <button
                    type="button"
                    className="rounded-2xl bg-[#ff4539] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#cc372e]"
                    onClick={startEditing}
                  >
                    Редактировать
                  </button>
                )}
              </div>
              {isEditing ? (
                <input
                  className="input w-full max-w-2xl text-2xl font-semibold"
                  value={editForm.name}
                  onChange={(e) => updateEditForm('name', e.target.value)}
                  aria-label="Название объекта"
                />
              ) : (
                <h1 className="text-3xl font-semibold">{objectItem.name}</h1>
              )}
            </div>

            {formError && (
              <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {formError}
              </div>
            )}

            {isEditing ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
                  <label className="flex flex-col gap-2 md:col-span-2">
                    <span className="text-xs uppercase tracking-wide text-base-content/50">Адрес</span>
                    <input
                      className="input w-full"
                      value={editForm.address}
                      onChange={(e) => updateEditForm('address', e.target.value)}
                    />
                  </label>
                  <label className="flex flex-col gap-2 md:col-span-2">
                    <span className="text-xs uppercase tracking-wide text-base-content/50">Тип объекта</span>
                    <input
                      className="input w-full"
                      value={editForm.object_type}
                      onChange={(e) => updateEditForm('object_type', e.target.value)}
                      placeholder="Например: квартира, дом, офис"
                    />
                  </label>
                  <label className="flex flex-col gap-2">
                    <span className="text-xs uppercase tracking-wide text-base-content/50">Начало работ</span>
                    <input
                      type="date"
                      className="input w-full"
                      value={editForm.start_date}
                      onChange={(e) => {
                        const nextStartDate = e.target.value
                        setEditForm((prev) => ({
                          ...prev,
                          start_date: nextStartDate,
                          end_date: prev.end_date && prev.end_date < nextStartDate ? nextStartDate : prev.end_date,
                        }))
                      }}
                    />
                  </label>
                  <label className="flex flex-col gap-2">
                    <span className="text-xs uppercase tracking-wide text-base-content/50">Сдача объекта</span>
                    <input
                      type="date"
                      className="input w-full"
                      value={editForm.end_date}
                      min={editForm.start_date}
                      onChange={(e) => updateEditForm('end_date', e.target.value)}
                    />
                  </label>
                  <label className="flex items-center gap-3 rounded-2xl border border-base-200 bg-base-50 px-4 py-3 md:col-span-2">
                    <input
                      type="checkbox"
                      className="toggle toggle-primary"
                      checked={editForm.is_active}
                      onChange={(e) => updateEditForm('is_active', e.target.checked)}
                    />
                    <span className="font-medium">Объект активен</span>
                  </label>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <button type="button" className="btn" onClick={cancelEditing} disabled={saving}>
                    Отмена
                  </button>
                  <button
                    type="button"
                    className="rounded-2xl bg-[#ff4539] px-4 py-2 font-medium text-white transition hover:bg-[#cc372e] disabled:cursor-not-allowed disabled:bg-[#ff918a]"
                    onClick={saveObject}
                    disabled={saving}
                  >
                    {saving ? 'Сохранение...' : 'Сохранить'}
                  </button>
                </div>
              </div>
            ) : (
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
            )}
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
