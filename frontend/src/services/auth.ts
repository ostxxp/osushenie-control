import { createContext } from 'react'
import axios from 'axios'
import type { User, LoginRequest, LoginResponse } from '@/types'

export const AuthContext = createContext<{
  isAuthenticated: boolean
  userRole: string | null
  setIsAuthenticated?: (value: boolean) => void
  setUserRole?: (value: 'admin' | 'engineer' | 'foreman' | null) => void
} | null>(null)

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1'

const authApi = axios.create({
  baseURL: API_BASE_URL,
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

  logout: () => {
    localStorage.removeItem('token')
    localStorage.removeItem('role')
    localStorage.removeItem('user')
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
