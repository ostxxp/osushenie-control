import { useContext, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { notificationApi, objectApi } from '@services/api'
import { AuthContext } from '@services/auth'
import { formatApiError } from '@/utils'
import type { NotificationLog } from '@/types'

type ViewFilter = 'all' | 'unread'

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
  const [viewFilter, setViewFilter] = useState<ViewFilter>('all')
  const [actionId, setActionId] = useState<number | null>(null)
  const [bulkAction, setBulkAction] = useState(false)
  const [objectNames, setObjectNames] = useState<Record<number, string>>({})

  const canViewNotifications = userRole === 'admin' || userRole === 'chief_engineer'

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.is_read).length,
    [notifications],
  )

  const visibleNotifications = useMemo(
    () =>
      viewFilter === 'all'
        ? notifications
        : notifications.filter((notification) => !notification.is_read),
    [notifications, viewFilter],
  )

  const fetchNotifications = async () => {
    setLoading(true)
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
    } catch (err: unknown) {
      setError(formatApiError(err, 'Не удалось загрузить уведомления'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!canViewNotifications) {
      setLoading(false)
      return
    }

    fetchNotifications()
  }, [canViewNotifications])

  const markAsRead = async (notificationId: number) => {
    setActionId(notificationId)
    setError('')

    try {
      const updated = await notificationApi.markAsRead(notificationId)
      setNotifications((prev) =>
        prev.map((notification) =>
          notification.id === notificationId
            ? { ...notification, ...updated }
            : notification,
        ),
      )
    } catch (err: unknown) {
      setError(formatApiError(err, 'Не удалось отметить уведомление как прочитанное'))
    } finally {
      setActionId(null)
    }
  }

  const markAllAsRead = async () => {
    setBulkAction(true)
    setError('')

    try {
      const updated = await notificationApi.markAllAsRead()
      setNotifications((prev) =>
        prev.map((notification) => {
          const matched = updated.find((item) => item.id === notification.id)
          return matched ?? notification
        }),
      )
    } catch (err: unknown) {
      setError(formatApiError(err, 'Не удалось отметить все уведомления как прочитанные'))
    } finally {
      setBulkAction(false)
    }
  }

  if (!canViewNotifications) {
    return (
      <div className="rounded-[2rem] border border-base-200 bg-base-100 p-8 shadow-sm">
        <h1 className="text-3xl font-semibold">Уведомления</h1>
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
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="inline-flex rounded-2xl bg-base-200 p-1">
            <button
              type="button"
              className={[
                'rounded-xl px-4 py-2 text-sm font-medium transition',
                viewFilter === 'all' ? 'bg-[#ff4539] text-white shadow-sm' : 'text-base-content/70 hover:text-base-content',
              ].join(' ')}
              onClick={() => setViewFilter('all')}
            >
              Все ({notifications.length})
            </button>
            <button
              type="button"
              className={[
                'rounded-xl px-4 py-2 text-sm font-medium transition',
                viewFilter === 'unread' ? 'bg-[#ff4539] text-white shadow-sm' : 'text-base-content/70 hover:text-base-content',
              ].join(' ')}
              onClick={() => setViewFilter('unread')}
            >
              Непрочитанные ({unreadCount})
            </button>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="rounded-2xl border border-base-300 bg-base-100 px-5 py-3 font-medium transition hover:border-[#ff4539]/30 hover:bg-[#ff4539]/5 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={fetchNotifications}
            >
              Обновить
            </button>
            <button
              type="button"
              className="rounded-2xl bg-[#ff4539] px-5 py-3 font-medium text-white shadow-lg shadow-[#ff4539]/20 transition hover:bg-[#cc372e] disabled:cursor-not-allowed disabled:bg-[#ff918a]"
              onClick={markAllAsRead}
              disabled={bulkAction || unreadCount === 0}
            >
              {bulkAction ? 'Сохранение...' : 'Отметить все как прочитанные'}
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

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
                className={[
                  'rounded-3xl border p-5 transition-shadow hover:shadow-md',
                  notification.is_read ? 'border-base-200 bg-base-100' : 'border-[#ff4539]/20 bg-[#ff4539]/5',
                ].join(' ')}
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={[
                        'rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]',
                        notification.is_read
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-[#ff4539]/20 bg-[#ff4539]/10 text-[#b42318]',
                      ].join(' ')}>
                        {notification.is_read ? 'Прочитано' : 'Новое'}
                      </span>
                    </div>

                    <p className="text-base leading-7 text-base-content">{notification.message}</p>

                    <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-base-content/60">
                      <span>Создано: {formatDateTime(notification.created_at)}</span>
                      {notification.is_read && (
                        <span>Прочитано: {formatDateTime(notification.read_at)}</span>
                      )}
                      <span>
                        Объект:{' '}
                        <Link to={`/objects/${notification.object_id}`} className="font-medium text-primary hover:underline">
                          {objectNames[notification.object_id] || `#${notification.object_id}`}
                        </Link>
                      </span>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">
                    {!notification.is_read && (
                      <button
                        type="button"
                        className="rounded-2xl bg-[#ff4539] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#cc372e] disabled:cursor-not-allowed disabled:bg-[#ff918a]"
                        onClick={() => markAsRead(notification.id)}
                        disabled={actionId === notification.id}
                      >
                        {actionId === notification.id ? 'Сохранение...' : 'Прочитать'}
                      </button>
                    )}
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
