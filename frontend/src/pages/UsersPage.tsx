import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { userApi } from '@services/api'
import type { User, UserRole } from '@/types'

type UserFormState = {
  full_name: string
  email: string
  phone_number: string
  password: string
  role: UserRole
  is_active: boolean
}

const emptyUserForm: UserFormState = {
  full_name: '',
  email: '',
  phone_number: '',
  password: '',
  role: 'foreman',
  is_active: true,
}

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

  if (typeof detail === 'string') {
    return detail
  }

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object' && 'msg' in item) {
          const maybeMsg = (item as { msg?: unknown }).msg
          return typeof maybeMsg === 'string' ? maybeMsg : JSON.stringify(item)
        }
        return JSON.stringify(item)
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

function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [userForm, setUserForm] = useState<UserFormState>(emptyUserForm)

  const loadUsers = async () => {
    const data = await userApi.getAll()
    setUsers(data)
  }

  const filteredUsers = useMemo(
    () =>
      users.filter((user) => {
        const query = search.toLowerCase()
        return (
          user.full_name.toLowerCase().includes(query) ||
          user.email.toLowerCase().includes(query) ||
          (user.phone_number ?? '').toLowerCase().includes(query) ||
          roleLabel[user.role].toLowerCase().includes(query)
        )
      }),
    [search, users],
  )

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        await loadUsers()
      } catch (err: unknown) {
        setLoadError(getErrorMessage(err, 'Ошибка загрузки пользователей'))
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    fetchUsers()
  }, [])

  const openCreateModal = () => {
    setEditingUser(null)
    setUserForm(emptyUserForm)
    setFormError('')
    setModalMode('create')
  }

  const openEditModal = (user: User) => {
    setEditingUser(user)
    setUserForm({
      full_name: user.full_name,
      email: user.email,
      phone_number: user.phone_number ?? '',
      password: '',
      role: user.role,
      is_active: user.is_active,
    })
    setFormError('')
    setModalMode('edit')
  }

  const closeModal = () => {
    setModalMode(null)
    setEditingUser(null)
    setUserForm(emptyUserForm)
    setFormError('')
  }

  const handleChange = (field: keyof UserFormState, value: string | boolean) => {
    setUserForm((prev) => ({ ...prev, [field]: value }))
  }

  const validateForm = () => {
    if (!userForm.full_name.trim() || !userForm.email.trim()) {
      return 'Пожалуйста, заполните обязательные поля: имя и email.'
    }

    if (modalMode === 'create' && !userForm.password) {
      return 'Пожалуйста, укажите пароль.'
    }

    if (userForm.password && userForm.password.length < 8) {
      return 'Пароль должен содержать минимум 8 символов.'
    }

    return ''
  }

  const handleSubmit = async () => {
    const validationError = validateForm()
    if (validationError) {
      setFormError(validationError)
      return
    }

    setSaving(true)
    setFormError('')

    const basePayload = {
      full_name: userForm.full_name.trim(),
      email: userForm.email.trim(),
      phone_number: userForm.phone_number.trim() || null,
      role: userForm.role,
      is_active: userForm.is_active,
    }

    try {
      if (modalMode === 'create') {
        await userApi.create({
          ...basePayload,
          password: userForm.password,
        })
      } else if (modalMode === 'edit' && editingUser) {
        await userApi.update(editingUser.id, {
          ...basePayload,
          ...(userForm.password ? { password: userForm.password } : {}),
        })
      }

      await loadUsers()
      closeModal()
    } catch (err: unknown) {
      setFormError(getErrorMessage(err, modalMode === 'create' ? 'Ошибка создания пользователя' : 'Ошибка обновления пользователя'))
      console.error(err)
    } finally {
      setSaving(false)
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
            <p className="mt-2 text-sm text-base-content/70">Поиск по имени, должности, телефону или email.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            {search && (
              <span className="badge badge-outline h-auto shrink-0 whitespace-nowrap px-3 py-2">
                Найдено {filteredUsers.length}
              </span>
            )}
            <button
              type="button"
              className="w-full whitespace-nowrap bg-[#ff4539] text-white py-2 px-4 rounded-lg hover:bg-[#cc372e] focus:outline-none focus:ring-2 focus:ring-[#ff4539] focus:ring-offset-2 transition-colors disabled:bg-[##ff918a] disabled:cursor-not-allowed font-medium cursor-pointer sm:w-auto"
              onClick={openCreateModal}
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
                <th className="px-4 py-3">Должность</th>
                <th className="px-4 py-3">Телефон</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Статус</th>
                <th className="px-4 py-3 text-right">Действия</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.id} className="border-t border-base-200 hover:bg-base-200">
                  <td className="px-4 py-3">{user.full_name}</td>
                  <td className="px-4 py-3">{roleLabel[user.role]}</td>
                  <td className="px-4 py-3">{user.phone_number || '—'}</td>
                  <td className="px-4 py-3">{user.email}</td>
                  <td className="px-4 py-3">
                    <span className={`badge ${user.is_active ? 'badge-success' : 'badge-ghost'}`}>
                      {user.is_active ? 'Работает' : 'Уволен'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button type="button" className="btn btn-ghost btn-xs" onClick={() => openEditModal(user)}>
                      Редактировать
                    </button>
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-base-content/70">
                    Пользователей не найдено.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalMode && (
        <ModalBackdrop onClose={closeModal}>
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">
              {modalMode === 'create' ? 'Создать пользователя' : 'Редактировать пользователя'}
            </h2>
            {formError && <div className="alert alert-error">{formError}</div>}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input
                className="input w-full"
                placeholder="Ф.И.О. *"
                value={userForm.full_name}
                onChange={(e) => handleChange('full_name', e.target.value)}
              />
              <input
                className="input w-full"
                placeholder="Email *"
                value={userForm.email}
                onChange={(e) => handleChange('email', e.target.value)}
              />
              <input
                className="input w-full"
                placeholder="Телефон"
                value={userForm.phone_number}
                onChange={(e) => handleChange('phone_number', e.target.value)}
              />
              <input
                className="input w-full"
                placeholder={modalMode === 'create' ? 'Пароль * (минимум 8 символов)' : 'Новый пароль, если нужно'}
                type="password"
                value={userForm.password}
                onChange={(e) => handleChange('password', e.target.value)}
              />
              <select
                className="select w-full"
                value={userForm.role}
                onChange={(e) => handleChange('role', e.target.value as UserRole)}
              >
                <option value="admin">Администратор</option>
                <option value="chief_engineer">Инженер</option>
                <option value="foreman">Прораб</option>
              </select>
              <label className="flex items-center gap-2 rounded-lg border border-base-200 px-3 py-2">
                <input
                  type="checkbox"
                  className="checkbox checkbox-primary"
                  checked={userForm.is_active}
                  onChange={(e) => handleChange('is_active', e.target.checked)}
                />
                <span>Работает</span>
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn" onClick={closeModal} disabled={saving}>
                Отмена
              </button>
              <button
                type="button"
                className="bg-[#ff4539] text-white py-2 px-4 rounded-lg hover:bg-[#cc372e] focus:outline-none focus:ring-2 focus:ring-[#ff4539] focus:ring-offset-2 transition-colors disabled:bg-[##ff918a] disabled:cursor-not-allowed font-medium cursor-pointer"
                onClick={handleSubmit}
                disabled={saving}
              >
                {saving ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </div>
        </ModalBackdrop>
      )}
    </div>
  )
}

export default UsersPage
