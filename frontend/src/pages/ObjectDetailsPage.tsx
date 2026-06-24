import { useContext, useEffect, useState, useMemo, useRef } from 'react'
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
  const [actionsOpen, setActionsOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
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

  const actionsMenuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!actionsOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target
      if (target instanceof Node && actionsMenuRef.current?.contains(target)) {
        return
      }

      setActionsOpen(false)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActionsOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [actionsOpen])

  const stats = useMemo(() => calculateLogicalTaskStats(tasks), [tasks])
  const canEditObject = userRole === 'admin'
  const progressLabel =
    progress === 0
      ? 'Ещё не начат'
      : progress < 30
        ? 'Только начали'
        : progress < 70
          ? 'В процессе'
          : progress < 100
            ? 'Почти готово'
            : 'Завершён'

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

  const deactivateObject = async () => {
    if (!objectItem || deleting) return

    const confirmed = window.confirm('Деактивировать объект? Он будет скрыт из активной работы.')
    if (!confirmed) return

    setDeleting(true)
    setFormError('')

    try {
      await objectApi.deactivate(objectItem.id)
      navigate('/objects')
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: unknown } })?.response?.data
      setFormError(formatApiError(detail, 'Не удалось деактивировать объект.'))
      console.error(err)
    } finally {
      setDeleting(false)
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
      <div className="rounded-[1.75rem] border border-slate-200/70 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
        <div className="grid gap-6 lg:grid-cols-[1fr_220px] lg:items-stretch">
          <div className="min-w-0">
            <button
              onClick={() => navigate('/objects')}
              className="mb-3 inline-flex items-center gap-1 rounded-lg px-1 py-1 text-sm font-medium text-slate-700 transition hover:text-slate-950"
            >
              <span aria-hidden="true">←</span>
              К списку объектов
            </button>

            <div className="mb-5 flex min-w-0 items-center gap-2">
              {isEditing ? (
                <input
                  className="input min-h-0 w-full max-w-2xl rounded-xl border-slate-200 px-3 py-2 text-2xl font-semibold text-slate-950"
                  value={editForm.name}
                  onChange={(e) => updateEditForm('name', e.target.value)}
                  aria-label="Название объекта"
                />
              ) : (
                <h1 className="min-w-0 truncate text-2xl font-semibold leading-tight text-slate-950 sm:text-3xl">
                  {objectItem.name}
                </h1>
              )}

              {canEditObject && !isEditing && (
                <div ref={actionsMenuRef} className="relative">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm min-h-0 h-9 w-9 rounded-xl border border-slate-200 bg-white p-0 text-slate-700 shadow-sm hover:bg-slate-50"
                    aria-label="Действия с объектом"
                    aria-expanded={actionsOpen}
                    onClick={() => setActionsOpen((isOpen) => !isOpen)}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM12 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM12 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                    </svg>
                  </button>
                  {actionsOpen && (
                    <div className="absolute left-0 z-20 mt-2 w-44 rounded-xl border border-slate-100 bg-white p-2 shadow-[0_14px_32px_rgba(15,23,42,0.14)]">
                      <button
                        type="button"
                        className="flex h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-slate-800 transition hover:bg-slate-50"
                        onClick={() => {
                          setActionsOpen(false)
                          startEditing()
                        }}
                      >
                        <span className="w-4 text-center text-slate-700" aria-hidden="true">✎</span>
                        Редактировать
                      </button>
                      <button
                        type="button"
                        className="flex h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-red-600 transition hover:bg-red-50"
                        onClick={() => {
                          setActionsOpen(false)
                          void deactivateObject()
                        }}
                        disabled={deleting}
                      >
                        <span className="w-4 text-center" aria-hidden="true">×</span>
                        {deleting ? 'Деактивация...' : 'Деактивировать'}
                      </button>
                    </div>
                  )}
                </div>
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
              <div className="grid grid-cols-1 gap-x-14 gap-y-4 text-sm sm:grid-cols-2 xl:max-w-3xl">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Адрес</div>
                  <div className="mt-1 font-semibold text-slate-950">{objectItem.address}</div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Тип объекта</div>
                  <div className="mt-1 font-semibold text-slate-950">{objectType || '—'}</div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Ответственный</div>
                  <div className="mt-1 font-semibold text-slate-950">
                    {responsibleUsers.length > 0
                      ? responsibleUsers.map((user) => user.full_name).join(', ')
                      : '—'}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Период работ</div>
                  <div className="mt-1 font-semibold text-slate-950">
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

          <div className="flex min-h-[132px] flex-col items-center justify-center rounded-2xl border border-slate-200/70 bg-slate-50/40 px-6 py-5">
            <div className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-400">
              Прогресс
            </div>
            <div className="text-5xl font-bold tabular-nums leading-none text-primary">
              {progress}%
            </div>
            <div className="mt-4 h-px w-full bg-white shadow-[0_1px_0_rgba(15,23,42,0.06)]" />
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-primary transition-all duration-700 ease-out"
                style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
              />
            </div>
            <div className="mt-3 text-xs font-medium text-slate-400">
              {progressLabel}
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
