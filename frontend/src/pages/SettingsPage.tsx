import { useEffect, useState, type ChangeEvent } from 'react'
import { getStoredAvatarUrl, photoApi, userApi } from '@services/api'
import { authService } from '@services/auth'
import { formatApiError } from '@/utils'

const allowedAvatarTypes = ['image/jpeg', 'image/png', 'image/webp']
const maxAvatarSize = 5 * 1024 * 1024

function SettingsPage() {
  const currentUser = authService.getCurrentUser()
  const [avatarUrl, setAvatarUrl] = useState(() => currentUser ? getStoredAvatarUrl(currentUser.id) : '')
  const [avatarVersion, setAvatarVersion] = useState(0)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState('')
  const [avatarLoading, setAvatarLoading] = useState(() => !avatarUrl)
  const [avatarSaving, setAvatarSaving] = useState(false)
  const [avatarError, setAvatarError] = useState('')
  const [avatarSuccess, setAvatarSuccess] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState('')

  useEffect(() => {
    if (!currentUser) {
      setAvatarLoading(false)
      return
    }

    let cancelled = false
    let objectUrl = ''

    const loadAvatar = async () => {
      const storedAvatar = getStoredAvatarUrl(currentUser.id)
      if (storedAvatar) {
        setAvatarUrl(storedAvatar)
        setAvatarLoading(false)
        return
      }
      setAvatarLoading(true)
      try {
        const avatar = await photoApi.getUserAvatar(currentUser.id)
        if (!avatar || cancelled) return

        objectUrl = URL.createObjectURL(avatar)
        setAvatarUrl(objectUrl)
      } catch (error) {
        if (!cancelled) {
          setAvatarError(formatApiError(error, 'Не удалось загрузить аватар'))
        }
      } finally {
        if (!cancelled) setAvatarLoading(false)
      }
    }

    const storedAvatar = getStoredAvatarUrl(currentUser.id)
    setAvatarUrl(storedAvatar)
    setAvatarLoading(!storedAvatar)
    loadAvatar()

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [avatarVersion, currentUser?.id])

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreviewUrl('')
      return
    }

    const objectUrl = URL.createObjectURL(avatarFile)
    setAvatarPreviewUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [avatarFile])

  const handleAvatarChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null
    setAvatarError('')
    setAvatarSuccess('')

    if (file && !allowedAvatarTypes.includes(file.type)) {
      setAvatarError('Выберите изображение в формате JPG, PNG или WebP.')
      event.target.value = ''
      return
    }

    if (file && file.size > maxAvatarSize) {
      setAvatarError('Размер аватара не должен превышать 5 МБ.')
      event.target.value = ''
      return
    }

    setAvatarFile(file)
  }

  const saveAvatar = async () => {
    if (!avatarFile) return

    setAvatarSaving(true)
    setAvatarError('')
    setAvatarSuccess('')
    try {
      await photoApi.uploadCurrentAvatar(avatarFile)
      setAvatarFile(null)
      setAvatarVersion((version) => version + 1)
      setAvatarSuccess('Аватар обновлён.')
    } catch (error) {
      setAvatarError(formatApiError(error, 'Не удалось обновить аватар'))
    } finally {
      setAvatarSaving(false)
    }
  }

  const deleteAvatar = async () => {
    setAvatarSaving(true)
    setAvatarError('')
    setAvatarSuccess('')
    try {
      await photoApi.deleteCurrentAvatar()
      setAvatarFile(null)
      setAvatarVersion((version) => version + 1)
      setAvatarSuccess('Аватар удалён.')
    } catch (error) {
      setAvatarError(formatApiError(error, 'Не удалось удалить аватар'))
    } finally {
      setAvatarSaving(false)
    }
  }

  const changePassword = async () => {
    setPasswordError('')
    setPasswordSuccess('')

    if (!currentUser) {
      setPasswordError('Не удалось определить текущего пользователя.')
      return
    }
    if (newPassword.length < 8) {
      setPasswordError('Пароль должен содержать минимум 8 символов.')
      return
    }
    if (newPassword !== passwordConfirmation) {
      setPasswordError('Пароли не совпадают.')
      return
    }

    setPasswordSaving(true)
    try {
      await userApi.update(currentUser.id, { password: newPassword })
      setNewPassword('')
      setPasswordConfirmation('')
      setPasswordSuccess('Пароль изменён.')
    } catch (error) {
      setPasswordError(formatApiError(error, 'Не удалось изменить пароль'))
    } finally {
      setPasswordSaving(false)
    }
  }

  const displayedAvatar = avatarPreviewUrl || avatarUrl

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold sm:text-3xl">Настройки</h1>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-[2rem] border border-base-200 bg-base-100 p-4 shadow-sm sm:p-6">
          <h2 className="text-xl font-semibold">Аватар</h2>
          <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-center">
            {avatarLoading ? (
              <span className="loading loading-spinner h-24 w-24 text-primary" />
            ) : displayedAvatar ? (
              <div
                className="shrink-0 overflow-hidden rounded-full"
                style={{ width: 96, height: 96, minWidth: 96, maxWidth: 96 }}
              >
                <img
                  src={displayedAvatar}
                  alt="Аватар пользователя"
                  className="block object-cover"
                  style={{ width: '100%', height: '100%', maxWidth: '100%', maxHeight: '100%' }}
                />
              </div>
            ) : (
              <span className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-base-200 text-3xl font-semibold text-base-content/60">
                {currentUser?.full_name.trim().charAt(0).toUpperCase() || '?'}
              </span>
            )}

            <div className="flex-1 space-y-3">
              <input
                type="file"
                className="file-input w-full focus:border-[#ff4539] focus:outline-none"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleAvatarChange}
                disabled={avatarSaving}
              />
              <p className="text-xs text-base-content/60">JPG, PNG или WebP, не более 5 МБ.</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-2xl bg-[#ff4539] px-4 py-2 font-medium text-white transition hover:bg-[#cc372e] disabled:cursor-not-allowed disabled:bg-[#ff918a]"
                  onClick={saveAvatar}
                  disabled={!avatarFile || avatarSaving}
                >
                  {avatarSaving ? 'Сохранение...' : 'Сохранить аватар'}
                </button>
                {(avatarUrl || avatarFile) && (
                  <button
                    type="button"
                    className="rounded-2xl border border-base-300 px-4 py-2 font-medium transition hover:bg-base-200 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={avatarFile ? () => setAvatarFile(null) : deleteAvatar}
                    disabled={avatarSaving}
                  >
                    {avatarFile ? 'Отменить выбор' : 'Удалить аватар'}
                  </button>
                )}
              </div>
            </div>
          </div>
          {avatarError && <div className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{avatarError}</div>}
          {avatarSuccess && <div className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{avatarSuccess}</div>}
        </section>

        <section className="rounded-[2rem] border border-base-200 bg-base-100 p-4 shadow-sm sm:p-6">
          <h2 className="text-xl font-semibold">Смена пароля</h2>
          <div className="mt-5 space-y-4">
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium">Новый пароль</span>
              <input
                type="password"
                className="input w-full focus:border-[#ff4539] focus:outline-none"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="Минимум 8 символов"
                autoComplete="new-password"
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium">Повторите новый пароль</span>
              <input
                type="password"
                className="input w-full focus:border-[#ff4539] focus:outline-none"
                value={passwordConfirmation}
                onChange={(event) => setPasswordConfirmation(event.target.value)}
                placeholder="Введите пароль ещё раз"
                autoComplete="new-password"
              />
            </label>
            <button
              type="button"
              className="rounded-2xl bg-[#ff4539] px-4 py-2 font-medium text-white transition hover:bg-[#cc372e] disabled:cursor-not-allowed disabled:bg-[#ff918a]"
              onClick={changePassword}
              disabled={passwordSaving || !newPassword || !passwordConfirmation}
            >
              {passwordSaving ? 'Сохранение...' : 'Изменить пароль'}
            </button>
          </div>
          {passwordError && <div className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{passwordError}</div>}
          {passwordSuccess && <div className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{passwordSuccess}</div>}
        </section>
      </div>
    </div>
  )
}

export default SettingsPage
