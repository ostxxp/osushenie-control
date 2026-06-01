import type { ObjectTaskTree } from '@/types'

export type TaskStats = {
  total: number
  done: number
  inProgress: number
  todo: number
}

const createEmptyTaskStats = (): TaskStats => ({
  total: 0,
  done: 0,
  inProgress: 0,
  todo: 0,
})

const addTaskStatus = (stats: TaskStats, status: ObjectTaskTree['status']) => {
  stats.total += 1

  if (status === 'done') {
    stats.done += 1
  } else if (status === 'in_progress') {
    stats.inProgress += 1
  } else {
    stats.todo += 1
  }
}

const getSingleChoiceGroupStatus = (tasks: ObjectTaskTree[]): ObjectTaskTree['status'] => {
  if (tasks.some((task) => task.status === 'done')) {
    return 'done'
  }

  if (tasks.some((task) => task.status === 'in_progress')) {
    return 'in_progress'
  }

  return 'todo'
}

export const calculateLogicalTaskStats = (tasks: ObjectTaskTree[]): TaskStats => {
  const stats = createEmptyTaskStats()

  const countChildren = (children: ObjectTaskTree[], childrenMode: ObjectTaskTree['children_mode']) => {
    if (childrenMode === 'single_choice') {
      if (children.length > 0) {
        addTaskStatus(stats, getSingleChoiceGroupStatus(children))
      }

      children.forEach((child) => countChildren(child.children, child.children_mode))
      return
    }

    children.forEach((child) => {
      addTaskStatus(stats, child.status)
      countChildren(child.children, child.children_mode)
    })
  }

  tasks.forEach((rootTask) => {
    if (rootTask.children.length === 0) {
      addTaskStatus(stats, rootTask.status)
      return
    }

    countChildren(rootTask.children, rootTask.children_mode)
  })

  return stats
}

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export const formatApiError = (value: unknown, fallback: string): string => {
  if (typeof value === 'string') {
    return value
  }

  if (Array.isArray(value)) {
    const messages = value
      .map((item) => formatApiError(item, ''))
      .filter(Boolean)

    return messages.length > 0 ? messages.join('\n') : fallback
  }

  if (isPlainObject(value)) {
    if (typeof value.msg === 'string') {
      return value.msg
    }

    if (typeof value.detail === 'string') {
      return value.detail
    }

    if (Array.isArray(value.detail)) {
      return formatApiError(value.detail, fallback)
    }

    if (typeof value.message === 'string') {
      return value.message
    }
  }

  return fallback
}

export const formatDateRu = (value: string | Date | null | undefined): string => {
  if (!value) {
    return ''
  }

  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
    .format(date)
    .replace(/\./g, '/')
}

export const formatDateTimeRu = (value: string | Date | null | undefined): string => {
  if (!value) {
    return ''
  }

  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(date)
}
