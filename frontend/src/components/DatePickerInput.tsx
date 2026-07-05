import { useEffect, useId, useMemo, useRef, useState } from 'react'

type DatePickerInputProps = {
  value: string
  inputValue: string
  onChange: (value: string, inputValue: string) => void
  min?: string
  max?: string
  placeholder?: string
  ariaLabel?: string
}

const normalizeDateParts = (year: number, month: number, day: number): string => {
  const date = new Date(year, month - 1, day)

  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) {
    return ''
  }

  return [
    String(year).padStart(4, '0'),
    String(month).padStart(2, '0'),
    String(day).padStart(2, '0'),
  ].join('-')
}

const parseDateInput = (value: string): string => {
  const match = value.trim().match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/)
  if (!match) return ''

  return normalizeDateParts(Number(match[3]), Number(match[2]), Number(match[1]))
}

export const formatDateInputValue = (value: string): string => {
  if (!value) return ''

  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return ''

  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

const formatTypedDate = (value: string): string => {
  const digits = value.replace(/\D/g, '').slice(0, 8)
  return [
    digits.slice(0, 2),
    digits.slice(2, 4),
    digits.slice(4, 8),
  ].filter(Boolean).join('.')
}

const toLocalDateValue = (date: Date): string => [
  String(date.getFullYear()).padStart(4, '0'),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0'),
].join('-')

const getCalendarDays = (month: Date): Date[] => {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1)
  const mondayOffset = (firstDay.getDay() + 6) % 7
  const gridStart = new Date(
    firstDay.getFullYear(),
    firstDay.getMonth(),
    firstDay.getDate() - mondayOffset,
  )

  return Array.from({ length: 42 }, (_, index) => (
    new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index)
  ))
}

function DatePickerInput({
  value,
  inputValue,
  onChange,
  min,
  max,
  placeholder = 'ДД.ММ.ГГГГ',
  ariaLabel = 'Выберите дату',
}: DatePickerInputProps) {
  const [calendarOpen, setCalendarOpen] = useState(false)
  const errorId = useId()
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const initialDate = value ? new Date(`${value}T00:00:00`) : new Date()
    return new Date(initialDate.getFullYear(), initialDate.getMonth(), 1)
  })
  const containerRef = useRef<HTMLDivElement>(null)
  const calendarDays = useMemo(() => getCalendarDays(calendarMonth), [calendarMonth])
  const calendarMonthLabel = useMemo(() => {
    const month = new Intl.DateTimeFormat('ru-RU', { month: 'long' }).format(calendarMonth)
    return month.charAt(0).toUpperCase() + month.slice(1)
  }, [calendarMonth])
  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear()
    const calendarYear = calendarMonth.getFullYear()
    const minYear = min ? Number(min.slice(0, 4)) : 1900
    const maxYear = max ? Number(max.slice(0, 4)) : currentYear + 100
    const firstYear = Math.min(minYear, calendarYear)
    const lastYear = Math.max(maxYear, calendarYear)

    return Array.from(
      { length: lastYear - firstYear + 1 },
      (_, index) => lastYear - index,
    )
  }, [calendarMonth, max, min])

  const isAllowedDate = (dateValue: string) => (
    (!min || dateValue >= min) && (!max || dateValue <= max)
  )
  const parsedInputValue = parseDateInput(inputValue)
  const inputInvalid = inputValue.length === 10
    && (!parsedInputValue || !isAllowedDate(parsedInputValue))

  useEffect(() => {
    const closeCalendar = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setCalendarOpen(false)
      }
    }

    document.addEventListener('mousedown', closeCalendar)
    return () => document.removeEventListener('mousedown', closeCalendar)
  }, [])

  useEffect(() => {
    if (!value) return

    const selectedDate = new Date(`${value}T00:00:00`)
    setCalendarMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1))
  }, [value])

  const selectDate = (date: Date) => {
    const nextValue = toLocalDateValue(date)
    if (!isAllowedDate(nextValue)) return

    onChange(nextValue, formatDateInputValue(nextValue))
    setCalendarMonth(new Date(date.getFullYear(), date.getMonth(), 1))
    setCalendarOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        className={[
          'input min-h-0 w-full rounded-lg bg-white pr-10 text-sm text-slate-900 placeholder:text-base-content/50 focus:outline-none',
          inputInvalid
            ? 'border-red-400 focus:border-red-500'
            : 'border-base-300 focus:border-[#ff4539]',
        ].join(' ')}
        value={inputValue}
        onChange={(event) => {
          const nextInputValue = formatTypedDate(event.target.value)
          const parsedValue = parseDateInput(nextInputValue)
          const nextValue = parsedValue && isAllowedDate(parsedValue) ? parsedValue : ''

          onChange(nextValue, nextInputValue)
          setCalendarOpen(true)

          if (nextValue) {
            const date = new Date(`${nextValue}T00:00:00`)
            setCalendarMonth(new Date(date.getFullYear(), date.getMonth(), 1))
          }
        }}
        onFocus={() => setCalendarOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setCalendarOpen(false)
            event.currentTarget.blur()
          }

          if (event.key === 'Enter' && value) {
            setCalendarOpen(false)
          }
        }}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-invalid={inputInvalid}
        aria-describedby={inputInvalid ? errorId : undefined}
        inputMode="numeric"
        maxLength={10}
      />
      <button
        type="button"
        className="absolute inset-y-0 right-0 flex items-center rounded-r-lg px-3 text-base-content/50 transition hover:text-base-content"
        onClick={() => setCalendarOpen((isOpen) => !isOpen)}
        aria-label={`Открыть календарь: ${ariaLabel}`}
        aria-expanded={calendarOpen}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M8 2V5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M16 2V5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M3.5 9.09H20.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M18 4H6C4.62 4 3.5 5.12 3.5 6.5V18C3.5 19.38 4.62 20.5 6 20.5H18C19.38 20.5 20.5 19.38 20.5 18V6.5C20.5 5.12 19.38 4 18 4Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      </button>

      {calendarOpen && (
        <div className="absolute left-0 top-full z-40 mt-2 w-[20rem] max-w-[calc(100vw-2rem)] rounded-2xl border border-base-200 bg-white p-4 shadow-xl">
          <div className="mb-4 flex items-center justify-between">
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-xl text-base-content/60 transition hover:bg-base-300 hover:text-base-content"
              onClick={() => setCalendarMonth((month) => (
                new Date(month.getFullYear(), month.getMonth() - 1, 1)
              ))}
              aria-label="Предыдущий месяц"
            >
              <span aria-hidden="true">‹</span>
            </button>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <span>{calendarMonthLabel}</span>
              <select
                className="rounded-lg border border-base-300 bg-white px-2 py-1 text-sm font-semibold outline-none transition focus:border-[#ff4539]"
                value={calendarMonth.getFullYear()}
                onChange={(event) => setCalendarMonth((month) => (
                  new Date(Number(event.target.value), month.getMonth(), 1)
                ))}
                aria-label="Выберите год"
              >
                {yearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year} г.
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-xl text-base-content/60 transition hover:bg-base-300 hover:text-base-content"
              onClick={() => setCalendarMonth((month) => (
                new Date(month.getFullYear(), month.getMonth() + 1, 1)
              ))}
              aria-label="Следующий месяц"
            >
              <span aria-hidden="true">›</span>
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center">
            {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((dayName) => (
              <div key={dayName} className="py-1 text-xs font-medium text-base-content/45">
                {dayName}
              </div>
            ))}
            {calendarDays.map((date) => {
              const dateValue = toLocalDateValue(date)
              const isSelected = dateValue === value
              const isToday = dateValue === toLocalDateValue(new Date())
              const isCurrentMonth = date.getMonth() === calendarMonth.getMonth()
              const isDisabled = !isAllowedDate(dateValue)

              return (
                <button
                  type="button"
                  key={dateValue}
                  className={[
                    'flex aspect-square items-center justify-center rounded-xl text-sm transition',
                    isSelected
                      ? 'bg-[#ff4539] font-semibold text-white shadow-sm'
                      : 'hover:bg-base-300',
                    !isSelected && !isCurrentMonth ? 'text-base-content/30' : '',
                    !isSelected && isToday ? 'font-semibold text-[#ff4539] ring-1 ring-[#ff4539]/30' : '',
                    isDisabled ? 'cursor-not-allowed opacity-25 hover:bg-transparent' : '',
                  ].join(' ')}
                  onClick={() => selectDate(date)}
                  disabled={isDisabled}
                  aria-label={new Intl.DateTimeFormat('ru-RU', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  }).format(date)}
                  aria-pressed={isSelected}
                >
                  {date.getDate()}
                </button>
              )
            })}
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-base-200 pt-3">
            <button
              type="button"
              className="rounded-lg px-3 py-2 text-xs font-medium text-base-content/60 transition hover:bg-base-300 hover:text-base-content"
              onClick={() => onChange('', '')}
            >
              Очистить
            </button>
            <button
              type="button"
              className="rounded-lg px-3 py-2 text-xs font-semibold text-[#ff4539] transition hover:bg-[#ff4539]/10 disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => selectDate(new Date())}
              disabled={!isAllowedDate(toLocalDateValue(new Date()))}
            >
              Сегодня
            </button>
          </div>

          {inputInvalid && (
            <p id={errorId} className="mt-2 text-xs text-red-600">
              Введите допустимую дату в формате ДД.ММ.ГГГГ
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default DatePickerInput
