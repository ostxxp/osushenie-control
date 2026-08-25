import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { lazy, Suspense, useEffect, useState } from 'react'
import Layout from './components/Layout'
import { AUTH_EXPIRED_EVENT, AuthContext, authService } from '@services/auth'
import type { UserRole } from '@/types'

const LoginPage = lazy(() => import('@pages/LoginPage'))
const DashboardPage = lazy(() => import('@pages/DashboardPage'))
const ObjectsPage = lazy(() => import('@pages/ObjectsPage'))
const ObjectDetailsPage = lazy(() => import('@pages/ObjectDetailsPage'))
const ObjectTasksPage = lazy(() => import('@pages/ObjectTasksPage'))
const ObjectEmployeesPage = lazy(() => import('@pages/ObjectEmployeesPage'))
const UsersPage = lazy(() => import('@pages/UsersPage'))
const NotificationsPage = lazy(() => import('@pages/NotificationsPage'))
const AiChatPage = lazy(() => import('@pages/AiChatPage'))
const SettingsPage = lazy(() => import('@pages/SettingsPage'))
const WorkItemsPage = lazy(() => import('@pages/WorkItemsPage'))
const ActivityPage = lazy(() => import('@pages/ActivityPage'))

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [userRole, setUserRole] = useState<UserRole | null>(null)

  useEffect(() => {
    let cancelled = false

    const handleAuthExpired = () => {
      setIsAuthenticated(false)
      setUserRole(null)
    }

    window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired)

    const checkAuth = async () => {
      const user = await authService.loadCurrentUser()
      if (cancelled) return

      setIsAuthenticated(user !== null)
      setUserRole(user?.role ?? null)
      setLoading(false)
    }

    checkAuth()

    return () => {
      cancelled = true
      window.removeEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired)
    }
  }, [])

  if (loading) {
    return <div>Загрузка...</div>
  }

  return (
    <AuthContext.Provider value={{ isAuthenticated, userRole, setIsAuthenticated, setUserRole }}>
      <Router>
        <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><span className="loading loading-spinner text-[#ff4539]" /></div>}>
        <Routes>
          <Route
            path="/login"
            element={isAuthenticated ? <Navigate to="/" replace /> : <LoginPage setIsAuthenticated={setIsAuthenticated} setUserRole={setUserRole} />}
          />
          <Route element={isAuthenticated ? <Layout /> : <Navigate to="/login" replace />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/objects" element={<ObjectsPage />} />
            <Route path="/objects/:id" element={<ObjectDetailsPage />} />
            <Route path="/objects/:id/tasks" element={<ObjectTasksPage />} />
            <Route path="/objects/:id/tasks/:taskId" element={<ObjectTasksPage />} />
            <Route path="/objects/:id/employees" element={<ObjectEmployeesPage />} />
            <Route path="/tasks/my" element={<WorkItemsPage />} />
            <Route path="/activity" element={<ActivityPage />} />
            <Route
              path="/users"
              element={userRole === 'admin' ? <UsersPage /> : <Navigate to="/" replace />}
            />
            <Route
              path="/notifications"
              element={userRole === 'admin' || userRole === 'chief_engineer' ? <NotificationsPage /> : <Navigate to="/" replace />}
            />
            <Route
              path="/ai"
              element={userRole === 'admin' || userRole === 'chief_engineer' ? <AiChatPage /> : <Navigate to="/" replace />}
            />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Routes>
        </Suspense>
      </Router>
    </AuthContext.Provider>
  )
}

export default App
