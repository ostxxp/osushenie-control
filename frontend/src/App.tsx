import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import LoginPage from '@pages/LoginPage'
import DashboardPage from '@pages/DashboardPage'
import ObjectsPage from '@pages/ObjectsPage'
import ObjectDetailsPage from '@pages/ObjectDetailsPage'
import ObjectTasksPage from '@pages/ObjectTasksPage'
import ObjectEmployeesPage from '@pages/ObjectEmployeesPage'
import UsersPage from '@pages/UsersPage'
import PlaceholderPage from '@pages/PlaceholderPage'
import Layout from '@components/Layout'
import { AuthContext, authService } from '@services/auth'
import type { UserRole } from '@/types'

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [userRole, setUserRole] = useState<UserRole | null>(null)

  useEffect(() => {
    let cancelled = false

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
            <Route path="/notifications" element={<PlaceholderPage title="Уведомления" description="Здесь будут уведомления." />} />
          </Route>
        </Routes>
      </Router>
    </AuthContext.Provider>
  )
}

export default App
