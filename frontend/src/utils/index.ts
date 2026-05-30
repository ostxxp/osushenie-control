// Placeholder for utility functions
// Add date formatters, validators, etc.

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
