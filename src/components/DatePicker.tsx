import { useEffect, useId, useRef, useState } from 'react'
import { formatTripDayLabel } from '../services/tripDates'

interface Props {
  value: string
  onChange: (isoDate: string) => void
  min?: string
  label?: string
  placeholder?: string
  id?: string
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'] as const

function toIso(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function parseIso(iso: string): { y: number; m: number; d: number } | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(date.getTime())) return null
  return { y, m: m - 1, d }
}

function todayIso(): string {
  const now = new Date()
  return toIso(now.getFullYear(), now.getMonth(), now.getDate())
}

function daysInMonth(y: number, m: number): number {
  return new Date(y, m + 1, 0).getDate()
}

function monthLabel(y: number, m: number): string {
  return `${y}年${m + 1}月`
}

export function DatePicker({
  value,
  onChange,
  min,
  label,
  placeholder = '选择日期',
  id: idProp,
}: Props) {
  const autoId = useId()
  const id = idProp ?? autoId
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)

  const selected = parseIso(value)
  const minParsed = min ? parseIso(min) : null
  const today = todayIso()

  const initialView = selected ?? parseIso(today)!
  const [viewY, setViewY] = useState(initialView.y)
  const [viewM, setViewM] = useState(initialView.m)

  useEffect(() => {
    if (!open) return
    const next = selected ?? parseIso(today)!
    setViewY(next.y)
    setViewM(next.m)
  }, [open, value])

  useEffect(() => {
    if (!open) return

    function onPointerDown(e: MouseEvent | PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  function shiftMonth(delta: number) {
    const d = new Date(viewY, viewM + delta, 1)
    setViewY(d.getFullYear())
    setViewM(d.getMonth())
  }

  function isDisabled(iso: string): boolean {
    return Boolean(min && iso < min)
  }

  function selectDay(iso: string) {
    if (isDisabled(iso)) return
    onChange(iso)
    setOpen(false)
  }

  const firstWeekday = new Date(viewY, viewM, 1).getDay()
  const totalDays = daysInMonth(viewY, viewM)
  const cells: Array<{ iso: string; day: number; inMonth: true } | null> = []
  for (let i = 0; i < firstWeekday; i++) cells.push(null)
  for (let day = 1; day <= totalDays; day++) {
    cells.push({ iso: toIso(viewY, viewM, day), day, inMonth: true })
  }

  const displayText = selected ? formatTripDayLabel(value) : placeholder
  const yearHint = selected ? `${selected.y}年` : null

  return (
    <div ref={rootRef} className="relative block text-sm">
      {label && (
        <label htmlFor={id} className="text-[var(--stone)]">
          {label}
        </label>
      )}
      <button
        type="button"
        id={id}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={[
          'mt-1 flex w-full items-center justify-between gap-2 rounded-xl border bg-white/80 px-3 py-2 text-left outline-none transition',
          open
            ? 'border-[var(--sage)] shadow-[0_0_0_3px_rgba(74,99,86,0.12)]'
            : 'border-[var(--mist)] hover:border-[var(--sage)]/60 focus:border-[var(--sage)]',
        ].join(' ')}
      >
        <span className={selected ? 'text-[var(--ink)]' : 'text-[var(--stone)]'}>
          {yearHint && (
            <span className="mr-1.5 text-[var(--stone)]">{yearHint}</span>
          )}
          {displayText}
        </span>
        <svg
          aria-hidden
          viewBox="0 0 20 20"
          className="h-4 w-4 shrink-0 text-[var(--sage)]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        >
          <rect x="3" y="4.5" width="14" height="12" rx="2" />
          <path d="M3 8.5h14M7 2.5v3M13 2.5v3" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={label ? `${label}日历` : '选择日期'}
          className="absolute left-0 z-40 mt-2 w-[min(100%,20rem)] origin-top animate-fade-up rounded-2xl border border-white/70 bg-[#fffcf7] p-3 shadow-[var(--shadow)]"
          style={{ animationDuration: '0.22s' }}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <button
              type="button"
              aria-label="上一个月"
              onClick={() => shiftMonth(-1)}
              className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--sage)] transition hover:bg-[var(--sage)]/10"
            >
              ‹
            </button>
            <p className="font-display text-lg tracking-wide text-[var(--ink)]">
              {monthLabel(viewY, viewM)}
            </p>
            <button
              type="button"
              aria-label="下一个月"
              onClick={() => shiftMonth(1)}
              className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--sage)] transition hover:bg-[var(--sage)]/10"
            >
              ›
            </button>
          </div>

          <div className="mb-1 grid grid-cols-7 gap-0.5 text-center text-xs text-[var(--stone)]">
            {WEEKDAYS.map((w) => (
              <div key={w} className="py-1 font-medium">
                {w}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((cell, i) => {
              if (!cell) {
                return <div key={`e-${i}`} className="aspect-square" />
              }
              const disabled = isDisabled(cell.iso)
              const isSelected = cell.iso === value
              const isToday = cell.iso === today
              return (
                <button
                  key={cell.iso}
                  type="button"
                  disabled={disabled}
                  onClick={() => selectDay(cell.iso)}
                  className={[
                    'aspect-square rounded-xl text-sm transition outline-none',
                    disabled
                      ? 'cursor-not-allowed text-[var(--mist)]'
                      : 'hover:bg-[var(--sage)]/12 focus-visible:ring-2 focus-visible:ring-[var(--sage)]/40',
                    isSelected
                      ? 'bg-[var(--copper)] font-medium text-[var(--paper)] hover:bg-[var(--copper)]'
                      : isToday
                        ? 'font-medium text-[var(--sage)] ring-1 ring-[var(--sage)]/35'
                        : 'text-[var(--ink)]',
                  ].join(' ')}
                >
                  {cell.day}
                </button>
              )
            })}
          </div>

          {minParsed && (
            <p className="mt-2 text-center text-[11px] text-[var(--stone)]">
              不可早于 {formatTripDayLabel(min!)}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
