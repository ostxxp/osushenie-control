import authApi from './auth'
import type { Project, Task, User, ConstructionObject } from '@/types'

export const projectApi = {
  getAll: async (): Promise<Project[]> => {
    const response = await authApi.get('/projects')
    return response.data
  },

  getById: async (id: number): Promise<Project> => {
    const response = await authApi.get(`/projects/${id}`)
    return response.data
  },

  create: async (project: Omit<Project, 'id' | 'created_at' | 'updated_at'>): Promise<Project> => {
    const response = await authApi.post('/projects', project)
    return response.data
  },

  update: async (id: number, project: Partial<Project>): Promise<Project> => {
    const response = await authApi.put(`/projects/${id}`, project)
    return response.data
  },

  delete: async (id: number): Promise<void> => {
    await authApi.delete(`/projects/${id}`)
  },
}

export const userApi = {
  getAll: async (): Promise<User[]> => {
    const response = await authApi.get('/users')
    return response.data
  },
}

export const objectApi = {
  getAll: async (): Promise<ConstructionObject[]> => {
    const response = await authApi.get('/objects')
    return response.data
  },
  getById: async (id: number): Promise<ConstructionObject> => {
    const response = await authApi.get(`/objects/${id}`)
    return response.data
  },
}

export const taskApi = {
  getByProjectId: async (projectId: number): Promise<Task[]> => {
    const response = await authApi.get(`/projects/${projectId}/tasks`)
    return response.data
  },

  create: async (projectId: number, task: Omit<Task, 'id' | 'created_at' | 'updated_at'>): Promise<Task> => {
    const response = await authApi.post(`/projects/${projectId}/tasks`, task)
    return response.data
  },

  update: async (projectId: number, taskId: number, task: Partial<Task>): Promise<Task> => {
    const response = await authApi.put(`/projects/${projectId}/tasks/${taskId}`, task)
    return response.data
  },

  delete: async (projectId: number, taskId: number): Promise<void> => {
    await authApi.delete(`/projects/${projectId}/tasks/${taskId}`)
  },
}
