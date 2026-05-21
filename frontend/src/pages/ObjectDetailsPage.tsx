import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { objectApi } from '@services/api'
import { formatDateRu } from '@/utils'
import type { ConstructionObject } from '@/types'

function ObjectDetailsPage() {
  const { id } = useParams<{ id: string }>()
  const [objectItem, setObjectItem] = useState<ConstructionObject | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const fetchObject = async () => {
      if (!id) return
      try {
        const data = await objectApi.getById(Number(id))
        setObjectItem(data)
      } catch (err: any) {
        setError(err.response?.data?.detail || 'Ошибка загрузки объекта')
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    fetchObject()
  }, [id])

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
        <h1 className="text-3xl font-semibold">{objectItem.name}</h1>
        <p className="text-base-content/70">Детали объекта строительства</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-base-200 bg-base-100 p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Основная информация</h2>
          <div className="mt-4 space-y-3 text-base-content/80">
            <div>
              <span className="font-semibold">Адрес:</span> {objectItem.address}
            </div>
            <div>
              <span className="font-semibold">Статус:</span> {objectItem.is_active ? 'Активен' : 'Неактивен'}
            </div>
            <div>
              <span className="font-semibold">Начало работ:</span> {formatDateRu(objectItem.start_date)}
            </div>
            <div>
              <span className="font-semibold">Окончание:</span> {objectItem.end_date ? formatDateRu(objectItem.end_date) : '-'}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-base-200 bg-base-100 p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Описание</h2>
          <p className="mt-4 text-base-content/80">{objectItem.description || 'Описание отсутствует.'}</p>
        </div>
      </div>
    </div>
  )
}

export default ObjectDetailsPage
