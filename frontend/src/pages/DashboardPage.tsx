import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { objectApi, photoApi } from '@services/api'
import { formatApiError } from '@/utils'
import type { ObjectSummary } from '@/types'

const formatDate = (value?: string | null) => {
  if (!value) return 'Не указана'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Не указана'
  return new Intl.DateTimeFormat('ru-RU').format(date)
}

function DashboardPage() {
  const navigate = useNavigate()
  const [objects, setObjects] = useState<ObjectSummary[]>([])
  const [photoUrls, setPhotoUrls] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    const createdUrls: string[] = []

    const loadDashboard = async () => {
      setLoading(true)
      setError('')

      try {
        const data = await objectApi.getSummaries()
        if (cancelled) return
        setObjects(data)

        const photos = await Promise.all(
          data.map(async (objectItem): Promise<[number, string] | null> => {
            const firstPhoto = objectItem.photos[0]
            if (!firstPhoto) return null

            try {
              const blob = await photoApi.getFile(firstPhoto.id)
              const url = URL.createObjectURL(blob)
              if (cancelled) {
                URL.revokeObjectURL(url)
                return null
              }
              createdUrls.push(url)
              return [objectItem.id, url]
            } catch {
              return null
            }
          }),
        )

        if (!cancelled) {
          setPhotoUrls(Object.fromEntries(photos.filter((item): item is [number, string] => item !== null)))
        }
      } catch (err: unknown) {
        if (!cancelled) setError(formatApiError(err, 'Не удалось загрузить сводку по объектам'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadDashboard()
    return () => {
      cancelled = true
      createdUrls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [])

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="h-20 animate-pulse rounded-[1.75rem] bg-base-200" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((item) => <div key={item} className="h-24 animate-pulse rounded-3xl bg-base-200" />)}
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {[0, 1, 2, 3].map((item) => <div key={item} className="h-64 animate-pulse rounded-3xl bg-base-200" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {!error && (
        <>
          {objects.length === 0 ? (
            <div className="rounded-[1.75rem] border border-dashed border-base-300 bg-base-100 py-12 text-center text-base-content/65">Доступных объектов пока нет.</div>
          ) : (
            <section className="grid gap-4 xl:grid-cols-2">
              {objects.map((objectItem) => (
                <article
                  key={objectItem.id}
                  className="cursor-pointer overflow-hidden rounded-3xl border border-base-200 bg-base-100 shadow-sm transition hover:border-slate-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#ff4539]/30"
                  role="link"
                  tabIndex={0}
                  onClick={() => navigate(`/objects/${objectItem.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      navigate(`/objects/${objectItem.id}`)
                    }
                  }}
                >
                  <div className="grid min-h-56 sm:grid-cols-[12rem_1fr]">
                    <div className="relative min-h-40 bg-slate-200 sm:min-h-full">
                      {photoUrls[objectItem.id] ? (
                        <img src={photoUrls[objectItem.id]} alt="" className="absolute inset-0 h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full min-h-40 items-center justify-center px-4 text-center text-sm text-slate-500">Нет фотографии</div>
                      )}
                      {objectItem.photos.length > 0 && (
                        <span className="absolute bottom-3 left-3 rounded-full bg-slate-950/70 px-3 py-1 text-xs font-medium text-white backdrop-blur">Фото: {objectItem.photos.length}</span>
                      )}
                    </div>

                    <div className="min-w-0 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link to={`/objects/${objectItem.id}`} className="text-lg font-semibold text-slate-900 hover:text-primary hover:underline">{objectItem.name}</Link>
                          <p className="mt-1 line-clamp-2 text-sm text-base-content/60">{objectItem.address}</p>
                        </div>
                        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${objectItem.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                          {objectItem.is_active ? 'Активен' : 'Неактивен'}
                        </span>
                      </div>

                      <div className="mt-4 flex items-center justify-between text-sm">
                        <span className="font-medium">Прогресс</span>
                        <span className="font-semibold">{objectItem.progress}%</span>
                      </div>
                      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-[#ff4539] transition-all duration-700" style={{ width: `${Math.max(0, Math.min(100, objectItem.progress))}%` }} />
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-y-3 border-y border-base-200 py-3 text-center sm:grid-cols-4 sm:gap-2">
                        <div><div className="font-semibold tabular-nums text-amber-600">{objectItem.stats.todo}</div><div className="text-xs text-base-content/55">К выполнению</div></div>
                        <div><div className="font-semibold tabular-nums text-blue-700">{objectItem.stats.in_progress}</div><div className="text-xs text-base-content/55">В работе</div></div>
                        <div><div className="font-semibold tabular-nums text-emerald-700">{objectItem.stats.done}</div><div className="text-xs text-base-content/55">Готово</div></div>
                        <div><div className={objectItem.stats.overdue > 0 ? 'font-semibold tabular-nums text-red-600' : 'font-semibold tabular-nums'}>{objectItem.stats.overdue}</div><div className="text-xs text-base-content/55">Просрочено</div></div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-base-content/55">
                        <span>{formatDate(objectItem.start_date)} – {formatDate(objectItem.end_date)}</span>
                        <Link
                          to={`/objects/${objectItem.id}/tasks`}
                          className="rounded-xl bg-[#ff4539]/10 px-3 py-1.5 font-semibold text-[#cc372e] transition hover:bg-[#ff4539]/20"
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => event.stopPropagation()}
                        >
                          Открыть задачи
                        </Link>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  )
}

export default DashboardPage
