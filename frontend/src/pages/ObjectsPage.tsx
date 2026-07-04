import { useContext, useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { objectApi, photoApi, userApi } from '@services/api'
import { formatDateRu } from '@/utils'
import type { ConstructionObject, User } from '@/types'
import { AuthContext } from '@services/auth'

const objectTypeStorageKey = (objectId: number) => `object-type:${objectId}`

function ModalBackdrop({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 max-h-[calc(100dvh-1.5rem)] w-full max-w-4xl overflow-y-auto rounded-2xl bg-base-100 p-4 shadow-lg sm:max-h-[90vh] sm:rounded-3xl sm:p-6">{children}</div>
    </div>
  )
}

function getErrorMessage(error: unknown, fallback: string): string {
  const detail = (error as { response?: { data?: { detail?: unknown } }; message?: unknown })?.response?.data?.detail
    ?? (error as { message?: unknown })?.message

  if (typeof detail === 'string') {
    return detail
  }

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (typeof item === 'string') {
          return item
        }

        if (item && typeof item === 'object') {
          const maybeMsg = (item as { msg?: unknown }).msg
          if (typeof maybeMsg === 'string') {
            return maybeMsg
          }

          return JSON.stringify(item)
        }

        return ''
      })
      .filter(Boolean)

    if (messages.length > 0) {
      return messages.join(', ')
    }
  }

  if (detail && typeof detail === 'object') {
    return JSON.stringify(detail)
  }

  return fallback
}


function ObjectsPage() {
  const authContext = useContext(AuthContext)
  const userRole = authContext?.userRole
  const [objects, setObjects] = useState<ConstructionObject[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [formError, setFormError] = useState('')
  const [showCreateObject, setShowCreateObject] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newObject, setNewObject] = useState({
    name: '',
    object_type: '',
    address: '',
    start_date: new Date().toISOString().slice(0, 10),
    end_date: '',
  })
  const [users, setUsers] = useState<User[]>([])
  const [selectedWorkerIds, setSelectedWorkerIds] = useState<number[]>([])
  const [responsibleUserId, setResponsibleUserId] = useState('')
  const [responsibleSearch, setResponsibleSearch] = useState('')
  const [responsibleDropdownOpen, setResponsibleDropdownOpen] = useState(false)
  const [workerSearch, setWorkerSearch] = useState('')
  const [workerDropdownOpen, setWorkerDropdownOpen] = useState(false)
  const [objectPhotoFiles, setObjectPhotoFiles] = useState<File[]>([])
  const [objectPhotoPreviewUrls, setObjectPhotoPreviewUrls] = useState<string[]>([])

  const filteredObjects = useMemo(
    () =>
      objects.filter((objectItem) => {
        const query = search.toLowerCase()
        return (
          objectItem.name.toLowerCase().includes(query) ||
          objectItem.address.toLowerCase().includes(query) ||
          (objectItem.is_active ? 'активен' : 'неактивен').includes(query)
        )
      }),
    [search, objects],
  )

  useEffect(() => {
    const fetchObjects = async () => {
      try {
        const data = await objectApi.getAll()
        setObjects(data)
      } catch (err: unknown) {
        setLoadError(getErrorMessage(err, 'Ошибка загрузки объектов'))
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    fetchObjects()
  }, [])

  useEffect(() => {
    const fetchUsers = async () => {
      if (userRole !== 'admin') return

      try {
        const data = await userApi.getAll()
        setUsers(data)
      } catch (err: unknown) {
        console.error(err)
      }
    }

    fetchUsers()
  }, [userRole])

  useEffect(() => {
    const urls = objectPhotoFiles.map((file) => URL.createObjectURL(file))
    setObjectPhotoPreviewUrls(urls)

    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [objectPhotoFiles])

  const toggleWorker = (userId: number) => {
    setSelectedWorkerIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    )
  }

  const availableWorkers = useMemo(
    () => users.filter((user) => user.role === 'chief_engineer' || user.role === 'foreman'),
    [users],
  )

  const getWorkerRoleLabel = (role: string) => (role === 'chief_engineer' ? 'Инженер' : 'Прораб')

  const filteredWorkers = useMemo(
    () =>
      availableWorkers.filter((user) =>
        user.full_name.toLowerCase().includes(workerSearch.toLowerCase()),
      ),
    [availableWorkers, workerSearch],
  )

  const filteredResponsibleWorkers = useMemo(
    () =>
      availableWorkers.filter((user) =>
        user.full_name.toLowerCase().includes(responsibleSearch.toLowerCase()),
      ),
    [availableWorkers, responsibleSearch],
  )

  const responsibleUser = useMemo(
    () => availableWorkers.find((user) => String(user.id) === responsibleUserId) || null,
    [availableWorkers, responsibleUserId],
  )

  const handleChange = (field: string, value: string | boolean) => {
    setNewObject((prev) => ({ ...prev, [field]: value }))
  }

  const handleObjectPhotosChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    const invalidType = files.find((file) => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    const oversizedFile = files.find((file) => file.size > 5 * 1024 * 1024)

    if (invalidType) {
      setFormError('Добавляйте фотографии только в формате JPG, PNG или WebP.')
      event.target.value = ''
      return
    }

    if (oversizedFile) {
      setFormError('Размер каждой фотографии не должен превышать 5 МБ.')
      event.target.value = ''
      return
    }

    setFormError('')
    setObjectPhotoFiles((currentFiles) => {
      const existingKeys = new Set(
        currentFiles.map((file) => `${file.name}:${file.size}:${file.lastModified}`),
      )
      const newFiles = files.filter(
        (file) => !existingKeys.has(`${file.name}:${file.size}:${file.lastModified}`),
      )
      return [...currentFiles, ...newFiles]
    })
    event.target.value = ''
  }

  const handleCreate = async () => {
    // Client-side validation
    if (!newObject.name.trim() || !newObject.address.trim() || !newObject.start_date) {
      setFormError('Пожалуйста, заполните обязательные поля: название, адрес и дату начала.')
      return
    }

    if (newObject.end_date && newObject.end_date < newObject.start_date) {
      setFormError('Дата сдачи не может быть раньше даты начала.')
      return
    }

    setCreating(true)
    setFormError('')
    try {
      const payload = {
        name: newObject.name,
        address: newObject.address,
        is_active: true,
        start_date: newObject.start_date,
        end_date: newObject.end_date || null,
      }
      const created = await objectApi.create(payload)
      const objectType = newObject.object_type.trim()
      const responsibleId = responsibleUserId ? Number(responsibleUserId) : null

      if (objectType) {
        localStorage.setItem(objectTypeStorageKey(created.id), objectType)
      }

      if (responsibleId) {
        await objectApi.assignUserToObject(created.id, responsibleId)
        await objectApi.assignResponsibleToObject(created.id, responsibleId)
      }

      const workerIdsToAssign = selectedWorkerIds.filter((userId) => userId !== responsibleId)
      if (workerIdsToAssign.length > 0) {
        await Promise.all(
          workerIdsToAssign.map((userId) => objectApi.assignUserToObject(created.id, userId)),
        )
      }

      if (objectPhotoFiles.length > 0) {
        await Promise.all(
          objectPhotoFiles.map((file) => photoApi.uploadObjectPhoto(created.id, file)),
        )
      }
      // Refresh list from server to ensure consistent shape
      try {
        const data = await objectApi.getAll()
        setObjects(data)
      } catch (err) {
        // fallback: prepend created object
        setObjects((prev) => [created, ...prev])
      }
      setShowCreateObject(false)
      setSelectedWorkerIds([])
      setResponsibleUserId('')
      setResponsibleSearch('')
      setObjectPhotoFiles([])
      setNewObject({
        name: '',
        object_type: '',
        address: '',
        start_date: new Date().toISOString().slice(0, 10),
        end_date: '',
      })
    } catch (err: unknown) {
      setFormError(getErrorMessage(err, 'Ошибка создания объекта'))
      console.error(err)
    } finally {
      setCreating(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <span className="loading loading-spinner text-primary"></span>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="alert alert-error shadow-lg w-full max-w-md">
          <span>{loadError}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold sm:text-3xl">Объекты строительства</h1>
      </div>

      <div className="flex flex-col gap-4 rounded-[1.75rem] border border-base-200 bg-base-100 p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex-none w-full max-w-sm">
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-700">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M11 18C14.866 18 18 14.866 18 11C18 7.13401 14.866 4 11 4C7.13401 4 4 7.13401 4 11C4 14.866 7.13401 18 11 18Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M20 20L16.65 16.65" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Поиск по объектам..."
                className="w-full rounded-lg border border-base-300 bg-white px-10 py-2 text-slate-900 outline-none transition-colors focus:border-primary focus:ring focus:ring-primary/20 placeholder:text-gray-400"
                aria-label="Поиск по объектам"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-base-200 p-1 text-base-content/70 transition-colors hover:bg-base-300"
                  aria-label="Очистить поиск"
                >
                  ✕
                </button>
              )}
            </div>
            <p className="mt-2 text-sm text-base-content/70">Поиск по названию или адресу.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            {search && (
              <span className="badge badge-outline h-auto shrink-0 whitespace-nowrap px-3 py-2">
                Найдено {filteredObjects.length}
              </span>
            )}
            {userRole === 'admin' && (
              <button
                type="button"
                className="w-full whitespace-nowrap bg-[#ff4539] text-white py-2 px-4 rounded-2xl hover:bg-[#cc372e] focus:outline-none focus:ring-2 focus:ring-[#ff4539] focus:ring-offset-2 transition-colors disabled:bg-[##ff918a] disabled:cursor-not-allowed font-medium cursor-pointer sm:w-auto"
                onClick={() => {
                  setFormError('')
                  setSelectedWorkerIds([])
                  setResponsibleUserId('')
                  setResponsibleSearch('')
                  setObjectPhotoFiles([])
                  setShowCreateObject(true)
                }}
              >
                Добавить объект
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto rounded-[1.75rem] border border-base-200 bg-base-100">
          <table className="w-full min-w-[900px] table-fixed text-left">
            <colgroup>
              <col className="w-[25%]" />
              <col className="w-[30%]" />
              <col className="w-[13%]" />
              <col className="w-[16%]" />
              <col className="w-[16%]" />
            </colgroup>
            <thead className="bg-base-200">
              <tr>
                <th className="px-5 py-3">Название объекта</th>
                <th className="px-5 py-3">Адрес</th>
                <th className="px-5 py-3">Статус</th>
                <th className="px-5 py-3">Начало работ</th>
                <th className="px-5 py-3">Сдача по плану</th>
              </tr>
            </thead>
            <tbody>
              {filteredObjects.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-6 text-center text-base-content/70">
                    Объектов не найдено.
                  </td>
                </tr>
              ) : (
                filteredObjects.map((objectItem) => (
                  <tr key={objectItem.id} className="border-t border-base-200 align-middle hover:bg-base-200">
                    <td className="break-words px-5 py-3 font-medium">
                      <Link to={`/objects/${objectItem.id}`} className="text-primary hover:underline">
                        {objectItem.name}
                      </Link>
                    </td>
                    <td className="break-words px-5 py-3">{objectItem.address}</td>
                    <td className="px-5 py-3">
                      <span
                        className={`badge border ${
                          objectItem.is_active
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'badge-ghost'
                        }`}
                      >
                        {objectItem.is_active ? 'Активен' : 'Не активен'}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3">{formatDateRu(objectItem.start_date)}</td>
                    <td className="whitespace-nowrap px-5 py-3">{objectItem.end_date ? formatDateRu(objectItem.end_date) : '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      {showCreateObject && (
        <ModalBackdrop
          onClose={() => {
            setShowCreateObject(false)
            setFormError('')
            setSelectedWorkerIds([])
            setResponsibleUserId('')
            setResponsibleSearch('')
            setObjectPhotoFiles([])
          }}
        >
          <div className="space-y-2">
            <div className="border-b border-base-200 px-4 pb-2">
              <h2 className="text-3xl font-semibold">Создать объект</h2>
            </div>
            {formError && <div className="alert alert-error">{formError}</div>}
            <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1.15fr_0.85fr]">
              <section className="space-y-4 rounded-2xl border border-base-200 bg-white p-4">
                <div className="border-b border-base-200 pb-3">
                  <h3 className="text-lg font-semibold">Данные объекта</h3>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="flex flex-col gap-2 sm:col-span-2">
                    <span className="text-sm font-medium">Название *</span>
                    <input
                      className="input w-full"
                      placeholder="Например: ЖК Северный, корпус 2"
                      value={newObject.name}
                      onChange={(e) => handleChange('name', e.target.value)}
                    />
                  </label>

                  <label className="flex flex-col gap-2 sm:col-span-2">
                    <span className="text-sm font-medium">Адрес *</span>
                    <input
                      className="input w-full"
                      placeholder="Город, улица, дом"
                      value={newObject.address}
                      onChange={(e) => handleChange('address', e.target.value)}
                    />
                  </label>

                  <label className="flex flex-col gap-2 sm:col-span-2">
                    <span className="text-sm font-medium">Тип объекта</span>
                    <input
                      className="input w-full"
                      placeholder="Например: квартира, дом, офис"
                      value={newObject.object_type}
                      onChange={(e) => handleChange('object_type', e.target.value)}
                    />
                  </label>

                  <label className="flex flex-col gap-2">
                    <span className="text-sm font-medium">Начало объекта</span>
                    <input
                      type="date"
                      className="input w-full"
                      value={newObject.start_date}
                      min={new Date().toISOString().slice(0, 10)}
                      onChange={(e) => {
                        const newStart = e.target.value
                        setNewObject((prev) => ({
                          ...prev,
                          start_date: newStart,
                          end_date: prev.end_date && prev.end_date < newStart ? newStart : prev.end_date,
                        }))
                      }}
                    />
                  </label>

                  <label className="flex flex-col gap-2">
                    <span className="text-sm font-medium">Сдача объекта</span>
                    <input
                      type="date"
                      className="input w-full"
                      value={newObject.end_date}
                      min={newObject.start_date}
                      onChange={(e) => handleChange('end_date', e.target.value)}
                    />
                  </label>

                  <div className="flex flex-col gap-2 sm:col-span-2">
                    <span className="text-sm font-medium">Фотографии объекта</span>
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="cursor-pointer rounded-2xl border border-base-300 bg-base-100 px-4 py-2 text-sm font-medium transition hover:border-[#ff4539]/40 hover:bg-[#ff4539]/5">
                        Добавить фотографии
                        <input
                          type="file"
                          className="hidden"
                          accept="image/jpeg,image/png,image/webp"
                          multiple
                          onChange={handleObjectPhotosChange}
                        />
                      </label>
                      {objectPhotoFiles.length > 0 && (
                        <span className="text-sm text-base-content/60">
                          Выбрано: {objectPhotoFiles.length}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-base-content/60">
                      Можно выбрать несколько файлов за раз и затем добавить ещё. JPG, PNG или WebP до 5 МБ каждый.
                    </p>
                    {objectPhotoPreviewUrls.length > 0 && (
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                        {objectPhotoPreviewUrls.map((url, index) => (
                          <div
                            key={`${objectPhotoFiles[index].name}-${objectPhotoFiles[index].lastModified}`}
                            className="group relative aspect-square overflow-hidden rounded-xl border border-base-200 bg-base-100"
                          >
                            <img
                              src={url}
                              alt={`Фото объекта ${index + 1}`}
                              className="block h-full w-full object-cover"
                            />
                            <button
                              type="button"
                              className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/65 text-sm text-white transition hover:bg-black"
                              onClick={() => setObjectPhotoFiles((files) => files.filter((_, fileIndex) => fileIndex !== index))}
                              aria-label={`Удалить фото ${index + 1}`}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </section>

              <section className="space-y-4 rounded-2xl border border-base-200 bg-white p-4">
                <div className="border-b border-base-200 pb-3">
                  <h3 className="text-lg font-semibold">Команда</h3>
                </div>

                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium">Ответственный</span>
                  <div className="relative">
                    <input
                      className="input w-full"
                      placeholder="Поиск по имени..."
                      value={responsibleSearch}
                      onChange={(e) => setResponsibleSearch(e.target.value)}
                      onFocus={() => setResponsibleDropdownOpen(true)}
                      onBlur={() => setTimeout(() => setResponsibleDropdownOpen(false), 150)}
                      aria-label="Поиск ответственного"
                    />
                    {responsibleDropdownOpen && (
                      <div className="absolute left-0 right-0 z-20 mt-2 max-h-56 overflow-y-auto rounded-lg border border-base-200 bg-white shadow-lg">
                        {filteredResponsibleWorkers.length === 0 ? (
                          <div className="px-4 py-3 text-sm text-base-content/60">Не найдено сотрудников.</div>
                        ) : (
                          filteredResponsibleWorkers.map((user) => (
                            <button
                              type="button"
                              key={user.id}
                              className={`flex w-full items-center justify-between gap-3 border-b border-base-200 px-4 py-3 text-left transition ${
                                responsibleUserId === String(user.id) ? 'bg-primary/10' : 'hover:bg-base-200'
                              }`}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                setResponsibleUserId(String(user.id))
                                setResponsibleSearch(user.full_name)
                                setResponsibleDropdownOpen(false)
                              }}
                            >
                              <div>
                                <div className="font-medium text-slate-900">{user.full_name}</div>
                                <div className="text-xs text-slate-600">{getWorkerRoleLabel(user.role)}</div>
                              </div>
                              <span className={`badge ${responsibleUserId === String(user.id) ? 'badge-primary' : 'badge-outline'}`}>
                                {responsibleUserId === String(user.id) ? 'Выбрано' : 'Выбрать'}
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                  {responsibleUser && (
                    <div className="flex flex-wrap gap-2 rounded-xl bg-base-200/50 p-2">
                      <button
                        type="button"
                        className="badge badge-info badge-sm gap-2"
                        onClick={() => {
                          setResponsibleUserId('')
                          setResponsibleSearch('')
                        }}
                      >
                        {responsibleUser.full_name} ×
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <p className="text-sm font-medium">Дополнительные сотрудники</p>
                  <div className="relative">
                    <input
                      className="input w-full"
                      placeholder="Поиск по имени..."
                      value={workerSearch}
                      onChange={(e) => setWorkerSearch(e.target.value)}
                      onFocus={() => setWorkerDropdownOpen(true)}
                      onBlur={() => setTimeout(() => setWorkerDropdownOpen(false), 150)}
                      aria-label="Поиск по имени сотрудника"
                    />
                    {workerDropdownOpen && (
                      <div className="absolute left-0 right-0 z-20 mt-2 max-h-56 overflow-y-auto rounded-lg border border-base-200 bg-white shadow-lg">
                        {filteredWorkers.length === 0 ? (
                          <div className="px-4 py-3 text-sm text-base-content/60">Не найдено сотрудников.</div>
                        ) : (
                          filteredWorkers.map((user) => (
                            <button
                              type="button"
                              key={user.id}
                              className={`flex w-full items-center justify-between gap-3 border-b border-base-200 px-4 py-3 text-left transition ${
                                selectedWorkerIds.includes(user.id) ? 'bg-primary/10' : 'hover:bg-base-200'
                              }`}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => toggleWorker(user.id)}
                            >
                              <div>
                                <div className="font-medium text-slate-900">{user.full_name}</div>
                                <div className="text-xs text-slate-600">{getWorkerRoleLabel(user.role)}</div>
                              </div>
                              <span className={`badge ${selectedWorkerIds.includes(user.id) ? 'badge-primary' : 'badge-outline'}`}>
                                {selectedWorkerIds.includes(user.id) ? 'Выбрано' : 'Выбрать'}
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                  {selectedWorkerIds.length > 0 && (
                    <div className="flex flex-wrap gap-2 rounded-xl bg-base-200/50 p-2">
                      {selectedWorkerIds.map((id) => {
                        const user = users.find((u) => u.id === id)
                        return (
                          user && (
                            <span key={id} className="badge badge-sm badge-info">
                              {user.full_name}
                            </span>
                          )
                        )
                      })}
                    </div>
                  )}
                </div>
              </section>
            </div>
            <div className="flex justify-end gap-2 border-t border-base-200 pt-4">
              <button
                className="btn"
                onClick={() => {
                  setShowCreateObject(false)
                  setFormError('')
                  setSelectedWorkerIds([])
                  setResponsibleUserId('')
                  setResponsibleSearch('')
                  setObjectPhotoFiles([])
                  setNewObject({
                    name: '',
                    object_type: '',
                    address: '',
                    start_date: new Date().toISOString().slice(0, 10),
                    end_date: '',
                  })
                  setWorkerSearch('')
                  setResponsibleDropdownOpen(false)
                  setWorkerDropdownOpen(false)
                }}
                disabled={creating}
              >
                Отмена
              </button>
              <button
                className="bg-[#ff4539] text-white py-2 px-4 rounded-2xl hover:bg-[#cc372e] focus:outline-none focus:ring-2 focus:ring-[#ff4539] focus:ring-offset-2 transition-colors disabled:bg-[##ff918a] disabled:cursor-not-allowed font-medium cursor-pointer"
                onClick={handleCreate}
                disabled={creating}
              >
                {creating ? 'Сохранение...' : 'Создать'}
              </button>
            </div>
          </div>
        </ModalBackdrop>
      )}
    </div>
  )
}

export default ObjectsPage
