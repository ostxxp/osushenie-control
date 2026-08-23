import { useEffect, useRef, useState } from 'react'

export type SearchableSelectOption = {
  value: string
  label: string
  description?: string
  disabled?: boolean
}

type SearchableSelectProps = {
  searchValue: string
  options: SearchableSelectOption[]
  onSearchChange: (value: string) => void
  onSelect: (value: string) => void
  placeholder?: string
  ariaLabel?: string
  emptyMessage?: string
  selectedValues?: string[]
  closeOnSelect?: boolean
  showSelectionAction?: boolean
  className?: string
}

export default function SearchableSelect({
  searchValue,
  options,
  onSearchChange,
  onSelect,
  placeholder,
  ariaLabel,
  emptyMessage = 'Ничего не найдено',
  selectedValues = [],
  closeOnSelect = true,
  showSelectionAction = false,
  className = '',
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const selected = new Set(selectedValues)

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <input
        ref={inputRef}
        type="text"
        className="h-10 w-full rounded-xl border border-base-300 bg-white px-3 pr-9 text-sm text-slate-900 outline-none transition placeholder:text-base-content/50 hover:border-slate-400 focus:border-[#ff4539] focus:ring-2 focus:ring-[#ff4539]/15"
        value={searchValue}
        onChange={(event) => {
          onSearchChange(event.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onMouseDown={() => {
          if (document.activeElement === inputRef.current) setOpen((current) => !current)
        }}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        role="combobox"
        autoComplete="off"
      />
      <svg
        className={`pointer-events-none absolute right-3 top-3 h-4 w-4 text-base-content/45 transition-transform ${open ? 'rotate-180' : ''}`}
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden="true"
      >
        <path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      </svg>

      {open && (
        <div className="absolute left-0 right-0 z-50 mt-2 max-h-64 overflow-y-auto rounded-2xl border border-base-200 bg-white p-1.5 shadow-xl" role="listbox">
          {options.length === 0 ? (
            <div className="px-3 py-2.5 text-sm text-base-content/60">{emptyMessage}</div>
          ) : options.map((option) => {
            const isSelected = selected.has(option.value)
            return (
              <button
                type="button"
                key={option.value}
                role="option"
                aria-selected={isSelected}
                disabled={option.disabled}
                className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition disabled:opacity-40 ${isSelected ? 'bg-[#fff0ef] text-[#d9362c]' : 'text-slate-700 hover:bg-slate-100'}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onSelect(option.value)
                  if (closeOnSelect) setOpen(false)
                }}
              >
                <span className="min-w-0">
                  <span className={`block truncate ${isSelected ? 'font-semibold' : 'font-medium'}`}>{option.label}</span>
                  {option.description && <span className="block truncate text-xs text-slate-500">{option.description}</span>}
                </span>
                {showSelectionAction && (
                  <span className={`badge shrink-0 ${isSelected ? 'badge-primary' : 'badge-outline'}`}>
                    {isSelected ? 'Выбрано' : 'Выбрать'}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
