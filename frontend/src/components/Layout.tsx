import { useContext, useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { authService, AuthContext } from '@services/auth'
import logo from '../../photos/logo цветной горизонтальный.png'

function Layout() {
  const authContext = useContext(AuthContext)
  const userRole = authContext?.userRole
  const location = useLocation()
  const navigate = useNavigate()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
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

  useEffect(() => {
    setMobileMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!mobileMenuOpen) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileMenuOpen(false)
    }
    document.addEventListener('keydown', closeOnEscape)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [mobileMenuOpen])

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
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-4 shadow-sm backdrop-blur lg:hidden">
        <Link to="/" className="min-w-0">
          <img
            src={logo}
            alt="ОСУШЕНИЕ.РФ"
            className="block h-8 w-auto max-w-[180px] object-contain"
          />
        </Link>
        <button
          type="button"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-800 transition hover:bg-slate-50"
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Открыть меню"
          aria-expanded={mobileMenuOpen}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      {mobileMenuOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-[2px] lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
          aria-label="Закрыть меню"
        />
      )}

      <aside
        className={`fixed left-0 top-0 z-50 flex h-dvh w-[min(18rem,86vw)] flex-col border-r border-slate-300 bg-base-100/95 p-5 shadow-2xl shadow-slate-950/10 backdrop-blur transition-transform duration-300 lg:w-72 lg:translate-x-0 lg:p-6 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="mb-8">
          <div className="flex items-center justify-between gap-4">
            <Link to="/" className="block min-w-0">
              <img
                src={logo}
                alt="ОСУШЕНИЕ.РФ"
                className="block h-auto w-full max-w-[220px] object-contain"
              />
            </Link>
            <button
              type="button"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-2xl text-slate-600 hover:bg-slate-100 lg:hidden"
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Закрыть меню"
            >
              ×
            </button>
          </div>
        </div>

        <nav className="space-y-2 overflow-y-auto">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={[
                'flex items-center justify-between rounded-2xl border px-4 py-3 text-base font-medium transition-all',
                item.isActive
                  ? 'border-[#ff4539]/25 bg-[#ff4539]/15 text-[#b42318] shadow-sm'
                  : 'border-transparent text-base-content hover:bg-base-200 hover:text-base-content',
              ].join(' ')}
            >
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="mt-auto pt-6 border-t border-slate-200">
          <Link
            to="/settings"
            className={[
              'flex w-full items-center justify-center rounded-2xl border px-4 py-3 text-center text-base font-medium transition-all',
              location.pathname === '/settings'
                ? 'border-[#ff4539]/25 bg-[#ff4539]/15 text-[#b42318] shadow-sm'
                : 'border-transparent text-base-content hover:bg-base-200',
            ].join(' ')}
          >
            Настройки
          </Link>
          <button
            onClick={handleLogout}
            className="mt-2 w-full rounded-2xl px-4 py-3 text-center text-base font-medium text-red-600 transition-all hover:bg-red-50 hover:text-red-700"
          >
            Выход
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex-1 bg-slate-50/80 lg:ml-72 lg:border-l lg:border-slate-300/70">
        <main className="min-w-0 p-3 sm:p-5 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default Layout
