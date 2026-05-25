import { Outlet, Link } from 'react-router-dom'
import { useContext } from 'react'
import { authService, AuthContext } from '@services/auth'

function Layout() {
  const authContext = useContext(AuthContext)
  const userRole = authContext?.userRole

  const handleLogout = () => {
    authService.logout()
    window.location.href = '/login'
  }

  return (
    <div className="min-h-screen bg-base-200 text-base-content">
      <div className="flex min-h-screen">
        <aside className="w-72 bg-base-100 border-r border-base-200 p-6">
          <div className="mb-10">
            <Link to="/" className="text-2xl font-bold">
              ОСУШЕНИЕ.РФ
            </Link>
          </div>
          <div className="space-y-2 mb-8">
            <Link to="/" className="block rounded-lg px-4 py-3 text-base font-medium text-base-content hover:bg-base-200">
              Главная
            </Link>
            <Link to="/objects" className="block rounded-lg px-4 py-3 text-base font-medium text-base-content hover:bg-base-200">
              Объекты
            </Link>
            {(userRole === 'admin' || userRole === 'engineer') && (
              <Link to="/users" className="block rounded-lg px-4 py-3 text-base font-medium text-base-content hover:bg-base-200">
                Пользователи
              </Link>
            )}
            <Link to="/notifications" className="block rounded-lg px-4 py-3 text-base font-medium text-base-content hover:bg-base-200">
              Уведомления
            </Link>
          </div>
        </aside>

        <div className="flex-1">
          <div className="flex items-center justify-between border-b border-base-200 bg-base-100 px-6 py-4 shadow-sm">
            <span className="text-lg font-semibold">Панель управления</span>
            <button onClick={handleLogout} className="btn btn-sm btn-outline">
              Выход
            </button>
          </div>
          <main className="p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}

export default Layout
