import { useEffect, useState } from 'react'
import { getStoredAvatarUrl, photoApi } from '@services/api'
import type { User, UserRole } from '@/types'

type ResponsibleBadgeProps = {
  user?: User
}

const roleLabels: Record<UserRole, string> = {
  admin: 'Администратор',
  chief_engineer: 'Главный инженер',
  foreman: 'Прораб',
}

export default function ResponsibleBadge({ user }: ResponsibleBadgeProps) {
  const [avatarUrl, setAvatarUrl] = useState(() => (user ? getStoredAvatarUrl(user.id) : ''))

  useEffect(() => {
    if (!user) return
    const cachedUrl = getStoredAvatarUrl(user.id)
    if (cachedUrl) {
      setAvatarUrl(cachedUrl)
      return
    }

    let cancelled = false
    let objectUrl = ''
    photoApi.getUserAvatar(user.id).then((avatar) => {
      if (!avatar || cancelled) return
      objectUrl = URL.createObjectURL(avatar)
      setAvatarUrl(objectUrl)
    }).catch(() => undefined)

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [user])

  if (!user) return <span className="text-sm text-base-content/50">Не назначен</span>

  const initials = user.full_name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div className="flex min-w-0 items-center gap-2">
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
      ) : (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-600">{initials}</div>
      )}
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-800">{user.full_name}</p>
        <p className="truncate text-xs text-slate-500">{roleLabels[user.role]}</p>
      </div>
    </div>
  )
}
