import { useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { DatePickerInput } from '@/components'
import { getStoredAvatarUrl, NOTIFICATIONS_UPDATED_EVENT, notificationApi, objectApi, photoApi } from '@services/api'
import { AuthContext } from '@services/auth'
import { formatApiError } from '@/utils'
import type { NotificationLog } from '@/types'

const toDateInputValue = (value: string | null): string => {
  if (!value) return ''

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const formatDateTime = (value: string | null): string => {
  if (!value) return '—'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'

  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function NotificationsPage() {
  const authContext = useContext(AuthContext)
  const userRole = authContext?.userRole
  const [notifications, setNotifications] = useState<NotificationLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actorFilter, setActorFilter] = useState('')
  const [actorSearch, setActorSearch] = useState('')
  const [actorDropdownOpen, setActorDropdownOpen] = useState(false)
  const [objectFilter, setObjectFilter] = useState('')
  const [objectSearch, setObjectSearch] = useState('')
  const [objectDropdownOpen, setObjectDropdownOpen] = useState(false)
  const [dateFromFilter, setDateFromFilter] = useState('')
  const [dateFromSearch, setDateFromSearch] = useState('')
  const [dateToFilter, setDateToFilter] = useState('')
  const [dateToSearch, setDateToSearch] = useState('')
  const [eventSearch, setEventSearch] = useState('')
  const [objectNames, setObjectNames] = useState<Record<number, string>>({})
  const [actorAvatarUrls, setActorAvatarUrls] = useState<Record<number, string>>({})

  const canViewNotifications = userRole === 'admin' || userRole === 'chief_engineer'

  const actorOptions = useMemo(() => {
    const uniqueActors = new Map<number, string>()

    notifications.forEach((notification) => {
      uniqueActors.set(
        notification.actor_user_id,
        notification.actor_full_name || `#${notification.actor_user_id}`,
      )
    })

    return Array.from(uniqueActors, ([id, name]) => ({ id, name }))
      .sort((first, second) => first.name.localeCompare(second.name, 'ru'))
  }, [notifications])

  const filteredActorOptions = useMemo(() => {
    const query = actorSearch.trim().toLowerCase()

    if (!query) {
      return actorOptions
    }

    return actorOptions.filter((actor) => actor.name.toLowerCase().includes(query))
  }, [actorOptions, actorSearch])

  useEffect(() => {
    if (actorOptions.length === 0) {
      setActorAvatarUrls({})
      return
    }

    let cancelled = false
    const createdUrls: string[] = []
    setActorAvatarUrls(Object.fromEntries(
      actorOptions.map((actor) => [actor.id, getStoredAvatarUrl(actor.id)]).filter(([, url]) => Boolean(url)),
    ))

    const loadActorAvatars = async () => {
      const entries = await Promise.all(
        actorOptions.map(async (actor): Promise<[number, string] | null> => {
          try {
            const avatar = await photoApi.getUserAvatar(actor.id)
            if (!avatar) return null

            const url = URL.createObjectURL(avatar)
            if (cancelled) {
              URL.revokeObjectURL(url)
              return null
            }

            createdUrls.push(url)
            return [actor.id, url]
          } catch (error) {
            console.warn(`Не удалось загрузить аватар пользователя ${actor.id}`, error)
            return null
          }
        }),
      )

      if (!cancelled) {
        setActorAvatarUrls(
          Object.fromEntries(entries.filter((entry): entry is [number, string] => entry !== null)),
        )
      }
    }

    loadActorAvatars()

    return () => {
      cancelled = true
      createdUrls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [actorOptions])

  const objectOptions = useMemo(() => {
    const uniqueObjects = new Map<number, string>()

    notifications.forEach((notification) => {
      uniqueObjects.set(
        notification.object_id,
        objectNames[notification.object_id] || `#${notification.object_id}`,
      )
    })

    return Array.from(uniqueObjects, ([id, name]) => ({ id, name }))
      .sort((first, second) => first.name.localeCompare(second.name, 'ru'))
  }, [notifications, objectNames])

  const filteredObjectOptions = useMemo(() => {
    const query = objectSearch.trim().toLowerCase()

    if (!query) {
      return objectOptions
    }

    return objectOptions.filter((objectItem) => objectItem.name.toLowerCase().includes(query))
  }, [objectOptions, objectSearch])

  const visibleNotifications = useMemo(() => {
    const query = eventSearch.trim().toLowerCase()
    const actorQuery = actorSearch.trim().toLowerCase()
    const objectQuery = objectSearch.trim().toLowerCase()

    return notifications.filter((notification) => {
      if (actorFilter && String(notification.actor_user_id) !== actorFilter) {
        return false
      }

      const actorName = notification.actor_full_name || `#${notification.actor_user_id}`

      if (!actorFilter && actorQuery && !actorName.toLowerCase().includes(actorQuery)) {
        return false
      }

      const objectName = objectNames[notification.object_id] || `#${notification.object_id}`

      if (objectFilter && String(notification.object_id) !== objectFilter) {
        return false
      }

      if (!objectFilter && objectQuery && !objectName.toLowerCase().includes(objectQuery)) {
        return false
      }

      const notificationDate = toDateInputValue(notification.created_at)

      if (dateFromFilter && !dateToFilter && notificationDate !== dateFromFilter) {
        return false
      }

      if (dateFromFilter && (!notificationDate || notificationDate < dateFromFilter)) {
        return false
      }

      if (dateToFilter && (!notificationDate || notificationDate > dateToFilter)) {
        return false
      }

      if (!query) {
        return true
      }

      const searchableText = [
        notification.message,
        actorName,
      ].join(' ').toLowerCase()

      return searchableText.includes(query)
    })
  }, [actorFilter, actorSearch, dateFromFilter, dateToFilter, eventSearch, notifications, objectFilter, objectNames, objectSearch])

  const hasActiveFilters = actorSearch.trim() !== '' || actorFilter !== '' || objectSearch.trim() !== '' || objectFilter !== '' || dateFromSearch.trim() !== '' || dateFromFilter !== '' || dateToSearch.trim() !== '' || dateToFilter !== '' || eventSearch.trim() !== ''

  const clearFilters = () => {
    setActorFilter('')
    setActorSearch('')
    setActorDropdownOpen(false)
    setObjectFilter('')
    setObjectSearch('')
    setObjectDropdownOpen(false)
    setDateFromFilter('')
    setDateFromSearch('')
    setDateToFilter('')
    setDateToSearch('')
    setEventSearch('')
  }

  const fetchNotifications = useCallback(async (options?: { showLoading?: boolean }) => {
    if (!canViewNotifications) return

    if (options?.showLoading !== false) {
      setLoading(true)
    }
    setError('')

    try {
      const [data, objects] = await Promise.all([
        notificationApi.getAll(),
        objectApi.getAll().catch(() => []),
      ])
      setNotifications(data)
      setObjectNames(
        Object.fromEntries(objects.map((objectItem) => [objectItem.id, objectItem.name])),
      )
      window.dispatchEvent(new Event(NOTIFICATIONS_UPDATED_EVENT))
    } catch (err: unknown) {
      setError(formatApiError(err, 'Не удалось загрузить историю действий'))
    } finally {
      if (options?.showLoading !== false) {
        setLoading(false)
      }
    }
  }, [canViewNotifications])

  useEffect(() => {
    if (!canViewNotifications) {
      setLoading(false)
      return
    }

    fetchNotifications()
  }, [canViewNotifications, fetchNotifications])

  useEffect(() => {
    if (!canViewNotifications) return

    const refreshSilently = () => fetchNotifications({ showLoading: false })
    const intervalId = window.setInterval(refreshSilently, 30000)

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshSilently()
      }
    }

    window.addEventListener('focus', refreshSilently)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('focus', refreshSilently)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [canViewNotifications, fetchNotifications])

  if (!canViewNotifications) {
    return (
      <div className="rounded-[2rem] border border-base-200 bg-base-100 p-8 shadow-sm">
        <h1 className="text-2xl font-semibold sm:text-3xl">История действий</h1>
        <p className="mt-3 text-base-content/70">
          Эта страница доступна только администратору и инженеру.
        </p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-20 animate-pulse rounded-2xl bg-base-200" />
        <div className="space-y-2 rounded-2xl border border-base-200 bg-base-100 p-4 shadow-sm">
          <div className="h-5 w-48 animate-pulse rounded bg-base-200" />
          <div className="h-4 w-80 animate-pulse rounded bg-base-200" />
          <div className="space-y-2 pt-3">
            <div className="h-16 animate-pulse rounded-xl bg-base-200" />
            <div className="h-16 animate-pulse rounded-xl bg-base-200" />
            <div className="h-16 animate-pulse rounded-xl bg-base-200" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-base-200 bg-base-100 p-3 shadow-sm sm:p-4">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className={`${error ? 'mt-4 ' : ''}grid gap-2 lg:grid-cols-[minmax(150px,1fr)_minmax(150px,1fr)_minmax(260px,1.45fr)_minmax(190px,1.15fr)_auto] lg:items-center`}>
          <div className="relative">
            <input
              type="text"
              className="input h-10 min-h-0 w-full rounded-lg border-base-300 bg-white pr-9 text-sm text-slate-900 placeholder:text-base-content/50 focus:border-[#ff4539] focus:outline-none"
              value={actorSearch}
              onChange={(event) => {
                setActorSearch(event.target.value)
                setActorFilter('')
                setActorDropdownOpen(true)
              }}
              onFocus={() => setActorDropdownOpen(true)}
              onBlur={() => setTimeout(() => setActorDropdownOpen(false), 150)}
              placeholder="Пользователь"
              aria-label="Фильтр по пользователю"
            />
            <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-base-content/50">
              ▾
            </span>
            {actorDropdownOpen && (
              <div className="absolute left-0 right-0 z-20 mt-2 max-h-56 overflow-y-auto rounded-lg border border-base-200 bg-white shadow-lg">
                {filteredActorOptions.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-base-content/60">Пользователи не найдены</div>
                ) : (
                  filteredActorOptions.map((actor) => (
                    <button
                      type="button"
                      key={actor.id}
                      className={[
                        'flex w-full items-center justify-between gap-3 border-b border-base-200 px-4 py-3 text-left text-sm transition last:border-b-0',
                        actorFilter === String(actor.id) ? 'bg-primary/10' : 'hover:bg-base-200',
                      ].join(' ')}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setActorFilter(String(actor.id))
                        setActorSearch(actor.name)
                        setActorDropdownOpen(false)
                      }}
                    >
                      <span className="font-medium text-slate-900">{actor.name}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="relative">
            <input
              type="text"
              className="input h-10 min-h-0 w-full rounded-lg border-base-300 bg-white pr-9 text-sm text-slate-900 placeholder:text-base-content/50 focus:border-[#ff4539] focus:outline-none"
              value={objectSearch}
              onChange={(event) => {
                setObjectSearch(event.target.value)
                setObjectFilter('')
                setObjectDropdownOpen(true)
              }}
              onFocus={() => setObjectDropdownOpen(true)}
              onBlur={() => setTimeout(() => setObjectDropdownOpen(false), 150)}
              placeholder="Объект"
              aria-label="Фильтр по объекту"
            />
            <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-base-content/50">
              ▾
            </span>
            {objectDropdownOpen && (
              <div className="absolute left-0 right-0 z-20 mt-2 max-h-56 overflow-y-auto rounded-lg border border-base-200 bg-white shadow-lg">
                {filteredObjectOptions.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-base-content/60">Объекты не найдены</div>
                ) : (
                  filteredObjectOptions.map((objectItem) => (
                    <button
                      type="button"
                      key={objectItem.id}
                      className={[
                        'flex w-full items-center justify-between gap-3 border-b border-base-200 px-4 py-3 text-left text-sm transition last:border-b-0',
                        objectFilter === String(objectItem.id) ? 'bg-primary/10' : 'hover:bg-base-200',
                      ].join(' ')}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setObjectFilter(String(objectItem.id))
                        setObjectSearch(objectItem.name)
                        setObjectDropdownOpen(false)
                      }}
                    >
                      <span className="font-medium text-slate-900">{objectItem.name}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <DatePickerInput
              value={dateFromFilter}
              inputValue={dateFromSearch}
              onChange={(value, inputValue) => {
                setDateFromFilter(value)
                setDateFromSearch(inputValue)
              }}
              max={dateToFilter || undefined}
              placeholder="Дата"
              ariaLabel="Дата"
            />
            <DatePickerInput
              value={dateToFilter}
              inputValue={dateToSearch}
              onChange={(value, inputValue) => {
                setDateToFilter(value)
                setDateToSearch(inputValue)
              }}
              min={dateFromFilter || undefined}
              placeholder="Дата по"
              ariaLabel="Дата по"
            />
          </div>

          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-base-content/50">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M11 18C14.866 18 18 14.866 18 11C18 7.13401 14.866 4 11 4C7.13401 4 4 7.13401 4 11C4 14.866 7.13401 18 11 18Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M20 20L16.65 16.65" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <input
              type="text"
              className="input h-10 min-h-0 w-full rounded-lg border-base-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-base-content/50 focus:border-[#ff4539] focus:outline-none"
              value={eventSearch}
              onChange={(event) => setEventSearch(event.target.value)}
              placeholder="Поиск по событиям"
              aria-label="Поиск по событиям"
            />
          </div>

          <button
            type="button"
            className="h-10 w-full rounded-lg bg-[#ff4539] px-4 text-sm font-semibold text-white transition hover:bg-[#cc372e] disabled:cursor-not-allowed disabled:bg-[#ff918a] lg:w-auto"
            onClick={clearFilters}
            disabled={!hasActiveFilters}
          >
            Очистить фильтр
          </button>
        </div>

        <div className="mt-4 space-y-2">
          {visibleNotifications.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-base-300 bg-base-50 p-8 text-center">
              <div className="text-lg font-medium">Уведомлений нет</div>
              <div className="mt-1 text-sm text-base-content/60">
                Здесь будут появляться события по задачам и объектам.
              </div>
            </div>
          ) : (
            visibleNotifications.map((notification) => (
              <article
                key={notification.receipt_id}
                className="rounded-xl border border-base-200 bg-base-100 px-4 py-3 transition-shadow hover:shadow-sm"
              >
                <div className="space-y-2">
                  <p className="text-sm leading-6 text-base-content">{notification.message}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-base-content/65">
                    <Link to={`/objects/${notification.object_id}`} className="font-semibold text-primary hover:underline">
                      {objectNames[notification.object_id] || `#${notification.object_id}`}
                    </Link>
                    <span className="inline-flex min-w-0 items-center gap-2">
                      {actorAvatarUrls[notification.actor_user_id] ? (
                        <span
                          className="shrink-0 overflow-hidden rounded-full"
                          style={{ width: 18, height: 18, minWidth: 18, maxWidth: 18 }}
                        >
                          <img
                            src={actorAvatarUrls[notification.actor_user_id]}
                            alt=""
                            className="block object-cover"
                            style={{ width: '100%', height: '100%', maxWidth: '100%', maxHeight: '100%' }}
                          />
                        </span>
                      ) : (
                        <span
                          className="flex shrink-0 items-center justify-center rounded-full bg-base-200 text-xs font-semibold text-base-content/60"
                          style={{ width: 18, height: 18, minWidth: 18, maxWidth: 18 }}
                          aria-hidden="true"
                        >
                          {(notification.actor_full_name || `#${notification.actor_user_id}`).trim().charAt(0).toUpperCase()}
                        </span>
                      )}
                      <span className="truncate">{notification.actor_full_name || `#${notification.actor_user_id}`}</span>
                    </span>
                    <span>{formatDateTime(notification.created_at)}</span>
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default NotificationsPage
