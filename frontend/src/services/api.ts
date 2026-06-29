import authApi from './auth'
import type {
  Project,
  Task,
  User,
  UserRole,
  ConstructionObject,
  ObjectTask,
  ObjectTaskStatus,
  ObjectTaskStatusUpdateResponse,
  ObjectTaskTree,
  ObjectTaskUpsertPayload,
  NotificationLog,
} from '@/types'

export const NOTIFICATIONS_UPDATED_EVENT = 'notifications:updated'

type ConstructionObjectCreatePayload = {
  name: string
  address: string
  is_active?: boolean
  start_date: string
  end_date?: string | null
}

type ConstructionObjectUpdatePayload = Partial<ConstructionObjectCreatePayload>

type PhotoMetadata = {
  id: number
  original_filename?: string
  uploaded_by_id?: number | null
}

export type ObjectPhotoFile = {
  id: number
  originalFilename: string
  uploadedById: number | null
  blob: Blob
}

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
  getForemen: async (): Promise<User[]> => {
    const response = await authApi.get('/users/foremen')
    return response.data
  },
  create: async (user: {
    full_name: string
    email: string
    phone_number?: string | null
    password: string
    role: UserRole
    is_active: boolean
  }): Promise<User> => {
    const response = await authApi.post('/users', user)
    return response.data
  },
  update: async (
    userId: number,
    user: Partial<{
      full_name: string
      email: string
      phone_number: string | null
      password: string
      role: UserRole
      is_active: boolean
    }>,
  ): Promise<User> => {
    const response = await authApi.patch(`/users/${userId}`, user)
    return response.data
  },
}

export const photoApi = {
  uploadCurrentAvatar: async (file: File): Promise<void> => {
    const formData = new FormData()
    formData.append('file', file)
    await authApi.post('/photos/profile/avatar', formData)
  },
  deleteCurrentAvatar: async (): Promise<void> => {
    await authApi.delete('/photos/profile/avatar')
  },
  uploadUserAvatar: async (userId: number, file: File): Promise<void> => {
    const formData = new FormData()
    formData.append('file', file)
    await authApi.post(`/photos/users/${userId}/avatar`, formData)
  },
  uploadObjectPhoto: async (objectId: number, file: File): Promise<void> => {
    const formData = new FormData()
    formData.append('file', file)
    await authApi.post(`/photos/objects/${objectId}`, formData)
  },
  getObjectPhotos: async (objectId: number): Promise<ObjectPhotoFile[]> => {
    const metadataResponse = await authApi.get<PhotoMetadata[]>(`/photos/objects/${objectId}`)
    return Promise.all(
      metadataResponse.data.map(async (photo) => {
        const fileResponse = await authApi.get<Blob>(`/photos/${photo.id}/file`, {
          responseType: 'blob',
        })
        return {
          id: photo.id,
          originalFilename: photo.original_filename || `Фото ${photo.id}`,
          uploadedById: photo.uploaded_by_id ?? null,
          blob: fileResponse.data,
        }
      }),
    )
  },
  deletePhoto: async (photoId: number): Promise<void> => {
    await authApi.delete(`/photos/${photoId}`)
  },
  getUserAvatar: async (userId: number): Promise<Blob | null> => {
    try {
      const metadataResponse = await authApi.get<PhotoMetadata>(`/photos/users/${userId}/avatar`)
      const fileResponse = await authApi.get<Blob>(`/photos/${metadataResponse.data.id}/file`, {
        responseType: 'blob',
      })
      return fileResponse.data
    } catch (error: unknown) {
      const status = (error as { response?: { status?: number } })?.response?.status
      if (status === 404) return null
      throw error
    }
  },
}

const normalizeTask = (task: ObjectTaskTree, options: { hideNotApplicable: boolean }): ObjectTaskTree => ({
  ...task,
  children: (task.children || [])
    .filter((child) => !options.hideNotApplicable || child.status !== 'not_applicable')
    .map((child) => normalizeTask(child, options)),
})

export const objectApi = {
  getAll: async (): Promise<ConstructionObject[]> => {
    const response = await authApi.get('/objects')
    return response.data
  },
  getById: async (id: number): Promise<ConstructionObject> => {
    const response = await authApi.get(`/objects/${id}`)
    return response.data
  },
  create: async (obj: ConstructionObjectCreatePayload): Promise<ConstructionObject> => {
    const response = await authApi.post('/objects', obj)
    return response.data
  },
  update: async (id: number, obj: ConstructionObjectUpdatePayload): Promise<ConstructionObject> => {
    const response = await authApi.patch(`/objects/${id}`, obj)
    return response.data
  },
  deactivate: async (id: number): Promise<ConstructionObject> => {
    const response = await authApi.patch(`/objects/${id}/deactivate`)
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
  getTasksTree: async (objectId: number): Promise<ObjectTaskTree[]> => {
    // Prefer /tasks/available, but fall back to /tasks/tree if unavailable.
    const tryAvailable = async () => {
      try {
        const resp = await authApi.get(`/objects/${objectId}/tasks/available`)
        return resp
      } catch (err) {
        const status = (err as { response?: { status?: number } }).response?.status
        if (status === 404 || status === 405) return null
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

    return (response.data || [])
      .filter((task: ObjectTaskTree) => task.status !== 'not_applicable')
      .map((task: ObjectTaskTree) => normalizeTask(task, { hideNotApplicable: true }))
  },
  getFullTasksTree: async (objectId: number): Promise<ObjectTaskTree[]> => {
    const response = await authApi.get(`/objects/${objectId}/tasks/tree`)
    return (response.data || [])
      .map((task: ObjectTaskTree) => normalizeTask(task, { hideNotApplicable: false }))
  },
  getTasksHeaders: async (objectId: number): Promise<ObjectTask[]> => {
    const response = await authApi.get(`/objects/${objectId}/tasks/headers`)
    return response.data
  },
  getAvailableTaskTree: async (objectId: number, taskId: number): Promise<ObjectTaskTree> => {
    const response = await authApi.get(`/objects/${objectId}/tasks/${taskId}/available`)
    return normalizeTask(response.data, { hideNotApplicable: true })
  },
  getOverdueTasks: async (objectId: number): Promise<ObjectTask[]> => {
    const response = await authApi.get(`/objects/${objectId}/tasks/overdue`)
    return response.data
  },
  getOverdueCount: async (objectId: number): Promise<number> => {
    const response = await authApi.get(`/objects/${objectId}/tasks/overdue_count`)
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
  toggleTaskStatus: async (objectId: number, taskId: number): Promise<ObjectTaskStatusUpdateResponse> => {
    const response = await authApi.patch(`/objects/${objectId}/tasks/${taskId}/toggle_status`)
    return response.data
  },
  createTask: async (objectId: number, task: ObjectTaskUpsertPayload): Promise<ObjectTask> => {
    const response = await authApi.post(`/objects/${objectId}/tasks`, task)
    return response.data
  },
  updateTask: async (objectId: number, taskId: number, task: ObjectTaskUpsertPayload): Promise<ObjectTask> => {
    const response = await authApi.post(`/objects/${objectId}/tasks/${taskId}`, task)
    return response.data
  },
  unassignResponsibleFromObject: async (objectId: number, userId: number): Promise<ConstructionObject> => {
    const response = await authApi.patch(`/objects/${objectId}/unassign/${userId}/responsible`)
    return response.data
  },
  updateTaskStatus: async (
    objectId: number,
    taskId: number,
    status: ObjectTaskStatus,
  ): Promise<ObjectTaskStatusUpdateResponse> => {
    try {
      const response = await authApi.patch(`/objects/${objectId}/tasks/${taskId}/status`, {
        status,
      })
      return response.data
    } catch (err) {
      const responseStatus = (err as { response?: { status?: number } }).response?.status
      if (responseStatus !== 404 && responseStatus !== 405) {
        throw err
      }

      return objectApi.toggleTaskStatus(objectId, taskId)
    }
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

export const notificationApi = {
  getAll: async (): Promise<NotificationLog[]> => {
    const response = await authApi.get('/notifications')
    return response.data
  },
  getUnread: async (): Promise<NotificationLog[]> => {
    const response = await authApi.get('/notifications/unread')
    return response.data
  },
  getUnreadCount: async (): Promise<number> => {
    const response = await authApi.get('/notifications/unread-count')
    return response.data
  },
  markAsRead: async (notificationId: number): Promise<NotificationLog> => {
    const response = await authApi.patch(`/notifications/${notificationId}/read`)
    return response.data
  },
  markAllAsRead: async (): Promise<NotificationLog[]> => {
    const response = await authApi.patch('/notifications')
    return response.data
  },
  deleteAll: async (): Promise<void> => {
    await authApi.delete('/notifications')
  },
  deleteOne: async (notificationId: number): Promise<void> => {
    await authApi.delete(`/notifications/${notificationId}`)
  },
}
