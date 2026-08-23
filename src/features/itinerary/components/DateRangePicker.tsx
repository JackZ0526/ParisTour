import { useEffect, useId, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { formatTripDayLabel } from '../services/tripDates'
import { useReducedMotion } from '../../../shared/hooks/useReducedMotion'
import {
  glassPopoverSurfaceClass,
  glassCapsuleSurfaceClass,
  glassCapsuleToneClass,
} from '../../../shared/styles/glassCapsule'
import { useTranslation, type Locale } from '../../../shared/i18n'

export interface DateRangeValue {
  startDate: string
  endDate: string
}

interface Props {
  value: DateRangeValue | null
  onChange: (range: DateRangeValue | null) => void
  label?: string
  placeholder?: string
  id?: string
}

const WEEKDAYS_ZH = ['日', '一', '二', '三', '四', '五', '六'] as const
const WEEKDAYS_EN = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const

const MONTH_LONG_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

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

function monthLabel(y: number, m: number, locale: Locale): string {
  if (locale === 'en') {
    return `${MONTH_LONG_EN[m]} ${y}`
  }
  return `${y}年${m + 1}月`
}

function formatRangeTrigger(start: string, end: string, locale: Locale): string {
  const a = parseIso(start)
  const b = parseIso(end)
  if (!a || !b) return `${formatTripDayLabel(start, locale)} – ${formatTripDayLabel(end, locale)}`
  if (locale === 'en') {
    if (a.y === b.y) {
      return `${formatTripDayLabel(start, 'en')} – ${formatTripDayLabel(end, 'en')}, ${a.y}`
    }
    return `${formatTripDayLabel(start, 'en')}, ${a.y} – ${formatTripDayLabel(end, 'en')}, ${b.y}`
  }
  if (a.y === b.y) {
    return `${formatTripDayLabel(start, 'zh-CN')} – ${formatTripDayLabel(end, 'zh-CN')}`
  }
  return `${a.y}年${formatTripDayLabel(start, 'zh-CN')} – ${b.y}年${formatTripDayLabel(end, 'zh-CN')}`
}

/**
 * Expedia-style range calendar: first click = start, second = end.
 * If the second click is before start, it becomes the new start.
 */
export function DateRangePicker({
  value,
  onChange,
  label,
  placeholder,
  id: idProp,
}: Props) {
  const { t, locale } = useTranslation()
  const defaultPlaceholder = t('itinerary.dateRangePlaceholder')
  const autoId = useId()
  const id = idProp ?? autoId
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)

  const [draftStart, setDraftStart] = useState(value?.startDate || '')
  const [draftEnd, setDraftEnd] = useState(value?.endDate || '')
  /** After choosing start, waiting for end. */
  const [pickingEnd, setPickingEnd] = useState(false)
  const [hoverIso, setHoverIso] = useState<string | null>(null)

  const today = todayIso()
  const committedStart = value?.startDate || ''
  const committedEnd = value?.endDate || ''
  const hasCommitted = Boolean(committedStart && committedEnd)

  const viewAnchor =
    parseIso(draftStart || committedStart || today) ?? parseIso(today)!
  const [viewY, setViewY] = useState(viewAnchor.y)
  const [viewM, setViewM] = useState(viewAnchor.m)
  const [monthSlideDirection, setMonthSlideDirection] = useState<1 | -1>(1)

  useEffect(() => {
    if (!open) {
      setDraftStart(value?.startDate || '')
      setDraftEnd(value?.endDate || '')
      setPickingEnd(false)
      setHoverIso(null)
      return
    }
    const next =
      parseIso(value?.startDate || '') ??
      parseIso(todayIso())!
    setViewY(next.y)
    setViewM(next.m)
    setDraftStart(value?.startDate || '')
    setDraftEnd(value?.endDate || '')
    setPickingEnd(false)
    setHoverIso(null)
  }, [open, value?.startDate, value?.endDate])

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
    setMonthSlideDirection(delta > 0 ? 1 : -1)
    const d = new Date(viewY, viewM + delta, 1)
    setViewY(d.getFullYear())
    setViewM(d.getMonth())
  }

  function selectDay(iso: string) {
    // First click (or restart): set start, clear end, wait for end.
    if (!pickingEnd || !draftStart) {
      setDraftStart(iso)
      setDraftEnd('')
      setPickingEnd(true)
      setHoverIso(null)
      return
    }

    // Second click before start → new start (Expedia).
    if (iso < draftStart) {
      setDraftStart(iso)
      setDraftEnd('')
      setPickingEnd(true)
      setHoverIso(null)
      return
    }

    // Complete range.
    setDraftEnd(iso)
    setPickingEnd(false)
    setHoverIso(null)
    onChange({ startDate: draftStart, endDate: iso })
    setOpen(false)
  }

  const previewEnd =
    pickingEnd && draftStart && hoverIso && hoverIso >= draftStart
      ? hoverIso
      : draftEnd

  const rangeStart = draftStart
  const rangeEnd = previewEnd || (pickingEnd ? '' : draftEnd)

  function dayTone(iso: string): {
    isStart: boolean
    isEnd: boolean
    inRange: boolean
    isToday: boolean
  } {
    const isStart = Boolean(rangeStart && iso === rangeStart)
    const isEnd = Boolean(rangeEnd && iso === rangeEnd)
    const inRange = Boolean(
      rangeStart &&
        rangeEnd &&
        iso > rangeStart &&
        iso < rangeEnd,
    )
    return { isStart, isEnd, inRange, isToday: iso === today }
  }

  const firstWeekday = new Date(viewY, viewM, 1).getDay()
  const totalDays = daysInMonth(viewY, viewM)
  const cells: Array<{ iso: string; day: number } | null> = []
  for (let i = 0; i < firstWeekday; i++) cells.push(null)
  for (let day = 1; day <= totalDays; day++) {
    cells.push({ iso: toIso(viewY, viewM, day), day })
  }

  const displayText = hasCommitted
    ? formatRangeTrigger(committedStart, committedEnd, locale)
    : (placeholder || defaultPlaceholder)

  const hint = pickingEnd
    ? t('itinerary.clickAgainReturn')
    : open
      ? t('itinerary.selectDepartThenReturn')
      : null

  const reduce = useReducedMotion()
  const popoverAnim = {
    initial: { opacity: 0, y: -6 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -4 },
    transition: reduce
      ? { duration: 0.01 }
      : { duration: 0.16, ease: [0.16, 1, 0.3, 1] as const },
  }

  const monthSlideVariants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 24 : -24,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (direction: number) => ({
      x: direction > 0 ? -24 : 24,
      opacity: 0,
    }),
  }

  const weekdays = locale === 'en' ? WEEKDAYS_EN : WEEKDAYS_ZH

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
          'mt-1 flex w-full items-center justify-between gap-2 rounded-xl border bg-white/85 dark:bg-[#18201c]/85 px-3.5 py-2.5 text-left outline-none transition backdrop-blur-md shadow-xs',
          open
            ? 'border-[var(--sage)] shadow-[0_0_0_3px_rgba(74,99,86,0.14)]'
            : 'border-[var(--mist)] hover:border-[var(--sage)]/60 focus:border-[var(--sage)]',
        ].join(' ')}
      >
        <span className={hasCommitted ? 'text-[var(--ink)] font-medium' : 'text-[var(--stone)]'}>
          {displayText}
        </span>
        <CalendarDays className="h-4 w-4 shrink-0 text-[var(--copper)]" strokeWidth={1.75} aria-hidden />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label={label ? `${label}` : t('itinerary.selectDatesAria')}
            initial={popoverAnim.initial}
            animate={popoverAnim.animate}
            exit={popoverAnim.exit}
            transition={popoverAnim.transition}
            className={`absolute left-0 top-full z-[60] mt-2 w-[min(100%,21rem)] ${glassPopoverSurfaceClass} p-3.5 shadow-[0_20px_50px_rgba(0,0,0,0.12),0_4px_16px_rgba(0,0,0,0.04)]`}
          >
            {/* Calendar Month Header */}
            <div className="mb-2.5 flex items-center justify-between gap-2 px-1">
              <button
                type="button"
                aria-label={t('itinerary.prevMonth')}
                onClick={() => shiftMonth(-1)}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-black/5 dark:border-white/10 bg-white/70 dark:bg-white/10 text-[var(--stone)] shadow-xs transition-colors hover:bg-white dark:hover:bg-white/20 hover:text-[var(--ink)] active:scale-95"
              >
                <ChevronLeft size={15} aria-hidden />
              </button>
              <p className="font-display text-base font-semibold tracking-wide text-[var(--ink)]">
                {monthLabel(viewY, viewM, locale)}
              </p>
              <button
                type="button"
                aria-label={t('itinerary.nextMonth')}
                onClick={() => shiftMonth(1)}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-black/5 dark:border-white/10 bg-white/70 dark:bg-white/10 text-[var(--stone)] shadow-xs transition-colors hover:bg-white dark:hover:bg-white/20 hover:text-[var(--ink)] active:scale-95"
              >
                <ChevronRight size={15} aria-hidden />
              </button>
            </div>

            {/* Weekdays Row */}
            <div className="mb-1.5 grid grid-cols-7 text-center text-[11px] font-semibold text-[var(--stone)]">
              {weekdays.map((w) => (
                <div key={w} className="py-1">
                  {w}
                </div>
              ))}
            </div>

            {/* Date Grid with Smooth Animated Height Container */}
            <motion.div
              layout
              transition={
                reduce
                  ? { duration: 0.01 }
                  : { duration: 0.25, ease: [0.22, 1, 0.36, 1] }
              }
              className="relative overflow-hidden"
            >
              <AnimatePresence mode="popLayout" custom={monthSlideDirection} initial={false}>
                <motion.div
                  key={`${viewY}-${viewM}`}
                  custom={monthSlideDirection}
                  variants={monthSlideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={
                    reduce
                      ? { duration: 0.01 }
                      : { duration: 0.22, ease: [0.22, 1, 0.36, 1] }
                  }
                  className="grid grid-cols-7 gap-y-1"
                  onMouseLeave={() => setHoverIso(null)}
                >
                  {cells.map((cell, i) => {
                    if (!cell) {
                      return <div key={`e-${i}`} className="aspect-square" />
                    }
                    const colIndex = i % 7
                    const { isStart, isEnd, inRange, isToday } = dayTone(cell.iso)
                    const hasSpan = Boolean(rangeStart && rangeEnd && rangeStart !== rangeEnd)

                    return (
                      <div
                        key={cell.iso}
                        className="relative aspect-square flex items-center justify-center"
                      >
                        {/* Range Connector Ribbon Strip */}
                        {hasSpan && (
                          <>
                            {isStart && (
                              <div
                                className="pointer-events-none absolute inset-y-1.5 left-1/2 right-0 bg-[#e7efe9]/90 dark:bg-[#668b7a]/25 z-0"
                              />
                            )}
                            {isEnd && (
                              <div
                                className="pointer-events-none absolute inset-y-1.5 left-0 right-1/2 bg-[#e7efe9]/90 dark:bg-[#668b7a]/25 z-0"
                              />
                            )}
                            {inRange && (
                              <div
                                className={`pointer-events-none absolute inset-y-1.5 inset-x-0 bg-[#e7efe9]/90 dark:bg-[#668b7a]/25 z-0 ${
                                  colIndex === 0 ? 'rounded-l-full' : ''
                                } ${colIndex === 6 ? 'rounded-r-full' : ''}`}
                              />
                            )}
                          </>
                        )}

                        {/* Day Number Button */}
                        <button
                          type="button"
                          onClick={() => selectDay(cell.iso)}
                          onMouseEnter={() => {
                            if (pickingEnd) setHoverIso(cell.iso)
                          }}
                          className={[
                            'relative z-10 flex h-8 w-8 items-center justify-center rounded-full text-xs tabular-nums outline-none transition-colors duration-150',
                            isStart
                              ? 'bg-[var(--copper)] text-white shadow-[0_2px_8px_rgba(181,106,60,0.35)] ring-2 ring-white dark:ring-[#18201c] font-bold'
                              : isEnd
                                ? 'bg-[var(--sage)] text-white shadow-[0_2px_8px_rgba(74,99,86,0.35)] ring-2 ring-white dark:ring-[#18201c] font-bold'
                                : inRange
                                  ? 'text-[var(--ink)] font-semibold hover:bg-white/80 dark:hover:bg-white/15'
                                  : isToday
                                    ? 'font-bold text-[var(--copper)] ring-1.5 ring-[var(--copper)]/50 bg-[var(--copper)]/8'
                                    : 'text-[var(--ink)] font-medium hover:bg-black/5 dark:hover:bg-white/10',
                          ].join(' ')}
                        >
                          {cell.day}
                        </button>
                      </div>
                    )
                  })}
                </motion.div>
              </AnimatePresence>
            </motion.div>

            {/* Bottom Legend & Hint Footer */}
            <motion.div
              layout
              transition={
                reduce
                  ? { duration: 0.01 }
                  : { duration: 0.25, ease: [0.22, 1, 0.36, 1] }
              }
              className="mt-2.5 pt-2.5 border-t border-black/5 dark:border-white/10 flex items-center justify-between gap-2 text-[11px] text-[var(--stone)] px-1"
            >
              <span className="inline-flex items-center gap-2">
                <span className={`${glassCapsuleSurfaceClass} ${glassCapsuleToneClass.copper} inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-[var(--copper)] font-medium`}>
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--copper)]" />
                  {t('itinerary.depart')}
                </span>
                <span className={`${glassCapsuleSurfaceClass} ${glassCapsuleToneClass.sage} inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-[var(--sage)] font-medium`}>
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--sage)]" />
                  {t('itinerary.return')}
                </span>
              </span>
              {hint && <span className="font-medium text-[var(--ink)]">{hint}</span>}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
