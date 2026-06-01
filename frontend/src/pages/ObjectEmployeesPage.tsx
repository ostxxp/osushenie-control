import { useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { objectApi, userApi } from '@services/api'
import { AuthContext } from '@services/auth'
import type { ConstructionObject, User, UserRole } from '@/types'

const roleLabel: Record<UserRole, string> = {
  admin: 'Администратор',
  chief_engineer: 'Инженер',
  foreman: 'Прораб',
}

function ModalBackdrop({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl rounded-lg bg-base-100 p-6 shadow-lg">{children}</div>
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
  const [assignableUsers, setAssignableUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingAssignableUsers, setLoadingAssignableUsers] = useState(false)
  const [assigningUserId, setAssigningUserId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [assignError, setAssignError] = useState('')
  const [showAddUser, setShowAddUser] = useState(false)
  const [userSearch, setUserSearch] = useState('')

  const loadEmployees = async () => {
    if (!id) return

    const usersData = await objectApi.getAssignedUsers(Number(id))
    setEmployees(usersData)
  }

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return

      try {
        const [objectData, usersData] = await Promise.all([
          objectApi.getById(Number(id)),
          objectApi.getAssignedUsers(Number(id)),
        ])
        setObjectItem(objectData)
        setEmployees(usersData)
      } catch (err: unknown) {
        setError(getErrorMessage(err, 'Ошибка загрузки сотрудников'))
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [id])

  const assignedUserIds = useMemo(
    () => new Set(employees.map((employee) => employee.id)),
    [employees],
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
    if (!id) return
    try {
      await objectApi.unassignResponsibleFromObject(Number(id), userId)
      await refresh()
    } catch (err) {
      console.error('Ошибка при снятии ответственности', err)
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
      <div className="space-y-2">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex flex-col items-start gap-2">
            <Link to={`/objects/${objectItem.id}`} className="btn btn-ghost btn-xs text-sm px-2">
              ← К объекту
            </Link>
            <h1 className="text-3xl font-semibold mt-1">{objectItem.name}</h1>
            <p className="text-base-content/70">Сотрудники на объекте</p>
          </div>
          {canManageEmployees && (
            <button
              type="button"
              className="bg-[#ff4539] text-white py-2 px-4 rounded-lg hover:bg-[#cc372e] focus:outline-none focus:ring-2 focus:ring-[#ff4539] focus:ring-offset-2 transition-colors disabled:bg-[##ff918a] disabled:cursor-not-allowed font-medium cursor-pointer"
              onClick={openAddUserModal}
            >
              Добавить сотрудника
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
        <div className="rounded-lg border border-base-200 bg-base-100 p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">Сводка</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-base-content/70">Всего сотрудников</span>
              <span className="font-semibold">{stats.total}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-base-content/70">Инженеры</span>
              <span className="font-semibold">{stats.engineers}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-base-content/70">Прорабы</span>
              <span className="font-semibold">{stats.foremen}</span>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-base-200 bg-base-100 shadow-sm overflow-hidden">
          <div className="border-b border-base-200 px-6 py-4">
            <h2 className="text-lg font-semibold">Список сотрудников</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-base-200">
                <tr>
                  <th className="px-4 py-3">Сотрудник</th>
                  <th className="px-4 py-3">Должность</th>
                  <th className="px-4 py-3">Телефон</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3 text-right">Действия</th>
                </tr>
              </thead>
              <tbody>
                {employees.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-base-content/70">
                      Сотрудники не найдены.
                    </td>
                  </tr>
                ) : (
                  employees.map((employee) => (
                    <tr key={employee.id} className="border-t border-base-200 hover:bg-base-100">
                      <td className="px-4 py-3 font-medium">{employee.full_name}</td>
                      <td className="px-4 py-3">{roleLabel[employee.role]}</td>
                      <td className="px-4 py-3 text-base-content/70">{employee.phone_number || '—'}</td>
                      <td className="px-4 py-3 text-base-content/70">{employee.email}</td>
                      <td className="px-4 py-3 text-right">
                        {canManageEmployees && employee.role !== 'admin' && (
                          <div className="flex items-center justify-end gap-2">
                            <button className="btn btn-ghost btn-xs" onClick={() => handleUnsetResponsible(employee.id)}>
                              Снять ответственность
                            </button>
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
            <div className="max-h-80 overflow-y-auto rounded-lg border border-base-200">
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
