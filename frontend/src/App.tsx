import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import LoginPage from '@pages/LoginPage'
import DashboardPage from '@pages/DashboardPage'
import ObjectsPage from '@pages/ObjectsPage'
import ObjectDetailsPage from '@pages/ObjectDetailsPage'
import ObjectTasksPage from '@pages/ObjectTasksPage'
import ObjectEmployeesPage from '@pages/ObjectEmployeesPage'
import UsersPage from '@pages/UsersPage'
import NotificationsPage from '@pages/NotificationsPage'
import AiChatPage from '@pages/AiChatPage'
import Layout from './components/Layout'
import { AUTH_EXPIRED_EVENT, AuthContext, authService } from '@services/auth'
import type { UserRole } from '@/types'

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
            <Route path="/objects/:id/employees" element={<ObjectEmployeesPage />} />
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
              element={userRole === 'admin' ? <AiChatPage /> : <Navigate to="/" replace />}
            />
          </Route>
        </Routes>
      </Router>
    </AuthContext.Provider>
  )
}

export default App
