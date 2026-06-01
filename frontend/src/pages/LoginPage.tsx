import { useState, Dispatch, SetStateAction } from 'react'
import { useNavigate } from 'react-router-dom'
import { authService } from '@services/auth'
import type { UserRole } from '@/types'

interface LoginPageProps {
  setIsAuthenticated: (value: boolean) => void
  setUserRole: Dispatch<SetStateAction<UserRole | null>>
}

function LoginPage({ setIsAuthenticated, setUserRole }: LoginPageProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const user = await authService.login({ username, password })
      setIsAuthenticated(true)
      setUserRole(user.role)
      navigate('/', { replace: true })
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail || 'Ошибка входа. Проверьте учетные данные.')
      console.error('Login error:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">
      <div className="flex-[0_0_35%] items-start justify-center bg-white px-12 pt-20">
        <div className="w-full max-w-md">
          <div className="space-y-6">
            <div className="space-y-1 mb-12">
              <h1 className="text-3xl font-bold text-gray-900">ОСУШЕНИЕ.РФ</h1>
              <p className="text-gray-500 text-sm">Система управления строительными проектами</p>
            </div>

            <div className="space-y-1">
              <h2 className="text-xl font-semibold text-gray-900">Вход в систему</h2>
              <p className="text-gray-500 text-sm">Введите ваши учётные данные для входа</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Введите email"
                  disabled={loading}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#ff4539] focus:border-[#ff4539] outline-none transition-colors disabled:bg-gray-100 disabled:cursor-not-allowed placeholder-gray-400 text-gray-900"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Пароль
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Введите пароль"
                  disabled={loading}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-[#ff4539] focus:border-[#ff4539] outline-none transition-colors disabled:bg-gray-100 disabled:cursor-not-allowed placeholder-gray-400 text-gray-900"
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#ff4539] text-white py-2 px-4 rounded-lg hover:bg-[#cc372e] focus:outline-none focus:ring-2 focus:ring-[#ff4539] focus:ring-offset-2 transition-colors disabled:bg-[##ff918a] disabled:cursor-not-allowed font-medium cursor-pointer">
                {loading ? 'Вход...' : 'Войти'}
              </button>
            </form>
          </div>
        </div>
      </div>

      <div className="flex-1 bg-gray-100">
      </div>

    </div>
  )
}

export default LoginPage
