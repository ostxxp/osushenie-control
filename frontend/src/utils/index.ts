// Placeholder for utility functions
// Add date formatters, validators, etc.

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
