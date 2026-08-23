import { useEffect, useId, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { formatTripDayLabel } from '../services/tripDates'
import { useEnterExit } from '../../../shared/hooks/useEnterExit'
import { glassPopoverSurfaceClass } from '../../../shared/styles/glassCapsule'
import { useTranslation } from '../../../shared/i18n'

interface Props {
  value: string
  onChange: (iso: string) => void
  label?: string
  placeholder?: string
  min?: string
  id?: string
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'] as const

function toIso(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function parseIso(iso: string): { y: number; m: number; d: number } | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const date = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(date.getTime())) return null
  const [y, m, d] = iso.split('-').map(Number)
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
  label,
  placeholder,
  min,
  id: idProp,
}: Props) {
  const autoId = useId()
  const id = idProp ?? autoId
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const { t } = useTranslation()
  const resolvedPlaceholder = placeholder ?? t('common.selectDateAria')

  const parsed = parseIso(value)
  const today = todayIso()
  const viewAnchor = parsed ?? parseIso(min || today) ?? parseIso(today)!
  const [viewY, setViewY] = useState(viewAnchor.y)
  const [viewM, setViewM] = useState(viewAnchor.m)

  const minParsed = min ? parseIso(min) : null

  useEffect(() => {
    if (!open) return
    const next = parseIso(value) ?? parseIso(min || todayIso()) ?? parseIso(todayIso())!
    setViewY(next.y)
    setViewM(next.m)
  }, [open, value, min])

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
    if (!min) return false
    return iso < min
  }

  function selectDay(iso: string) {
    if (isDisabled(iso)) return
    onChange(iso)
    setOpen(false)
  }

  const firstWeekday = new Date(viewY, viewM, 1).getDay()
  const totalDays = daysInMonth(viewY, viewM)
  const cells: Array<{ iso: string; day: number } | null> = []
  for (let i = 0; i < firstWeekday; i++) cells.push(null)
  for (let day = 1; day <= totalDays; day++) {
    cells.push({ iso: toIso(viewY, viewM, day), day })
  }

  const selected = Boolean(value)
  const displayText = selected ? formatTripDayLabel(value) : placeholder
  const yearHint = parsed ? `${parsed.y}年` : ''

  const popover = useEnterExit('popover')

  return (
    <div ref={rootRef} className={`relative block text-sm ${open ? 'z-50' : 'z-30'}`}>
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
          'mt-1 flex w-full items-center justify-between gap-2 rounded-xl border bg-white/85 px-3.5 py-2 text-left outline-none transition backdrop-blur-md shadow-xs',
          open
            ? 'border-[var(--sage)] shadow-[0_0_0_3px_rgba(74,99,86,0.14)]'
            : 'border-[var(--mist)] hover:border-[var(--sage)]/60 focus:border-[var(--sage)]',
        ].join(' ')}
      >
        <span className={selected ? 'text-[var(--ink)] font-medium' : 'text-[var(--stone)]'}>
          {yearHint && (
            <span className="mr-1.5 text-[var(--stone)]">{yearHint}</span>
          )}
          {displayText}
        </span>
        <CalendarDays className="h-4 w-4 shrink-0 text-[var(--copper)]" strokeWidth={1.75} aria-hidden />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label={label ? t('common.monthCalendarAria', { label }) : resolvedPlaceholder}
            initial={popover.initial}
            animate={popover.animate}
            exit={popover.exit}
            transition={popover.transition}
            className={`absolute left-0 top-full z-[60] mt-2 w-[min(100%,21rem)] ${glassPopoverSurfaceClass} p-3.5 shadow-[0_20px_50px_rgba(0,0,0,0.12),0_4px_16px_rgba(0,0,0,0.04)]`}
          >
            {/* Calendar Month Header */}
            <div className="mb-2.5 flex items-center justify-between gap-2 px-1">
              <button
                type="button"
                aria-label={t('common.prevMonthAria')}
                onClick={() => shiftMonth(-1)}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-black/5 bg-white/70 text-[var(--stone)] shadow-xs transition-colors hover:bg-white hover:text-[var(--ink)] active:scale-95"
              >
                <ChevronLeft size={15} aria-hidden />
              </button>
              <p className="font-display text-base font-semibold tracking-wide text-[var(--ink)]">
                {monthLabel(viewY, viewM)}
              </p>
              <button
                type="button"
                aria-label={t('common.nextMonthAria')}
                onClick={() => shiftMonth(1)}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-black/5 bg-white/70 text-[var(--stone)] shadow-xs transition-colors hover:bg-white hover:text-[var(--ink)] active:scale-95"
              >
                <ChevronRight size={15} aria-hidden />
              </button>
            </div>

            {/* Weekdays Row */}
            <div className="mb-1.5 grid grid-cols-7 text-center text-[11px] font-semibold text-[var(--stone)]">
              {WEEKDAYS.map((w) => (
                <div key={w} className="py-1">
                  {w}
                </div>
              ))}
            </div>

            {/* Date Grid with Smooth Animated Height */}
            <motion.div layout transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }} className="grid grid-cols-7 gap-y-1">
              {cells.map((cell, i) => {
                if (!cell) {
                  return <div key={`e-${i}`} className="aspect-square" />
                }
                const disabled = isDisabled(cell.iso)
                const isSelected = cell.iso === value
                const isToday = cell.iso === today
                return (
                  <div key={cell.iso} className="relative aspect-square flex items-center justify-center">
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => selectDay(cell.iso)}
                      className={[
                        'relative z-10 flex h-8 w-8 items-center justify-center rounded-full text-xs tabular-nums outline-none transition-colors duration-150',
                        disabled
                          ? 'cursor-not-allowed text-[var(--mist)]'
                          : isSelected
                            ? 'bg-[var(--copper)] text-white shadow-[0_2px_8px_rgba(181,106,60,0.35)] ring-2 ring-white font-bold'
                            : isToday
                              ? 'font-bold text-[var(--copper)] ring-1.5 ring-[var(--copper)]/50 bg-[var(--copper)]/8'
                              : 'text-[var(--ink)] font-medium hover:bg-black/5',
                      ].join(' ')}
                    >
                      {cell.day}
                    </button>
                  </div>
                )
              })}
            </motion.div>

            {minParsed && (
              <motion.p layout transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }} className="mt-2.5 pt-2 border-t border-black/5 text-center text-[11px] text-[var(--stone)]">
                不可早于 {formatTripDayLabel(min!)}
              </motion.p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
