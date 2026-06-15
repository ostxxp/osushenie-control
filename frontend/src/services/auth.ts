import { createContext } from 'react'
import axios from 'axios'
import type { User, LoginRequest, LoginResponse, UserRole } from '@/types'

export const AuthContext = createContext<{
  isAuthenticated: boolean
  userRole: UserRole | null
  setIsAuthenticated?: (value: boolean) => void
  setUserRole?: (value: UserRole | null) => void
} | null>(null)

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1'

const authApi = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
})

// Add token to requests
authApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export const authService = {
  login: async (credentials: LoginRequest): Promise<User> => {
    const formData = new URLSearchParams()
    formData.append('username', credentials.username) // это email
    formData.append('password', credentials.password)

    const response = await authApi.post<LoginResponse>('/auth/login', formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })

    const { access_token } = response.data
    localStorage.setItem('token', access_token)

    const userResponse = await authApi.get<User>('/users/me')
    const user = userResponse.data
    localStorage.setItem('role', user.role)
    localStorage.setItem('user', JSON.stringify(user))

    return user
  },

  logout: async () => {
    try {
      await authApi.post('/auth/logout')
    } catch (error) {
      console.warn('Logout request failed', error)
    }

    localStorage.removeItem('token')
    localStorage.removeItem('role')
    localStorage.removeItem('user')
  },

  loadCurrentUser: async (): Promise<User | null> => {
    const token = localStorage.getItem('token')
    if (!token) {
      localStorage.removeItem('role')
      localStorage.removeItem('user')
      return null
    }

    try {
      const response = await authApi.get<User>('/users/me')
      const user = response.data
      localStorage.setItem('role', user.role)
      localStorage.setItem('user', JSON.stringify(user))
      return user
    } catch (error) {
      localStorage.removeItem('token')
      localStorage.removeItem('role')
      localStorage.removeItem('user')
      return null
    }
  },

  getCurrentUser: (): User | null => {
    const userStr = localStorage.getItem('user')
    return userStr ? JSON.parse(userStr) : null
  },

  getToken: (): string | null => {
    return localStorage.getItem('token')
  },
}

export default authApi
