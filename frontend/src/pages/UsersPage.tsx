import { useEffect, useMemo, useState } from 'react'
import { userApi } from '@services/api'
import type { User } from '@/types'

function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const filteredUsers = useMemo(
    () =>
      users.filter((user) => {
        const query = search.toLowerCase()
        return (
          user.full_name.toLowerCase().includes(query) ||
          user.email.toLowerCase().includes(query) ||
          user.role.toLowerCase().includes(query)
        )
      }),
    [search, users],
  )

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const data = await userApi.getAll()
        setUsers(data)
      } catch (err: any) {
        setError(err.response?.data?.detail || 'Ошибка загрузки пользователей')
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    fetchUsers()
  }, [])

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

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold">Пользователи</h1>
        <p className="text-base-content/70">Управление пользователями системы</p>
      </div>

      <div className="flex flex-col gap-4 rounded-lg border border-base-200 bg-base-100 p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex-none w-full max-w-sm">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по пользователям..."
              className="w-full rounded-lg border border-base-300 bg-white px-4 py-2 outline-none transition-colors focus:border-primary focus:ring focus:ring-primary/20 placeholder-gray-400"
            />
          </div>
          <button
            type="button"
            className="btn btn-primary btn-sm whitespace-nowrap"
            onClick={() => {
              // TODO: Добавить действие для создания пользователя
            }}
          >
            Добавить пользователя
          </button>
        </div>

        <div className="overflow-x-auto rounded-lg border border-base-200 bg-base-100">
          <table className="min-w-full text-left">
            <thead className="bg-base-200">
              <tr>
                <th className="px-4 py-3">Имя</th>
                <th className="px-4 py-3">Роль</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Статус</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.id} className="border-t border-base-200 hover:bg-base-200">
                  <td className="px-4 py-3">{user.full_name}</td>
                  <td className="px-4 py-3 capitalize">{user.role}</td>
                  <td className="px-4 py-3">{user.email}</td>
                  <td className="px-4 py-3">{user.is_active ? 'Активен' : 'Заблокирован'}</td>
                </tr>
              ))}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-base-content/70">
                    Пользователей не найдено.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default UsersPage
