import authApi from './auth'
import type { Project, Task, User, ConstructionObject, ObjectTask } from '@/types'

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
  create: async (user: Omit<User, 'id' | 'created_at' | 'updated_at'> & { password: string }): Promise<User> => {
    const response = await authApi.post('/users', user)
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
  create: async (obj: Omit<ConstructionObject, 'id' | 'created_at' | 'updated_at'>): Promise<ConstructionObject> => {
    const response = await authApi.post('/objects', obj)
    return response.data
  },
  assignUserToObject: async (objectId: number, userId: number): Promise<ConstructionObject> => {
    const response = await authApi.post(`/objects/${objectId}/assign/${userId}`)
    return response.data
  },
  unassignUserFromObject: async (objectId: number, userId: number): Promise<ConstructionObject> => {
    const response = await authApi.delete(`/objects/${objectId}/unassign/${userId}`)
    return response.data
  },
  getTasksTree: async (objectId: number): Promise<any[]> => {
    // Prefer /tasks/available, but fall back to /tasks/tree if unavailable.
    const tryAvailable = async () => {
      try {
        const resp = await authApi.get(`/objects/${objectId}/tasks/available`)
        return resp
      } catch (err: any) {
        if (err.response && (err.response.status === 404 || err.response.status === 405)) return null
        throw err
      }
    }

    let response = await tryAvailable()
    if (!response) {
      response = await authApi.get(`/objects/${objectId}/tasks/tree`)
    }

    if (!response) {
      return []
    }

    const normalize = (nodes: any[]): any[] => {
      return nodes.map((n: any) => ({
        ...n,
        status: typeof n.status === 'string' ? n.status.toUpperCase() : n.status,
        children: n.children ? normalize(n.children) : [],
      }))
    }

    return normalize(response.data || [])
  },
  getTasksHeaders: async (objectId: number): Promise<ObjectTask[]> => {
    const response = await authApi.get(`/objects/${objectId}/tasks/headers`)
    return response.data
  },
  getProgress: async (objectId: number): Promise<number> => {
    const response = await authApi.get(`/objects/${objectId}/progress`)
    return response.data
  },
  getResponsibleUsers: async (objectId: number): Promise<User[]> => {
    const response = await authApi.get(`/objects/responsible/${objectId}`)
    return response.data
  },
  getAssignedUsers: async (objectId: number): Promise<User[]> => {
    const response = await authApi.get(`/objects/${objectId}/users`)
    return response.data
  },
  assignResponsibleToObject: async (objectId: number, userId: number): Promise<ConstructionObject> => {
    const response = await authApi.patch(`/objects/${objectId}/assign/${userId}/responsible`)
    return response.data
  },
  toggleTaskStatus: async (objectId: number, taskId: number): Promise<any> => {
    const response = await authApi.patch(`/objects/${objectId}/tasks/${taskId}/toggle_status`)
    return response.data
  },
  unassignResponsibleFromObject: async (objectId: number, userId: number): Promise<ConstructionObject> => {
    const response = await authApi.patch(`/objects/${objectId}/unassign/${userId}/responsible`)
    return response.data
  },
  updateTaskStatus: async (objectId: number, taskId: number, status: string): Promise<any> => {
    const normalizedStatus = status.toLowerCase()
    const response = await authApi.patch(`/objects/${objectId}/tasks/${taskId}/status`, {
      status: normalizedStatus,
    })
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
