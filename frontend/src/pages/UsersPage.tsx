import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { userApi } from '@services/api'
import type { User } from '@/types'

function ModalBackdrop({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl rounded-lg bg-base-100 p-6 shadow-lg">{children}</div>
    </div>
  )
}

function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [formError, setFormError] = useState('')
  const [showCreateUser, setShowCreateUser] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newUser, setNewUser] = useState({ full_name: '', email: '', password: '', role: 'foreman', is_active: true })

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
        setLoadError(err.response?.data?.detail || 'Ошибка загрузки пользователей')
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    fetchUsers()
  }, [])

  const handleChange = (field: string, value: string | boolean) => {
    setNewUser((prev) => ({ ...prev, [field]: value }))
  }

  const handleCreate = async () => {
    // Client-side validation
    if (!newUser.full_name.trim() || !newUser.email.trim() || !newUser.password) {
      setFormError('Пожалуйста, заполните обязательные поля: имя, email и пароль.')
      return
    }

    if (newUser.password.length < 8) {
      setFormError('Пароль должен содержать минимум 8 символов.')
      return
    }

    setCreating(true)
    setFormError('')
    try {
      const payload: any = {
        full_name: newUser.full_name,
        email: newUser.email,
        password: newUser.password,
        role: newUser.role,
        is_active: !!newUser.is_active,
      }

      const created = await userApi.create(payload)
      // Refresh list from server to avoid rendering errors if backend returns partial data
      try {
        const data = await userApi.getAll()
        setUsers(data)
      } catch (err) {
        setUsers((prev) => [created, ...prev])
      }
      setShowCreateUser(false)
      setNewUser({ full_name: '', email: '', password: '', role: 'foreman', is_active: true })
    } catch (err: any) {
      setFormError(err.response?.data?.detail || 'Ошибка создания пользователя')
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
        <h1 className="text-3xl font-semibold">Пользователи</h1>
        <p className="text-base-content/70">Управление пользователями системы</p>
      </div>

      <div className="flex flex-col gap-4 rounded-lg border border-base-200 bg-base-100 p-4 shadow-sm">
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
                placeholder="Поиск по пользователям..."
                className="w-full rounded-lg border border-base-300 bg-white px-10 py-2 text-slate-900 outline-none transition-colors focus:border-primary focus:ring focus:ring-primary/20 placeholder:text-gray-400"
                aria-label="Поиск по пользователям"
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
            <p className="mt-2 text-sm text-base-content/70">Поиск по имени, email или роли.</p>
          </div>
          <div className="flex items-center gap-2">
            {search && <span className="badge badge-outline">Найдено {filteredUsers.length}</span>}
            <button
              type="button"
              className="btn btn-primary btn-sm whitespace-nowrap"
              onClick={() => {
                setFormError('')
                setShowCreateUser(true)
              }}
            >
              Добавить пользователя
            </button>
          </div>
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
      {showCreateUser && (
        <ModalBackdrop
          onClose={() => {
            setShowCreateUser(false)
            setFormError('')
          }}
        >
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Создать пользователя</h2>
            {formError && <div className="alert alert-error">{formError}</div>}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input
                className="input w-full"
                placeholder="Ф.И.О. *"
                value={newUser.full_name}
                onChange={(e) => handleChange('full_name', e.target.value)}
              />
              <input
                className="input w-full"
                placeholder="Email *"
                value={newUser.email}
                onChange={(e) => handleChange('email', e.target.value)}
              />
              <input
                className="input w-full"
                placeholder="Пароль * (минимум 8 символов)"
                type="password"
                value={newUser.password}
                onChange={(e) => handleChange('password', e.target.value)}
              />
              <select className="select w-full" value={newUser.role} onChange={(e) => handleChange('role', e.target.value)}>
                <option value="admin">admin</option>
                <option value="engineer">engineer</option>
                <option value="foreman">foreman</option>
              </select>
              <label className="flex items-center gap-2">
                <input type="checkbox" className="checkbox" checked={!!newUser.is_active} onChange={(e) => handleChange('is_active', e.target.checked)} />
                <span>Активен</span>
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn" onClick={() => setShowCreateUser(false)} disabled={creating}>
                Отмена
              </button>
              <button className="btn btn-primary" onClick={handleCreate} disabled={creating}>
                {creating ? 'Сохранение...' : 'Создать'}
              </button>
            </div>
          </div>
        </ModalBackdrop>
      )}
    </div>
  )
}

export default UsersPage
