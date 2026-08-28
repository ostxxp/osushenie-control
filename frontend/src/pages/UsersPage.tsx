import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from 'react'
import { getStoredAvatarUrl, photoApi, userApi } from '@services/api'
import { StyledSelect } from '@/components'
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl overflow-y-auto rounded-2xl bg-base-100 p-4 shadow-lg sm:rounded-3xl sm:p-6">{children}</div>
    </div>
  )
}

function normalizeErrorMessage(message: string): string {
  const normalized = message.replace(/^value error,\s*/i, '').trim()

  if (/^value is not a valid email address/i.test(normalized)) {
    return 'Введите корректный email в формате name@example.com.'
  }

  const translations: Record<string, string> = {
    'User with this email already exists.': 'Пользователь с таким email уже существует.',
    'Field required': 'Заполните обязательное поле.',
  }

  return translations[normalized] || normalized
}

function getErrorMessage(error: unknown, fallback: string): string {
  const detail = (error as { response?: { data?: { detail?: unknown } }; message?: unknown })?.response?.data?.detail
    ?? (error as { message?: unknown })?.message

  if (typeof detail === 'string') {
    return normalizeErrorMessage(detail)
  }

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object' && 'msg' in item) {
          const maybeMsg = (item as { msg?: unknown }).msg
          return typeof maybeMsg === 'string' ? normalizeErrorMessage(maybeMsg) : JSON.stringify(item)
        }
        return JSON.stringify(item)
      })
      .filter(Boolean)

    if (messages.length > 0) {
      return messages.join('\n')
    }
  }

  if (detail && typeof detail === 'object') {
    return JSON.stringify(detail)
  }

  return fallback
}

function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [avatarUrls, setAvatarUrls] = useState<Record<number, string>>({})
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [userForm, setUserForm] = useState<UserFormState>(emptyUserForm)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState('')
  const [pendingAvatarUserId, setPendingAvatarUserId] = useState<number | null>(null)

  const loadUsers = async () => {
    const data = await userApi.getAll()
    setUsers(data)
  }

  const filteredUsers = useMemo(
    () =>
      users
        .filter((user) => {
          const query = search.toLowerCase()
          return (
            user.full_name.toLowerCase().includes(query) ||
            user.email.toLowerCase().includes(query) ||
            (user.phone_number ?? '').toLowerCase().includes(query) ||
            roleLabel[user.role].toLowerCase().includes(query)
          )
        })
        .sort((first, second) => (
          Number(second.is_active) - Number(first.is_active) || second.id - first.id
        )),
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

  useEffect(() => {
    if (users.length === 0) {
      setAvatarUrls({})
      return
    }

    let cancelled = false
    const createdUrls: string[] = []
    setAvatarUrls(Object.fromEntries(
      users.map((user) => [user.id, getStoredAvatarUrl(user.id)]).filter(([, url]) => Boolean(url)),
    ))

    const loadAvatars = async () => {
      const entries = await Promise.all(
        users.map(async (user): Promise<[number, string] | null> => {
          try {
            const storedUrl = getStoredAvatarUrl(user.id)
            if (storedUrl) return [user.id, storedUrl]
            const avatar = await photoApi.getUserAvatar(user.id)
            if (!avatar) return null

            const url = URL.createObjectURL(avatar)
            if (cancelled) {
              URL.revokeObjectURL(url)
              return null
            }

            createdUrls.push(url)
            return [user.id, url]
          } catch (error) {
            console.warn(`Не удалось загрузить фото пользователя ${user.id}`, error)
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
  }, [users])

  const openCreateModal = () => {
    setEditingUser(null)
    setUserForm(emptyUserForm)
    setAvatarFile(null)
    setAvatarPreviewUrl('')
    setPendingAvatarUserId(null)
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
    if (avatarPreviewUrl) {
      URL.revokeObjectURL(avatarPreviewUrl)
    }
    setModalMode(null)
    setEditingUser(null)
    setUserForm(emptyUserForm)
    setAvatarFile(null)
    setAvatarPreviewUrl('')
    setPendingAvatarUserId(null)
    setFormError('')
  }

  const handleAvatarChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null

    if (file && !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setFormError('Выберите изображение в формате JPG, PNG или WebP.')
      event.target.value = ''
      return
    }

    if (file && file.size > 5 * 1024 * 1024) {
      setFormError('Размер аватара не должен превышать 5 МБ.')
      event.target.value = ''
      return
    }

    if (avatarPreviewUrl) {
      URL.revokeObjectURL(avatarPreviewUrl)
    }

    setFormError('')
    setAvatarFile(file)
    setAvatarPreviewUrl(file ? URL.createObjectURL(file) : '')
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

    const phoneNumber = userForm.phone_number.trim()
    if (phoneNumber && (phoneNumber.match(/\d/g)?.length ?? 0) !== 11) {
      return 'Номер телефона должен содержать ровно 11 цифр.'
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

    let uploadingAvatar = false

    try {
      if (modalMode === 'create') {
        let userId = pendingAvatarUserId

        if (userId === null) {
          const createdUser = await userApi.create({
            ...basePayload,
            password: userForm.password,
          })
          userId = createdUser.id
        }

        if (avatarFile) {
          setPendingAvatarUserId(userId)
          uploadingAvatar = true
          await photoApi.uploadUserAvatar(userId, avatarFile)
          setPendingAvatarUserId(null)
        }
      } else if (modalMode === 'edit' && editingUser) {
        await userApi.update(editingUser.id, {
          ...basePayload,
          ...(userForm.password ? { password: userForm.password } : {}),
        })
      }

      await loadUsers()
      closeModal()
    } catch (err: unknown) {
      if (uploadingAvatar) {
        await loadUsers()
      }
      setFormError(getErrorMessage(
        err,
        uploadingAvatar
          ? 'Пользователь создан, но не удалось загрузить аватар. Попробуйте сохранить ещё раз.'
          : modalMode === 'create'
            ? 'Ошибка создания пользователя'
            : 'Ошибка обновления пользователя',
      ))
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <span className="loading loading-spinner text-[#ff4539]"></span>
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
    <div className="space-y-4">
      <div className="flex flex-col gap-4 rounded-2xl border border-base-200 bg-base-100 p-3 shadow-sm sm:p-4">
        <div className="px-4 lg:px-3 2xl:px-5">
          <h1 className="text-2xl font-semibold sm:text-3xl">Пользователи</h1>
        </div>

        <div className="flex flex-col gap-3 px-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-start lg:px-3 2xl:px-5">
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
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-start">
            {search && (
              <span className="badge badge-outline h-auto shrink-0 whitespace-nowrap px-3 py-2">
                Найдено {filteredUsers.length}
              </span>
            )}
            <button
              type="button"
              className="w-full whitespace-nowrap bg-[#ff4539] text-white py-2 px-4 rounded-2xl hover:bg-[#cc372e] focus:outline-none focus:ring-2 focus:ring-[#ff4539] focus:ring-offset-2 transition-colors disabled:bg-[##ff918a] disabled:cursor-not-allowed font-medium cursor-pointer sm:w-auto"
              onClick={openCreateModal}
            >
              Добавить пользователя
            </button>
          </div>
        </div>

        <div className="space-y-3 lg:hidden">
          {filteredUsers.map((user) => (
            <article key={user.id} className="rounded-2xl border border-base-200 bg-base-100 p-4 shadow-sm">
              <div className="flex items-start gap-3">
                {avatarUrls[user.id] ? (
                  <span className="h-12 w-12 shrink-0 overflow-hidden rounded-full">
                    <img src={avatarUrls[user.id]} alt={`Фото ${user.full_name}`} className="h-full w-full object-cover" />
                  </span>
                ) : (
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-base-200 font-semibold text-base-content/70" aria-hidden="true">
                    {user.full_name.trim().charAt(0).toUpperCase() || '?'}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="break-words font-semibold text-slate-900">{user.full_name}</div>
                  <div className="mt-1 text-sm text-base-content/60">{roleLabel[user.role]}</div>
                </div>
                <span className={`badge h-auto shrink-0 border px-2 py-1 text-xs ${user.is_active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'badge-ghost'}`}>
                  {user.is_active ? 'Работает' : 'Не активен'}
                </span>
              </div>

              <dl className="mt-4 grid gap-3 border-t border-base-200 pt-4 text-sm">
                <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-3">
                  <dt className="text-base-content/55">Телефон</dt>
                  <dd className="whitespace-nowrap font-medium text-slate-800">{user.phone_number || '—'}</dd>
                </div>
                <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-3">
                  <dt className="text-base-content/55">Email</dt>
                  <dd className="min-w-0 break-all font-medium text-slate-800">{user.email}</dd>
                </div>
              </dl>

              <button type="button" className="btn btn-ghost mt-4 w-full border border-base-200" onClick={() => openEditModal(user)}>
                Редактировать
              </button>
            </article>
          ))}
          {filteredUsers.length === 0 && (
            <div className="rounded-2xl border border-dashed border-base-300 px-4 py-8 text-center text-sm text-base-content/70">
              Пользователей не найдено.
            </div>
          )}
        </div>

        <div className="hidden overflow-hidden rounded-[1.75rem] border border-base-200 bg-base-100 lg:block">
          <table className="w-full table-fixed text-left">
            <colgroup>
              <col className="w-[20%]" />
              <col className="w-[16%]" />
              <col className="w-[16%]" />
              <col className="w-[18%]" />
              <col className="w-[13%]" />
              <col className="w-[17%]" />
            </colgroup>
            <thead className="bg-base-200">
              <tr>
                <th className="px-3 py-3 2xl:px-5">Имя</th>
                <th className="whitespace-nowrap px-3 py-3 2xl:px-5">Должность</th>
                <th className="whitespace-nowrap px-3 py-3 2xl:px-5">Телефон</th>
                <th className="px-3 py-3 2xl:px-5">Email</th>
                <th className="px-3 py-3 2xl:px-5">Статус</th>
                <th className="px-3 py-3 text-right 2xl:px-5">Действие</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.id} className="border-t border-base-200 align-middle hover:bg-base-200">
                  <td className="px-3 py-3 2xl:px-5">
                    <div className="flex items-center gap-3">
                      {avatarUrls[user.id] ? (
                        <span
                          className="shrink-0 overflow-hidden rounded-full"
                          style={{ width: 40, height: 40, minWidth: 40, maxWidth: 40 }}
                        >
                          <img
                            src={avatarUrls[user.id]}
                            alt={`Фото ${user.full_name}`}
                            className="block object-cover"
                            style={{ width: '100%', height: '100%', maxWidth: '100%', maxHeight: '100%' }}
                          />
                        </span>
                      ) : (
                        <span
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-base-200 text-sm font-semibold text-base-content/70"
                          aria-hidden="true"
                        >
                          {user.full_name.trim().charAt(0).toUpperCase() || '?'}
                        </span>
                      )}
                      <span className="min-w-0 break-words">{user.full_name}</span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-sm 2xl:px-5">{roleLabel[user.role]}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-sm 2xl:px-5">{user.phone_number || '—'}</td>
                  <td className="break-words px-3 py-3 2xl:px-5">{user.email}</td>
                  <td className="px-3 py-3 2xl:px-5">
                    {user.is_active ? (
                      <span className="badge border border-emerald-200 bg-emerald-50 text-emerald-700">Работает</span>
                    ) : (
                      <span className="text-sm text-base-content/70">Не активен</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right 2xl:px-5">
                    <button type="button" className="btn btn-ghost btn-xs" onClick={() => openEditModal(user)}>
                      Редактировать
                    </button>
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-base-content/70 2xl:px-5">
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
            {formError && (
              <div role="alert" className="flex gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-800">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-100 font-bold" aria-hidden="true">!</span>
                <div className="min-w-0">
                  <div className="font-semibold">Не удалось сохранить пользователя</div>
                  <div className="mt-1 whitespace-pre-line text-sm text-red-700">{formError}</div>
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium">Ф.И.О. *</span>
                <input
                  className="input w-full focus:border-[#ff4539] focus:outline-none"
                  placeholder="Иванов Иван Иванович"
                  value={userForm.full_name}
                  onChange={(e) => handleChange('full_name', e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium">Email *</span>
                <input
                  className="input w-full focus:border-[#ff4539] focus:outline-none"
                  placeholder="user@example.com"
                  value={userForm.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium">Телефон</span>
                <input
                  className="input w-full focus:border-[#ff4539] focus:outline-none"
                  placeholder="+7 999 123-45-67"
                  inputMode="tel"
                  value={userForm.phone_number}
                  onChange={(e) => handleChange('phone_number', e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium">
                  {modalMode === 'create' ? 'Пароль *' : 'Новый пароль'}
                </span>
                <input
                  className="input w-full focus:border-[#ff4539] focus:outline-none"
                  placeholder={modalMode === 'create' ? 'Минимум 8 символов' : 'Оставьте пустым, если не меняете'}
                  type="password"
                  value={userForm.password}
                  onChange={(e) => handleChange('password', e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium">Должность</span>
                <StyledSelect
                  className="w-full"
                  value={userForm.role}
                  onChange={(value) => handleChange('role', value as UserRole)}
                  options={[{ value: 'chief_engineer', label: 'Инженер' }, { value: 'foreman', label: 'Прораб' }]}
                />
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium">Статус</span>
                <span className="flex items-center gap-2 rounded-lg border border-base-200 px-3 py-2">
                <input
                  type="checkbox"
                  className="checkbox checkbox-error focus:outline-none focus:ring-2 focus:ring-[#ff4539]/20"
                  checked={userForm.is_active}
                  onChange={(e) => handleChange('is_active', e.target.checked)}
                />
                <span>Работает</span>
                </span>
              </label>
              {modalMode === 'create' && (
                <label className="flex flex-col gap-2 sm:col-span-2">
                  <span className="text-sm font-medium">Аватар</span>
                  <div className="flex flex-col gap-3 rounded-2xl border border-base-200 p-3 sm:flex-row sm:items-center">
                    {avatarPreviewUrl ? (
                      <span
                        className="shrink-0 overflow-hidden rounded-full"
                        style={{ width: 64, height: 64, minWidth: 64, maxWidth: 64 }}
                      >
                        <img
                          src={avatarPreviewUrl}
                          alt="Предпросмотр аватара"
                          className="block object-cover"
                          style={{ width: '100%', height: '100%', maxWidth: '100%', maxHeight: '100%' }}
                        />
                      </span>
                    ) : (
                      <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-base-200 text-xl font-semibold text-base-content/60">
                        {userForm.full_name.trim().charAt(0).toUpperCase() || '?'}
                      </span>
                    )}
                    <div className="flex-1">
                      <input
                        type="file"
                        className="file-input w-full focus:border-[#ff4539] focus:outline-none"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={handleAvatarChange}
                      />
                      <p className="mt-1 text-xs text-base-content/60">
                        JPG, PNG или WebP, не более 5 МБ.
                      </p>
                    </div>
                  </div>
                </label>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn" onClick={closeModal} disabled={saving}>
                Отмена
              </button>
              <button
                type="button"
                className="bg-[#ff4539] text-white py-2 px-4 rounded-2xl hover:bg-[#cc372e] focus:outline-none focus:ring-2 focus:ring-[#ff4539] focus:ring-offset-2 transition-colors disabled:bg-[##ff918a] disabled:cursor-not-allowed font-medium cursor-pointer"
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
