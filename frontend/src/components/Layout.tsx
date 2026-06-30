import { useContext } from 'react'
import { flushSync } from 'react-dom'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { authService, AuthContext } from '@services/auth'

function Layout() {
  const authContext = useContext(AuthContext)
  const userRole = authContext?.userRole
  const location = useLocation()
  const navigate = useNavigate()
  const navItems = [
    { to: '/', label: 'Главная', isActive: location.pathname === '/' },
    {
      to: '/objects',
      label: 'Объекты',
      isActive: location.pathname === '/objects' || location.pathname.startsWith('/objects/'),
    },
    {
      to: '/users',
      label: 'Пользователи',
      isActive: location.pathname === '/users',
      hidden: userRole !== 'admin',
    },
    {
      to: '/notifications',
      label: 'История действий',
      isActive: location.pathname === '/notifications',
      hidden: userRole !== 'admin' && userRole !== 'chief_engineer',
    },
    {
      to: '/ai',
      label: 'AI-бот',
      isActive: location.pathname === '/ai',
      hidden: userRole !== 'admin',
    },
  ].filter((item) => !item.hidden)

  const handleLogout = async () => {
    await authService.logout()
    flushSync(() => {
      authContext?.setIsAuthenticated?.(false)
      authContext?.setUserRole?.(null)
    })
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-slate-100 text-base-content">
      {/* Сайдбар - зафиксирован */}
      <aside className="fixed left-0 top-0 z-50 flex h-screen w-72 flex-col border-r border-slate-300 bg-base-100/95 p-6 shadow-2xl shadow-slate-950/5 backdrop-blur">
        <div className="mb-8">
          <Link to="/" className="text-2xl font-bold tracking-tight">
            ОСУШЕНИЕ.РФ
          </Link>
        </div>

        <div className="space-y-2">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={[
                'flex items-center justify-between rounded-2xl px-4 py-3 text-base font-medium transition-all',
                item.isActive
                  ? 'bg-[#ff4539]/15 text-[#b42318] ring-1 ring-[#ff4539]/25 shadow-sm'
                  : 'text-base-content hover:bg-base-200 hover:text-base-content',
              ].join(' ')}
            >
              <span>{item.label}</span>
            </Link>
          ))}
        </div>

        {/* Кнопка выхода внизу сайдбара */}
        <div className="mt-auto pt-6 border-t border-slate-200">
          <button
            onClick={handleLogout}
            className="w-full rounded-2xl px-4 py-3 text-base font-medium text-red-600 transition-all hover:bg-red-50 hover:text-red-700"
          >
            Выход
          </button>
        </div>
      </aside>

      {/* Основной контент с отступом слева под сайдбар */}
      <div className="ml-72 flex-1 border-l border-slate-300/70 bg-slate-50/80">
        <main className="p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default Layout
