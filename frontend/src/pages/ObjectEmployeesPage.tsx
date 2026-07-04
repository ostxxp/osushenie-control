import { useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { objectApi, photoApi, userApi } from '@services/api'
import { AuthContext } from '@services/auth'
import type { ConstructionObject, User, UserRole } from '@/types'

const roleLabel: Record<UserRole, string> = {
  admin: 'Администратор',
  chief_engineer: 'Инженер',
  foreman: 'Прораб',
}

const formatEmployeeCount = (count: number): string => {
  const lastTwoDigits = count % 100
  const lastDigit = count % 10

  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
    return 'сотрудников'
  }

  if (lastDigit === 1) {
    return 'сотрудник'
  }

  if (lastDigit >= 2 && lastDigit <= 4) {
    return 'сотрудника'
  }

  return 'сотрудников'
}

function ModalBackdrop({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl overflow-y-auto rounded-2xl bg-base-100 p-4 shadow-lg sm:rounded-[1.75rem] sm:p-6">{children}</div>
    </div>
  )
}

function getErrorMessage(error: unknown, fallback: string): string {
  const detail = (error as { response?: { data?: { detail?: unknown } }; message?: unknown })?.response?.data?.detail
    ?? (error as { message?: unknown })?.message

  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail
      .map((item) => (typeof item === 'string' ? item : JSON.stringify(item)))
      .join(', ')
  }

  return fallback
}

function ObjectEmployeesPage() {
  const { id } = useParams<{ id: string }>()
  const authContext = useContext(AuthContext)
  const userRole = authContext?.userRole
  const canManageEmployees = userRole === 'admin' || userRole === 'chief_engineer'

  const [objectItem, setObjectItem] = useState<ConstructionObject | null>(null)
  const [employees, setEmployees] = useState<User[]>([])
  const [avatarUrls, setAvatarUrls] = useState<Record<number, string>>({})
  const [responsibleUsers, setResponsibleUsers] = useState<User[]>([])
  const [assignableUsers, setAssignableUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingAssignableUsers, setLoadingAssignableUsers] = useState(false)
  const [assigningUserId, setAssigningUserId] = useState<number | null>(null)
  const [responsibilityUpdatingUserId, setResponsibilityUpdatingUserId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [assignError, setAssignError] = useState('')
  const [employeeActionError, setEmployeeActionError] = useState('')
  const [showAddUser, setShowAddUser] = useState(false)
  const [userSearch, setUserSearch] = useState('')

  const loadEmployees = async () => {
    if (!id) return

    const [usersData, responsibleUsersData] = await Promise.all([
      objectApi.getAssignedUsers(Number(id)),
      objectApi.getResponsibleUsers(Number(id)),
    ])
    setEmployees(usersData)
    setResponsibleUsers(responsibleUsersData)
  }

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return

      try {
        const [objectData, usersData, responsibleUsersData] = await Promise.all([
          objectApi.getById(Number(id)),
          objectApi.getAssignedUsers(Number(id)),
          objectApi.getResponsibleUsers(Number(id)),
        ])
        setObjectItem(objectData)
        setEmployees(usersData)
        setResponsibleUsers(responsibleUsersData)
      } catch (err: unknown) {
        setError(getErrorMessage(err, 'Ошибка загрузки сотрудников'))
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [id])

  useEffect(() => {
    if (employees.length === 0) {
      setAvatarUrls({})
      return
    }

    let cancelled = false
    const createdUrls: string[] = []

    const loadAvatars = async () => {
      const entries = await Promise.all(
        employees.map(async (employee): Promise<[number, string] | null> => {
          try {
            const avatar = await photoApi.getUserAvatar(employee.id)
            if (!avatar) return null

            const url = URL.createObjectURL(avatar)
            if (cancelled) {
              URL.revokeObjectURL(url)
              return null
            }

            createdUrls.push(url)
            return [employee.id, url]
          } catch (avatarError) {
            console.warn(`Не удалось загрузить фото пользователя ${employee.id}`, avatarError)
            return null
          }
        }),
      )

      if (!cancelled) {
        setAvatarUrls(Object.fromEntries(entries.filter((entry): entry is [number, string] => entry !== null)))
      }
    }

    loadAvatars()

    return () => {
      cancelled = true
      createdUrls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [employees])

  const assignedUserIds = useMemo(
    () => new Set(employees.map((employee) => employee.id)),
    [employees],
  )

  const responsibleUserIds = useMemo(
    () => new Set(responsibleUsers.map((user) => user.id)),
    [responsibleUsers],
  )

  const availableUsers = useMemo(
    () =>
      assignableUsers.filter((user) => {
        const query = userSearch.toLowerCase()
        const matchesSearch =
          user.full_name.toLowerCase().includes(query) ||
          user.email.toLowerCase().includes(query) ||
          (user.phone_number ?? '').toLowerCase().includes(query)

        return (
          user.is_active &&
          user.role !== 'admin' &&
          !assignedUserIds.has(user.id) &&
          matchesSearch
        )
      }),
    [assignableUsers, assignedUserIds, userSearch],
  )

  const openAddUserModal = async () => {
    if (!canManageEmployees) return

    setShowAddUser(true)
    setAssignError('')
    setUserSearch('')
    setLoadingAssignableUsers(true)

    try {
      const users = userRole === 'admin' ? await userApi.getAll() : await userApi.getForemen()
      setAssignableUsers(users)
    } catch (err: unknown) {
      setAssignError(getErrorMessage(err, 'Ошибка загрузки пользователей'))
      console.error(err)
    } finally {
      setLoadingAssignableUsers(false)
    }
  }

  const refresh = async () => {
    try {
      await loadEmployees()
    } catch (err) {
      console.error(err)
    }
  }

  const handleAssign = async (userId: number) => {
    if (!id) return

    setAssigningUserId(userId)
    setAssignError('')
    try {
      await objectApi.assignUserToObject(Number(id), userId)
      await refresh()
      setAssignableUsers((prev) => prev.filter((user) => user.id !== userId))
    } catch (err: unknown) {
      setAssignError(getErrorMessage(err, 'Ошибка при добавлении сотрудника на объект'))
      console.error(err)
    } finally {
      setAssigningUserId(null)
    }
  }

  const handleUnassign = async (userId: number) => {
    if (!id) return
    try {
      await objectApi.unassignUserFromObject(Number(id), userId)
      await refresh()
    } catch (err) {
      console.error('Ошибка при удалении пользователя с объекта', err)
    }
  }

  const handleUnsetResponsible = async (userId: number) => {
    if (!id || responsibilityUpdatingUserId !== null) return

    setResponsibilityUpdatingUserId(userId)
    setEmployeeActionError('')
    try {
      await objectApi.unassignResponsibleFromObject(Number(id), userId)
      setResponsibleUsers((currentUsers) => currentUsers.filter((user) => user.id !== userId))
      await refresh()
    } catch (err: unknown) {
      setEmployeeActionError(getErrorMessage(err, 'Не удалось снять ответственность с сотрудника'))
      console.error('Ошибка при снятии ответственности', err)
    } finally {
      setResponsibilityUpdatingUserId(null)
    }
  }

  const stats = useMemo(() => {
    return {
      total: employees.length,
      engineers: employees.filter((user) => user.role === 'chief_engineer').length,
      foremen: employees.filter((user) => user.role === 'foreman').length,
    }
  }, [employees])

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <span className="loading loading-spinner text-primary" />
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
      <div className="rounded-[1.75rem] border border-base-200 bg-base-100 p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-4">
            <Link
              to={`/objects/${objectItem.id}`}
              className="inline-flex w-fit items-center gap-1.5 rounded-xl bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 hover:text-slate-950"
            >
              <span aria-hidden="true">←</span>
              К объекту
            </Link>
            <h1 className="break-words text-2xl font-semibold sm:text-3xl">{objectItem.name}</h1>
            <div className="inline-flex flex-wrap items-center gap-3 rounded-2xl border border-base-200 bg-base-200/40 px-4 py-3">
              <div>
                <div className="text-xs uppercase tracking-wide text-base-content/50">Пользователи на объекте</div>
                <div className="mt-0.5 flex items-end gap-2">
                  <span className="text-3xl font-semibold leading-none tabular-nums">{stats.total}</span>
                  <span className="pb-0.5 text-sm text-base-content/60">{formatEmployeeCount(stats.total)}</span>
                </div>
              </div>
              <div className="grid min-w-40 gap-1.5">
                <span className="flex items-center justify-between gap-4 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-800">
                  <span>Инженеры</span>
                  <span className="tabular-nums">{stats.engineers}</span>
                </span>
                <span className="flex items-center justify-between gap-4 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800">
                  <span>Прорабы</span>
                  <span className="tabular-nums">{stats.foremen}</span>
                </span>
              </div>
            </div>
          </div>
          {canManageEmployees && (
            <button
              type="button"
              className="w-full bg-[#ff4539] text-white py-2 px-4 rounded-2xl hover:bg-[#cc372e] focus:outline-none focus:ring-2 focus:ring-[#ff4539] focus:ring-offset-2 transition-colors disabled:bg-[##ff918a] disabled:cursor-not-allowed font-medium cursor-pointer sm:w-auto"
              onClick={openAddUserModal}
            >
              Добавить сотрудника
            </button>
          )}
        </div>
      </div>

      <div>
        <div className="overflow-hidden rounded-[1.75rem] border border-base-200 bg-base-100 shadow-sm">
          <div className="border-b border-base-200 px-6 py-4">
            <h2 className="text-lg font-semibold">Список сотрудников</h2>
          </div>

          {employeeActionError && (
            <div className="mx-4 mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {employeeActionError}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] table-fixed text-left">
              <colgroup>
                <col className="w-[24%]" />
                <col className="w-[14%]" />
                <col className="w-[17%]" />
                <col className="w-[23%]" />
                <col className="w-[22%]" />
              </colgroup>
              <thead className="bg-base-200">
                <tr>
                  <th className="px-5 py-3 align-middle">Сотрудник</th>
                  <th className="px-5 py-3 align-middle">Должность</th>
                  <th className="px-5 py-3 align-middle">Телефон</th>
                  <th className="px-5 py-3 align-middle">Email</th>
                  <th className="px-5 py-3 text-right align-middle">Действия</th>
                </tr>
              </thead>
              <tbody>
                {employees.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-6 text-center text-base-content/70">
                      Сотрудники не найдены.
                    </td>
                  </tr>
                ) : (
                  employees.map((employee) => (
                    <tr key={employee.id} className="border-t border-base-200 align-middle hover:bg-base-100">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          {avatarUrls[employee.id] ? (
                            <span className="size-10 shrink-0 overflow-hidden rounded-full">
                              <img
                                src={avatarUrls[employee.id]}
                                alt={`Фото ${employee.full_name}`}
                                className="size-full object-cover"
                              />
                            </span>
                          ) : (
                            <span
                              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-base-200 text-sm font-semibold text-base-content/70"
                              aria-hidden="true"
                            >
                              {employee.full_name.trim().charAt(0).toUpperCase() || '?'}
                            </span>
                          )}
                          <div className="flex min-w-0 flex-col items-start gap-0.5">
                            <span className="flex items-center gap-1.5 font-medium">
                              <span className="break-words">{employee.full_name}</span>
                              {responsibleUserIds.has(employee.id) && (
                                <svg
                                  viewBox="0 0 24 24"
                                  fill="currentColor"
                                  className="size-4 shrink-0 text-red-500"
                                  aria-label="Ответственный"
                                >
                                  <path d="m3.2 7.4 4.4 3.4L12 4l4.4 6.8 4.4-3.4-1.9 10.2H5.1L3.2 7.4Zm2.3 12h13v1.8h-13v-1.8Z" />
                                </svg>
                              )}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3">{roleLabel[employee.role]}</td>
                      <td className="whitespace-nowrap px-5 py-3 text-base-content/70">{employee.phone_number || '—'}</td>
                      <td className="break-words px-5 py-3 text-base-content/70">{employee.email}</td>
                      <td className="px-5 py-3 text-right">
                        {canManageEmployees && employee.role !== 'admin' && (
                          <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                            {responsibleUserIds.has(employee.id) && (
                              <button
                                type="button"
                                className="btn btn-ghost btn-xs"
                                onClick={() => handleUnsetResponsible(employee.id)}
                                disabled={responsibilityUpdatingUserId !== null}
                              >
                                {responsibilityUpdatingUserId === employee.id
                                  ? 'Снятие...'
                                  : 'Снять ответственность'}
                              </button>
                            )}
                            <button className="btn btn-ghost btn-xs text-error" onClick={() => handleUnassign(employee.id)}>
                              Удалить
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showAddUser && (
        <ModalBackdrop
          onClose={() => {
            setShowAddUser(false)
            setAssignError('')
          }}
        >
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold">Добавить сотрудника на объект</h2>
              <p className="text-sm text-base-content/70">Выберите сотрудника, которого нужно привязать к объекту.</p>
            </div>
            {assignError && <div className="alert alert-error">{assignError}</div>}
            <input
              className="input w-full"
              placeholder="Поиск по имени, email или телефону..."
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
            />
            <div className="max-h-80 overflow-y-auto rounded-[1.75rem] border border-base-200">
              {loadingAssignableUsers ? (
                <div className="flex items-center justify-center px-4 py-8">
                  <span className="loading loading-spinner text-primary" />
                </div>
              ) : availableUsers.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-base-content/70">
                  Нет доступных сотрудников для добавления.
                </div>
              ) : (
                availableUsers.map((user) => (
                  <div key={user.id} className="flex items-center justify-between gap-4 border-b border-base-200 px-4 py-3 last:border-b-0">
                    <div>
                      <div className="font-medium">{user.full_name}</div>
                      <div className="text-sm text-base-content/70">
                        {roleLabel[user.role]} · {user.email}{user.phone_number ? ` · ${user.phone_number}` : ''}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      disabled={assigningUserId === user.id}
                      onClick={() => handleAssign(user.id)}
                    >
                      {assigningUserId === user.id ? 'Добавление...' : 'Добавить'}
                    </button>
                  </div>
                ))
              )}
            </div>
            <div className="flex justify-end">
              <button type="button" className="btn" onClick={() => setShowAddUser(false)}>
                Закрыть
              </button>
            </div>
          </div>
        </ModalBackdrop>
      )}
    </div>
  )
}

export default ObjectEmployeesPage
