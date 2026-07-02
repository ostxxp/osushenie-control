import { useContext, useEffect, useState, useMemo, useRef, type ChangeEvent } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { objectApi, photoApi } from '@services/api'
import { authService, AuthContext } from '@services/auth'
import { calculateLogicalTaskStats, formatApiError, formatDateRu, formatTaskCount } from '@/utils'
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
  const [activityConfirmationOpen, setActivityConfirmationOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [statusUpdating, setStatusUpdating] = useState(false)
  const [formError, setFormError] = useState('')
  const [editForm, setEditForm] = useState({
    name: '',
    address: '',
    object_type: '',
    is_active: true,
    start_date: '',
    end_date: '',
    responsible_user_id: '',
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [objectPhotos, setObjectPhotos] = useState<Array<{ id: number; name: string; uploadedById: number | null; url: string }>>([])
  const [photosLoading, setPhotosLoading] = useState(true)
  const [photosError, setPhotosError] = useState('')
  const [photosSaving, setPhotosSaving] = useState(false)
  const [photosVersion, setPhotosVersion] = useState(0)
  const [photosSuccess, setPhotosSuccess] = useState('')
  const [activePhotoIndex, setActivePhotoIndex] = useState<number | null>(null)

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
          responsible_user_id: '',
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

  useEffect(() => {
    if (!id) {
      setPhotosLoading(false)
      return
    }

    let cancelled = false
    const objectUrls: string[] = []

    const fetchObjectPhotos = async () => {
      setPhotosLoading(true)
      try {
        const photos = await photoApi.getObjectPhotos(Number(id))
        if (cancelled) return

        const displayedPhotos = photos.map((photo) => {
          const url = URL.createObjectURL(photo.blob)
          objectUrls.push(url)
          return {
            id: photo.id,
            name: photo.originalFilename,
            uploadedById: photo.uploadedById,
            url,
          }
        })

        if (!cancelled) {
          setObjectPhotos(displayedPhotos)
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setPhotosError(formatApiError(err, 'Не удалось загрузить фотографии объекта.'))
        }
      } finally {
        if (!cancelled) {
          setPhotosLoading(false)
        }
      }
    }

    fetchObjectPhotos()

    return () => {
      cancelled = true
      objectUrls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [id, photosVersion])

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

  useEffect(() => {
    if (activePhotoIndex === null) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActivePhotoIndex(null)
      }

      if (event.key === 'ArrowLeft') {
        setActivePhotoIndex((current) => {
          if (current === null) return null
          return (current - 1 + objectPhotos.length) % objectPhotos.length
        })
      }

      if (event.key === 'ArrowRight') {
        setActivePhotoIndex((current) => {
          if (current === null) return null
          return (current + 1) % objectPhotos.length
        })
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [activePhotoIndex, objectPhotos.length])

  useEffect(() => {
    if (activePhotoIndex !== null && activePhotoIndex >= objectPhotos.length) {
      setActivePhotoIndex(objectPhotos.length > 0 ? objectPhotos.length - 1 : null)
    }
  }, [activePhotoIndex, objectPhotos.length])

  const stats = useMemo(() => calculateLogicalTaskStats(tasks), [tasks])
  const canEditObject = userRole === 'admin'
  const currentUser = authService.getCurrentUser()
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
      responsible_user_id: responsibleUsers[0]?.id.toString() || '',
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

      const selectedResponsibleId = editForm.responsible_user_id
        ? Number(editForm.responsible_user_id)
        : null
      const currentResponsibleIds = new Set(responsibleUsers.map((user) => user.id))

      if (selectedResponsibleId !== null && !currentResponsibleIds.has(selectedResponsibleId)) {
        await objectApi.assignResponsibleToObject(objectItem.id, selectedResponsibleId)
      }

      const responsibilityRemovals = responsibleUsers
        .filter((user) => user.id !== selectedResponsibleId)
        .map((user) => objectApi.unassignResponsibleFromObject(objectItem.id, user.id))
      await Promise.all(responsibilityRemovals)

      const nextObjectType = editForm.object_type.trim()
      if (nextObjectType) {
        localStorage.setItem(objectTypeStorageKey(objectItem.id), nextObjectType)
      } else {
        localStorage.removeItem(objectTypeStorageKey(objectItem.id))
      }

      setObjectItem(updated)
      setObjectType(nextObjectType)
      setResponsibleUsers(
        selectedResponsibleId === null
          ? []
          : employees.filter((user) => user.id === selectedResponsibleId),
      )
      setIsEditing(false)
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: unknown } })?.response?.data
      setFormError(formatApiError(detail, 'Не удалось сохранить изменения объекта.'))
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const changeObjectActivity = async () => {
    if (!objectItem || statusUpdating) return

    const isActivating = !objectItem.is_active
    setStatusUpdating(true)
    setFormError('')

    try {
      if (isActivating) {
        const updated = await objectApi.update(objectItem.id, { is_active: true })
        setObjectItem(updated)
        setEditForm((current) => ({ ...current, is_active: true }))
      } else {
        await objectApi.deactivate(objectItem.id)
        navigate('/objects')
      }
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: unknown } })?.response?.data
      setFormError(
        formatApiError(
          detail,
          isActivating ? 'Не удалось активировать объект.' : 'Не удалось деактивировать объект.',
        ),
      )
      console.error(err)
    } finally {
      setStatusUpdating(false)
      setActivityConfirmationOpen(false)
    }
  }

  const addObjectPhotos = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!objectItem) return

    const files = Array.from(event.target.files || [])
    event.target.value = ''
    if (files.length === 0) return

    if (files.some((file) => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))) {
      setPhotosError('Добавляйте фотографии только в формате JPG, PNG или WebP.')
      return
    }

    if (files.some((file) => file.size > 5 * 1024 * 1024)) {
      setPhotosError('Размер каждой фотографии не должен превышать 5 МБ.')
      return
    }

    setPhotosSaving(true)
    setPhotosError('')
    setPhotosSuccess('')
    try {
      await Promise.all(files.map((file) => photoApi.uploadObjectPhoto(objectItem.id, file)))
      setPhotosSuccess(`Добавлено фотографий: ${files.length}.`)
    } catch (err: unknown) {
      setPhotosError(formatApiError(err, 'Не удалось добавить фотографии объекта.'))
    } finally {
      setPhotosSaving(false)
      setPhotosVersion((version) => version + 1)
    }
  }

  const deleteObjectPhoto = async (photoId: number) => {
    if (!window.confirm('Удалить эту фотографию объекта?')) return

    setPhotosSaving(true)
    setPhotosError('')
    setPhotosSuccess('')
    try {
      await photoApi.deletePhoto(photoId)
      setPhotosSuccess('Фотография удалена.')
      setPhotosVersion((version) => version + 1)
    } catch (err: unknown) {
      setPhotosError(formatApiError(err, 'Не удалось удалить фотографию объекта.'))
    } finally {
      setPhotosSaving(false)
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
              className="mb-3 inline-flex w-fit items-center gap-1.5 rounded-xl bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 hover:text-slate-950"
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

              {!isEditing && !objectItem.is_active && (
                <span className="badge h-auto shrink-0 border border-amber-200 bg-amber-50 px-3 py-1 text-amber-700">
                  Объект неактивен
                </span>
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
                        className={`flex h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-sm transition ${
                          objectItem.is_active
                            ? 'text-red-600 hover:bg-red-50'
                            : 'text-emerald-700 hover:bg-emerald-50'
                        }`}
                        onClick={() => {
                          setActionsOpen(false)
                          setActivityConfirmationOpen(true)
                        }}
                        disabled={statusUpdating}
                      >
                        <span className="w-4 text-center" aria-hidden="true">
                          {objectItem.is_active ? '×' : '✓'}
                        </span>
                        {statusUpdating
                          ? objectItem.is_active
                            ? 'Деактивация...'
                            : 'Активация...'
                          : objectItem.is_active
                            ? 'Деактивировать'
                            : 'Активировать'}
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
                  <label className="flex flex-col gap-2 md:col-span-2">
                    <span className="text-xs uppercase tracking-wide text-base-content/50">Ответственный</span>
                    <select
                      className="select w-full"
                      value={editForm.responsible_user_id}
                      onChange={(e) => updateEditForm('responsible_user_id', e.target.value)}
                    >
                      <option value="">Не назначен</option>
                      {employees
                        .filter(
                          (user) =>
                            user.is_active || responsibleUsers.some((responsible) => responsible.id === user.id),
                        )
                        .map((user) => (
                          <option key={user.id} value={user.id}>
                            {user.full_name} — {user.role === 'chief_engineer' ? 'главный инженер' : user.role === 'foreman' ? 'прораб' : 'администратор'}
                            {!user.is_active ? ' (неактивен)' : ''}
                          </option>
                        ))}
                    </select>
                    {employees.length === 0 && (
                      <span className="text-xs text-amber-700">
                        Сначала добавьте сотрудника на объект в разделе «Пользователи».
                      </span>
                    )}
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
              <div className="text-3xl font-bold">{formatTaskCount(stats.total)}</div>
              <div className="text-sm text-base-content/70">всего</div>
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

      <section className="rounded-[1.75rem] border border-slate-200/70 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-slate-950">Фотографии объекта</h2>
          <label
            className={[
              'rounded-2xl bg-[#ff4539] px-4 py-2 text-sm font-medium text-white transition',
              photosSaving
                ? 'cursor-not-allowed bg-[#ff918a]'
                : 'cursor-pointer hover:bg-[#cc372e]',
            ].join(' ')}
          >
            {photosSaving ? 'Сохранение...' : 'Добавить фотографии'}
            <input
              type="file"
              className="hidden"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={addObjectPhotos}
              disabled={photosSaving}
            />
          </label>
        </div>
        {photosSuccess && (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {photosSuccess}
          </div>
        )}
        {photosError && (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {photosError}
          </div>
        )}
        {photosLoading ? (
          <div className="flex min-h-32 items-center justify-center">
            <span className="loading loading-spinner text-primary" />
          </div>
        ) : objectPhotos.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-base-300 px-4 py-8 text-center text-sm text-base-content/60">
            Фотографии объекта пока не добавлены.
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {objectPhotos.map((photo, photoIndex) => (
              <div
                key={photo.id}
                className={`group relative overflow-hidden rounded-2xl bg-slate-100 shadow-sm ${
                  photoIndex === 0 && objectPhotos.length > 2
                    ? 'col-span-2 row-span-2'
                    : ''
                }`}
              >
                <button
                  type="button"
                  className="relative block h-full w-full cursor-zoom-in overflow-hidden text-left"
                  onClick={() => setActivePhotoIndex(photoIndex)}
                  aria-label={`Открыть фотографию ${photo.name}`}
                >
                  <div className="aspect-[4/3] w-full overflow-hidden">
                    <img
                      src={photo.url}
                      alt={photo.name}
                      className="block h-full w-full object-cover transition duration-500 ease-out group-hover:scale-[1.04]"
                    />
                  </div>
                  <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/45 via-transparent to-transparent opacity-0 transition duration-300 group-hover:opacity-100" />
                  <span className="pointer-events-none absolute bottom-3 left-3 flex translate-y-1 items-center gap-2 rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-900 opacity-0 shadow-lg backdrop-blur transition duration-300 group-hover:translate-y-0 group-hover:opacity-100">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                      <path d="m16.5 16.5 4 4M11 8v6M8 11h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    Смотреть
                  </span>
                </button>
                {(userRole === 'admin' || photo.uploadedById === currentUser?.id) && (
                  <button
                    type="button"
                    className="absolute right-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-full bg-slate-950/65 text-lg text-white opacity-0 shadow-sm backdrop-blur transition hover:bg-red-600 group-hover:opacity-100 focus:opacity-100 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => deleteObjectPhoto(photo.id)}
                    disabled={photosSaving}
                    aria-label={`Удалить ${photo.name}`}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {activePhotoIndex !== null && objectPhotos[activePhotoIndex] && (
        <div
          className="fixed inset-0 z-[70] flex flex-col bg-slate-950/95 text-white backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-label="Просмотр фотографий объекта"
        >
          <div className="relative z-10 flex min-h-16 items-center justify-between gap-4 border-b border-white/10 px-4 sm:px-6">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-white/90">
                {objectPhotos[activePhotoIndex].name}
              </div>
              <div className="mt-0.5 text-xs tabular-nums text-white/50">
                {activePhotoIndex + 1} из {objectPhotos.length}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <a
                href={objectPhotos[activePhotoIndex].url}
                download={objectPhotos[activePhotoIndex].name}
                className="flex h-10 items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 text-sm font-medium text-white transition hover:bg-white/20"
                aria-label="Скачать фотографию"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="hidden sm:inline">Скачать</span>
              </a>
              <button
                type="button"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10 text-2xl text-white transition hover:bg-white/20"
                onClick={() => setActivePhotoIndex(null)}
                aria-label="Закрыть просмотр"
              >
                ×
              </button>
            </div>
          </div>

          <div
            className="relative flex min-h-0 flex-1 items-center justify-center px-3 py-4 sm:px-20"
            onClick={() => setActivePhotoIndex(null)}
          >
            <img
              src={objectPhotos[activePhotoIndex].url}
              alt={objectPhotos[activePhotoIndex].name}
              className="max-h-full max-w-full select-none object-contain drop-shadow-[0_24px_48px_rgba(0,0,0,0.45)]"
              onClick={(event) => event.stopPropagation()}
            />

            {objectPhotos.length > 1 && (
              <>
                <button
                  type="button"
                  className="absolute left-3 flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-black/35 text-3xl text-white shadow-xl backdrop-blur transition hover:scale-105 hover:bg-white/20 sm:left-6"
                  onClick={(event) => {
                    event.stopPropagation()
                    setActivePhotoIndex((activePhotoIndex - 1 + objectPhotos.length) % objectPhotos.length)
                  }}
                  aria-label="Предыдущая фотография"
                >
                  ‹
                </button>
                <button
                  type="button"
                  className="absolute right-3 flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-black/35 text-3xl text-white shadow-xl backdrop-blur transition hover:scale-105 hover:bg-white/20 sm:right-6"
                  onClick={(event) => {
                    event.stopPropagation()
                    setActivePhotoIndex((activePhotoIndex + 1) % objectPhotos.length)
                  }}
                  aria-label="Следующая фотография"
                >
                  ›
                </button>
              </>
            )}
          </div>

          {objectPhotos.length > 1 && (
            <div className="border-t border-white/10 bg-black/20 px-4 py-3">
              <div className="mx-auto flex max-w-4xl gap-2 overflow-x-auto pb-1">
                {objectPhotos.map((photo, photoIndex) => (
                  <button
                    key={photo.id}
                    type="button"
                    className={`h-14 w-[4.5rem] shrink-0 overflow-hidden rounded-lg border-2 transition sm:h-16 sm:w-20 ${
                      photoIndex === activePhotoIndex
                        ? 'border-white opacity-100'
                        : 'border-transparent opacity-45 hover:opacity-85'
                    }`}
                    onClick={() => setActivePhotoIndex(photoIndex)}
                    aria-label={`Открыть фотографию ${photoIndex + 1}`}
                    aria-current={photoIndex === activePhotoIndex}
                  >
                    <img src={photo.url} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activityConfirmationOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="activity-confirmation-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/50 backdrop-blur-[2px]"
            onClick={() => {
              if (!statusUpdating) setActivityConfirmationOpen(false)
            }}
            aria-label="Закрыть окно подтверждения"
          />
          <div className="relative w-full max-w-md rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_24px_70px_rgba(15,23,42,0.24)]">
            <div
              className={`mb-4 flex h-12 w-12 items-center justify-center rounded-2xl ${
                objectItem.is_active
                  ? 'bg-red-50 text-red-600'
                  : 'bg-emerald-50 text-emerald-700'
              }`}
              aria-hidden="true"
            >
              <span className="text-2xl">{objectItem.is_active ? '!' : '✓'}</span>
            </div>
            <h2 id="activity-confirmation-title" className="text-xl font-semibold text-slate-950">
              {objectItem.is_active ? 'Деактивировать объект?' : 'Активировать объект?'}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {objectItem.is_active
                ? `Объект «${objectItem.name}» станет неактивным и будет исключён из текущей работы.`
                : `Объект «${objectItem.name}» снова станет активным и вернётся в работу.`}
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => setActivityConfirmationOpen(false)}
                disabled={statusUpdating}
              >
                Отмена
              </button>
              <button
                type="button"
                className={`rounded-xl px-4 py-2 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  objectItem.is_active
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
                onClick={() => void changeObjectActivity()}
                disabled={statusUpdating}
              >
                {statusUpdating
                  ? objectItem.is_active
                    ? 'Деактивация...'
                    : 'Активация...'
                  : objectItem.is_active
                    ? 'Деактивировать'
                    : 'Активировать'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* tasks table intentionally removed */}
    </div>
  )
}

export default ObjectDetailsPage
