import { useEffect, useRef, useState } from 'react'

export type StyledSelectOption = { value: string; label: string; disabled?: boolean }

type StyledSelectProps = {
  value: string
  options: StyledSelectOption[]
  onChange: (value: string) => void
  ariaLabel?: string
  className?: string
}

export default function StyledSelect({ value, options, onChange, ariaLabel, className = '' }: StyledSelectProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const selected = options.find((option) => option.value === value) ?? options[0]

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        className="flex h-10 w-full items-center justify-between gap-3 rounded-xl border border-base-300 bg-white px-3 text-left text-sm text-slate-900 transition hover:border-slate-400 focus:border-[#ff4539] focus:outline-none focus:ring-2 focus:ring-[#ff4539]/15"
        onClick={() => setOpen((current) => !current)}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">{selected?.label ?? ''}</span>
        <svg
          className={`h-4 w-4 shrink-0 text-base-content/45 transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden="true"
        >
          <path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 right-0 z-50 mt-2 max-h-64 overflow-y-auto rounded-2xl border border-base-200 bg-white p-1.5 shadow-xl" role="listbox">
          {options.map((option) => (
            <button
              type="button"
              key={option.value}
              role="option"
              aria-selected={option.value === value}
              disabled={option.disabled}
              className={`block w-full rounded-xl px-3 py-2.5 text-left text-sm transition disabled:opacity-40 ${option.value === value ? 'bg-[#fff0ef] font-semibold text-[#d9362c]' : 'text-slate-700 hover:bg-slate-100'}`}
              onClick={() => { onChange(option.value); setOpen(false) }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
