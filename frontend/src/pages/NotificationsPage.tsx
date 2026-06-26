import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { NOTIFICATIONS_UPDATED_EVENT, notificationApi, objectApi } from '@services/api'
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

const formatDateInputLabel = (value: string): string => {
  if (!value) return 'дата события'

  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return 'дата события'

  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

const normalizeDateParts = (year: number, month: number, day: number): string => {
  const date = new Date(year, month - 1, day)

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return ''
  }

  return [
    String(year).padStart(4, '0'),
    String(month).padStart(2, '0'),
    String(day).padStart(2, '0'),
  ].join('-')
}

const parseDateFilterInput = (value: string): string => {
  const trimmed = value.trim()

  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (isoMatch) {
    return normalizeDateParts(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]))
  }

  const ruMatch = trimmed.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/)
  if (ruMatch) {
    return normalizeDateParts(Number(ruMatch[3]), Number(ruMatch[2]), Number(ruMatch[1]))
  }

  return ''
}

const formatDateTextInput = (value: string): string => {
  const digits = value.replace(/\D/g, '').slice(0, 8)
  const parts = [
    digits.slice(0, 2),
    digits.slice(2, 4),
    digits.slice(4, 8),
  ].filter(Boolean)

  return parts.join('.')
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
  const [dateFilter, setDateFilter] = useState('')
  const [dateSearch, setDateSearch] = useState('')
  const [eventSearch, setEventSearch] = useState('')
  const [objectNames, setObjectNames] = useState<Record<number, string>>({})
  const datePickerRef = useRef<HTMLInputElement>(null)

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

      if (dateFilter && toDateInputValue(notification.created_at) !== dateFilter) {
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
  }, [actorFilter, actorSearch, dateFilter, eventSearch, notifications, objectFilter, objectNames, objectSearch])

  const hasActiveFilters = actorSearch.trim() !== '' || actorFilter !== '' || objectSearch.trim() !== '' || objectFilter !== '' || dateSearch.trim() !== '' || dateFilter !== '' || eventSearch.trim() !== ''

  const clearFilters = () => {
    setActorFilter('')
    setActorSearch('')
    setActorDropdownOpen(false)
    setObjectFilter('')
    setObjectSearch('')
    setObjectDropdownOpen(false)
    setDateFilter('')
    setDateSearch('')
    setEventSearch('')
  }

  const openDatePicker = () => {
    const picker = datePickerRef.current
    if (!picker) return

    if (picker.showPicker) {
      picker.showPicker()
    } else {
      picker.click()
    }
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
        <h1 className="text-3xl font-semibold">История действий</h1>
        <p className="mt-3 text-base-content/70">
          Эта страница доступна только администратору и инженеру.
        </p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-28 animate-pulse rounded-[2rem] bg-base-200" />
        <div className="space-y-3 rounded-[2rem] border border-base-200 bg-base-100 p-6 shadow-sm">
          <div className="h-5 w-48 animate-pulse rounded bg-base-200" />
          <div className="h-4 w-80 animate-pulse rounded bg-base-200" />
          <div className="space-y-3 pt-4">
            <div className="h-20 animate-pulse rounded-2xl bg-base-200" />
            <div className="h-20 animate-pulse rounded-2xl bg-base-200" />
            <div className="h-20 animate-pulse rounded-2xl bg-base-200" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="rounded-[2rem] border border-base-200 bg-base-100 p-4 shadow-sm sm:p-6">
        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className={`${error ? 'mt-5 ' : ''}grid gap-3 lg:grid-cols-[minmax(170px,1fr)_minmax(170px,1fr)_minmax(170px,0.9fr)_minmax(220px,1.3fr)_auto] lg:items-center`}>
          <div className="relative">
            <input
              type="text"
              className="input min-h-0 w-full rounded-lg border-base-300 bg-white pr-9 text-sm text-slate-900 placeholder:text-base-content/50 focus:border-primary focus:outline-none"
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
              className="input min-h-0 w-full rounded-lg border-base-300 bg-white pr-9 text-sm text-slate-900 placeholder:text-base-content/50 focus:border-primary focus:outline-none"
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

          <div className="relative" onClick={openDatePicker}>
            <input
              type="text"
              className="input min-h-0 w-full rounded-lg border-base-300 bg-white pr-10 text-sm text-slate-900 placeholder:text-base-content/50 focus:border-primary focus:outline-none"
              value={dateSearch}
              onChange={(event) => {
                const nextValue = formatDateTextInput(event.target.value)
                setDateSearch(nextValue)
                setDateFilter(parseDateFilterInput(nextValue))
              }}
              onClick={(event) => {
                event.stopPropagation()
                openDatePicker()
              }}
              placeholder="дата события"
              aria-label="дата события"
              inputMode="numeric"
              maxLength={10}
            />
            <button
              type="button"
              className="absolute inset-y-0 right-0 flex items-center rounded-r-lg px-3 text-base-content/50 transition hover:text-base-content"
              onClick={(event) => {
                event.stopPropagation()
                openDatePicker()
              }}
              aria-label="Открыть календарь"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M8 2V5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path d="M16 2V5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path d="M3.5 9.09H20.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path d="M18 4H6C4.62 4 3.5 5.12 3.5 6.5V18C3.5 19.38 4.62 20.5 6 20.5H18C19.38 20.5 20.5 19.38 20.5 18V6.5C20.5 5.12 19.38 4 18 4Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
              </svg>
            </button>
            <input
              ref={datePickerRef}
              type="date"
              className="pointer-events-none absolute bottom-0 right-0 h-px w-px opacity-0"
              value={dateFilter}
              onChange={(event) => {
                const nextDate = event.target.value
                setDateFilter(nextDate)
                setDateSearch(formatDateInputLabel(nextDate))
              }}
              tabIndex={-1}
              aria-label="дата события"
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
              className="input min-h-0 w-full rounded-lg border-base-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-base-content/50 focus:border-primary focus:outline-none"
              value={eventSearch}
              onChange={(event) => setEventSearch(event.target.value)}
              placeholder="Поиск по событиям"
              aria-label="Поиск по событиям"
            />
          </div>

          <button
            type="button"
            className="w-full rounded-lg bg-[#00858d] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#006f76] disabled:cursor-not-allowed disabled:bg-[#8ac8cc] lg:w-auto"
            onClick={clearFilters}
            disabled={!hasActiveFilters}
          >
            Очистить фильтр
          </button>
        </div>

        <div className="mt-6 space-y-3">
          {visibleNotifications.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-base-300 bg-base-50 p-10 text-center">
              <div className="text-lg font-medium">Уведомлений нет</div>
              <div className="mt-1 text-sm text-base-content/60">
                Здесь будут появляться события по задачам и объектам.
              </div>
            </div>
          ) : (
            visibleNotifications.map((notification) => (
              <article
                key={notification.receipt_id}
                className="rounded-3xl border border-base-200 bg-base-100 p-5 transition-shadow hover:shadow-md"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3">
                    <p className="text-base leading-7 text-base-content">{notification.message}</p>
                    <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-base-content/60">
                      <span>Создано: {formatDateTime(notification.created_at)}</span>
                      <span>Действие сделал: {notification.actor_full_name || `#${notification.actor_user_id}`}</span>
                      <span>
                        Объект:{' '}
                        <Link to={`/objects/${notification.object_id}`} className="font-medium text-primary hover:underline">
                          {objectNames[notification.object_id] || `#${notification.object_id}`}
                        </Link>
                      </span>
                    </div>
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
