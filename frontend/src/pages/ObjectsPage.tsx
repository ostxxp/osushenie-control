import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { objectApi } from '@services/api'
import type { ConstructionObject } from '@/types'

function ObjectsPage() {
  const [objects, setObjects] = useState<ConstructionObject[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const filteredObjects = useMemo(
    () =>
      objects.filter((objectItem) => {
        const query = search.toLowerCase()
        return (
          objectItem.name.toLowerCase().includes(query) ||
          objectItem.address.toLowerCase().includes(query) ||
          (objectItem.is_active ? 'активен' : 'неактивен').includes(query)
        )
      }),
    [search, objects],
  )

  useEffect(() => {
    const fetchObjects = async () => {
      try {
        const data = await objectApi.getAll()
        setObjects(data)
      } catch (err: any) {
        setError(err.response?.data?.detail || 'Ошибка загрузки объектов')
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    fetchObjects()
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
        <h1 className="text-3xl font-semibold">Объекты строительства</h1>
        <p className="text-base-content/70">Управление строительными объектами компании</p>
      </div>

      <div className="flex flex-col gap-4 rounded-lg border border-base-200 bg-base-100 p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex-none w-full max-w-sm">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по объектам..."
              className="w-full rounded-lg border border-base-300 bg-white px-4 py-2 outline-none transition-colors focus:border-primary focus:ring focus:ring-primary/20 placeholder:text-gray-400"
            />
          </div>
          <button
            type="button"
            className="btn btn-primary btn-sm whitespace-nowrap"
            onClick={() => {
              // TODO: Добавить действие для создания объекта
            }}
          >
            Добавить объект
          </button>
        </div>

        <div className="overflow-x-auto rounded-lg border border-base-200 bg-base-100">
          <table className="min-w-full text-left">
            <thead className="bg-base-200">
              <tr>
                <th className="px-4 py-3">Название объекта</th>
                <th className="px-4 py-3">Адрес</th>
                <th className="px-4 py-3">Статус</th>
                <th className="px-4 py-3">Начало работ</th>
                <th className="px-4 py-3">Сдача по плану</th>
              </tr>
            </thead>
            <tbody>
              {filteredObjects.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-base-content/70">
                    Объектов не найдено.
                  </td>
                </tr>
              ) : (
                filteredObjects.map((objectItem) => (
                  <tr key={objectItem.id} className="border-t border-base-200 hover:bg-base-200">
                    <td className="px-4 py-3 font-medium">
                      <Link to={`/objects/${objectItem.id}`} className="text-primary hover:underline">
                        {objectItem.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{objectItem.address}</td>
                    <td className="px-4 py-3">{objectItem.is_active ? 'Активен' : 'Неактивен'}</td>
                    <td className="px-4 py-3">{new Date(objectItem.start_date).toLocaleDateString('ru-RU')}</td>
                    <td className="px-4 py-3">{objectItem.end_date ? new Date(objectItem.end_date).toLocaleDateString('ru-RU') : '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default ObjectsPage
