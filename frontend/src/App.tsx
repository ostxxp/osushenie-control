import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import LoginPage from '@pages/LoginPage'
import DashboardPage from '@pages/DashboardPage'
import ObjectsPage from '@pages/ObjectsPage'
import ObjectDetailsPage from '@pages/ObjectDetailsPage'
import UsersPage from '@pages/UsersPage'
import PlaceholderPage from '@pages/PlaceholderPage'
import Layout from '@components/Layout'
import { AuthContext } from '@services/auth'

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [userRole, setUserRole] = useState<'admin' | 'engineer' | 'foreman' | null>(null)

  useEffect(() => {
    // Check if user is already logged in
    const token = localStorage.getItem('token')
    const role = localStorage.getItem('role')
    if (token && role) {
      setIsAuthenticated(true)
      setUserRole(role as any)
    }
    setLoading(false)
  }, [])

  if (loading) {
    return <div>Загрузка...</div>
  }

  return (
    <AuthContext.Provider value={{ isAuthenticated, userRole }}>
      <Router>
        <Routes>
          <Route
            path="/login"
            element={isAuthenticated ? <Navigate to="/" /> : <LoginPage setIsAuthenticated={setIsAuthenticated} setUserRole={setUserRole} />}
          />
          <Route element={<Layout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/objects" element={<ObjectsPage />} />
            <Route path="/objects/:id" element={<ObjectDetailsPage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/notifications" element={<PlaceholderPage title="Уведомления" description="Здесь будут уведомления." />} />
            <Route path="/settings" element={<PlaceholderPage title="Настройки" description="Здесь будут настройки." />} />
          </Route>
        </Routes>
      </Router>
    </AuthContext.Provider>
  )
}

export default App
