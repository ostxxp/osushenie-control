import { useContext, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { objectApi } from '@services/api'
import { AuthContext } from '@services/auth'
import type { ConstructionObject, User, UserRole } from '@/types'

const roleLabel: Record<UserRole, string> = {
  admin: 'Администратор',
  engineer: 'Инженер',
  chief_engineer: 'Инженер',
  foreman: 'Прораб',
}

function ObjectEmployeesPage() {
  const { id } = useParams<{ id: string }>()
  const [objectItem, setObjectItem] = useState<ConstructionObject | null>(null)
  const [employees, setEmployees] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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
      } catch (err: any) {
        setError(err.response?.data?.detail || 'Ошибка загрузки сотрудников')
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [id])

  const authContext = useContext(AuthContext)
  const userRole = authContext?.userRole

  const refresh = async () => {
    if (!id) return
    try {
      const usersData = await objectApi.getAssignedUsers(Number(id))
      setEmployees(usersData)
    } catch (err) {
      console.error(err)
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
      engineers: employees.filter((user) => user.role === 'engineer' || user.role === 'chief_engineer').length,
      foremen: employees.filter((user) => user.role === 'foreman').length,
      admins: employees.filter((user) => user.role === 'admin').length,
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
        <div className="flex flex-col items-start gap-2">
          <Link to={`/objects/${objectItem.id}`} className="btn btn-ghost btn-xs text-sm px-2">
            ← К объекту
          </Link>
          <h1 className="text-3xl font-semibold mt-1">{objectItem.name}</h1>
          <p className="text-base-content/70">Сотрудники на объекте</p>
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
                  <th className="px-4 py-3">Email</th>
                </tr>
              </thead>
              <tbody>
                {employees.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-base-content/70">
                      Сотрудники не найдены.
                    </td>
                  </tr>
                ) : (
                  employees.map((employee) => (
                    <tr key={employee.id} className="border-t border-base-200 hover:bg-base-100">
                      <td className="px-4 py-3 font-medium">{employee.full_name}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span>{roleLabel[employee.role]}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-base-content/70">{employee.email}</td>
                      <td className="px-4 py-3 text-right">
                        {(userRole === 'admin' || userRole === 'chief_engineer') && (
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
    </div>
  )
}

export default ObjectEmployeesPage