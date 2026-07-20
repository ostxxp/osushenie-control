import authApi, { authService } from './auth'
import type {
  Project,
  Task,
  User,
  UserRole,
  ConstructionObject,
  ObjectSummary,
  ObjectTask,
  ObjectTaskListGroup,
  ObjectTaskStatus,
  ObjectTaskStatusUpdateResponse,
  ObjectTaskStats,
  ObjectTaskTree,
  ObjectTaskUpsertPayload,
  NotificationLog,
  AIChatMessage,
  AIChatResponse,
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

const avatarCacheName = 'user-avatars-v1'
const avatarCacheKey = (userId: number) => `/__avatar-cache/users/${userId}`
const avatarStorageKey = (userId: number) => `user-avatar:${userId}`

export const getStoredAvatarUrl = (userId: number): string => {
  try {
    return localStorage.getItem(avatarStorageKey(userId)) || ''
  } catch {
    return ''
  }
}

const storeAvatarUrl = async (userId: number, avatar: Blob): Promise<void> => {
  try {
    const image = await createImageBitmap(avatar)
    const size = 160
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const context = canvas.getContext('2d')
    if (!context) {
      image.close()
      return
    }

    const sourceSize = Math.min(image.width, image.height)
    const sourceX = (image.width - sourceSize) / 2
    const sourceY = (image.height - sourceSize) / 2
    context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size)
    image.close()

    const thumbnail = canvas.toDataURL('image/webp', 0.82)
    try {
      localStorage.setItem(avatarStorageKey(userId), thumbnail)
    } catch {
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith('user-avatar:') && (localStorage.getItem(key)?.length || 0) > 250_000) {
          localStorage.removeItem(key)
        }
      })
      localStorage.setItem(avatarStorageKey(userId), thumbnail)
    }
  } catch (error) {
    console.warn(`Не удалось сохранить миниатюру аватара пользователя ${userId}`, error)
  }
}

export const getAllStoredAvatarUrls = (): Record<number, string> => {
  try {
    return Object.fromEntries(
      Object.keys(localStorage)
        .filter((key) => key.startsWith('user-avatar:'))
        .map((key) => [Number(key.slice('user-avatar:'.length)), localStorage.getItem(key) || ''])
        .filter(([userId, url]) => Number.isFinite(userId) && Boolean(url)),
    )
  } catch {
    return {}
  }
}

const deleteCachedAvatar = async (userId: number): Promise<void> => {
  try {
    localStorage.removeItem(avatarStorageKey(userId))
  } catch {
    // Ignore unavailable local storage.
  }
  if (!('caches' in window)) return
  const cache = await caches.open(avatarCacheName)
  await cache.delete(avatarCacheKey(userId))
}

const fetchUserAvatar = async (userId: number): Promise<Blob | null> => {
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
  getFile: async (photoId: number): Promise<Blob> => {
    const response = await authApi.get<Blob>(`/photos/${photoId}/file`, {
      responseType: 'blob',
    })
    return response.data
  },
  uploadCurrentAvatar: async (file: File): Promise<void> => {
    const formData = new FormData()
    formData.append('file', file)
    await authApi.post('/photos/profile/avatar', formData)
    const currentUserId = authService.getCurrentUser()?.id
    if (currentUserId) await deleteCachedAvatar(currentUserId)
  },
  deleteCurrentAvatar: async (): Promise<void> => {
    await authApi.delete('/photos/profile/avatar')
    const currentUserId = authService.getCurrentUser()?.id
    if (currentUserId) await deleteCachedAvatar(currentUserId)
  },
  uploadUserAvatar: async (userId: number, file: File): Promise<void> => {
    const formData = new FormData()
    formData.append('file', file)
    await authApi.post(`/photos/users/${userId}/avatar`, formData)
    await deleteCachedAvatar(userId)
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
    if (!('caches' in window)) return fetchUserAvatar(userId)

    const cache = await caches.open(avatarCacheName)
    const cachedResponse = await cache.match(avatarCacheKey(userId))
    if (cachedResponse) {
      const avatar = await cachedResponse.blob()
      if (!getStoredAvatarUrl(userId)) await storeAvatarUrl(userId, avatar)
      return avatar
    }

    const avatar = await fetchUserAvatar(userId)
    if (avatar) {
      await storeAvatarUrl(userId, avatar)
      await cache.put(
        avatarCacheKey(userId),
        new Response(avatar, { headers: { 'Content-Type': avatar.type || 'image/jpeg' } }),
      )
    }
    return avatar
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
  getTaskGroups: async (
    objectId: number,
    status: 'done' | 'todo' | 'overdue',
    mainTaskId?: number,
  ): Promise<ObjectTaskListGroup[]> => {
    const response = await authApi.get<ObjectTaskListGroup[]>(`/objects/${objectId}/tasks/${status}`, {
      params: mainTaskId ? { main_task_id: mainTaskId } : undefined,
    })
    return response.data
  },
  getOverdueCount: async (objectId: number): Promise<number> => {
    const response = await authApi.get(`/objects/${objectId}/tasks/overdue_count`)
    return response.data
  },
  getSummaries: async (): Promise<ObjectSummary[]> => {
    const response = await authApi.get<ObjectSummary[]>('/objects/summary')
    return response.data
  },
  getTaskStats: async (objectId: number, mainTaskId?: number): Promise<ObjectTaskStats> => {
    const response = await authApi.get<{
      total: number
      done: number
      todo: number
      in_progress: number
      overdue: number
    }>(`/objects/${objectId}/tasks/stats`, {
      params: mainTaskId ? { main_task_id: mainTaskId } : undefined,
    })
    return {
      total: response.data.total,
      done: response.data.done,
      todo: response.data.todo,
      inProgress: response.data.in_progress,
      overdue: response.data.overdue,
    }
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

export const aiApi = {
  sendMessage: async (
    message: string,
    history: AIChatMessage[],
  ): Promise<AIChatResponse> => {
    const response = await authApi.post('/ai/chat', {
      message,
      history,
    })
    return response.data
  },
}
