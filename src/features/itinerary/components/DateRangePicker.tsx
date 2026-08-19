import { useEffect, useId, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { formatTripDayLabel } from '../services/tripDates'
import { useReducedMotion } from '../../../shared/hooks/useReducedMotion'

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

function formatRangeTrigger(start: string, end: string): string {
  const a = parseIso(start)
  const b = parseIso(end)
  if (!a || !b) return `${formatTripDayLabel(start)} – ${formatTripDayLabel(end)}`
  if (a.y === b.y) {
    return `${formatTripDayLabel(start)} – ${formatTripDayLabel(end)}`
  }
  return `${a.y}年${formatTripDayLabel(start)} – ${b.y}年${formatTripDayLabel(end)}`
}

/**
 * Expedia-style range calendar: first click = start, second = end.
 * If the second click is before start, it becomes the new start.
 */
export function DateRangePicker({
  value,
  onChange,
  label,
  placeholder = '出发 – 返程',
  id: idProp,
}: Props) {
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
    ? formatRangeTrigger(committedStart, committedEnd)
    : placeholder

  const hint = pickingEnd
    ? '再点一次选择返程日期'
    : open
      ? '先选出发日期，再选返程'
      : null

  const reduce = useReducedMotion()
  const popoverAnim = {
    initial: { opacity: 0, scaleY: 0.78, scaleX: 0.95, y: -8 },
    animate: { opacity: 1, scaleY: 1, scaleX: 1, y: 0 },
    exit: { opacity: 0, scaleY: 0.82, scaleX: 0.95, y: -6 },
    transition: reduce
      ? { duration: 0.01 }
      : { duration: 0.25, ease: [0.22, 1, 0.36, 1] as const },
  }

  const monthSlideVariants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 28 : -28,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (direction: number) => ({
      x: direction > 0 ? -28 : 28,
      opacity: 0,
    }),
  }

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
          'mt-1 flex w-full items-center justify-between gap-2 rounded-xl border bg-white/80 px-3 py-2.5 text-left outline-none transition',
          open
            ? 'border-[var(--sage)] shadow-[0_0_0_3px_rgba(74,99,86,0.12)]'
            : 'border-[var(--mist)] hover:border-[var(--sage)]/60 focus:border-[var(--sage)]',
        ].join(' ')}
      >
        <span className={hasCommitted ? 'text-[var(--ink)]' : 'text-[var(--stone)]'}>
          {displayText}
        </span>
        <CalendarDays className="h-4 w-4 shrink-0 text-[var(--sage)]" strokeWidth={1.6} aria-hidden />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label={label ? `${label}日历` : '选择行程日期'}
            initial={popoverAnim.initial}
            animate={popoverAnim.animate}
            exit={popoverAnim.exit}
            transition={popoverAnim.transition}
            style={{ transformOrigin: 'top left' }}
            className="absolute left-0 z-40 mt-2 w-[min(100%,20rem)] rounded-2xl border border-white/70 bg-[#fffcf7] p-3 shadow-[var(--shadow)]"
          >
          <div className="mb-2 flex items-center justify-between gap-2">
            <button
              type="button"
              aria-label="上一个月"
              onClick={() => shiftMonth(-1)}
              className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--sage)] transition hover:bg-[var(--sage)]/10"
            >
              <ChevronLeft size={17} aria-hidden />
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
              <ChevronRight size={17} aria-hidden />
            </button>
          </div>

          <div className="mb-1 grid grid-cols-7 gap-0.5 text-center text-xs text-[var(--stone)]">
            {WEEKDAYS.map((w) => (
              <div key={w} className="py-1 font-medium">
                {w}
              </div>
            ))}
          </div>

          <div className="relative overflow-hidden" style={{ minHeight: '190px' }}>
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
                className="grid grid-cols-7 gap-y-0.5"
                onMouseLeave={() => setHoverIso(null)}
              >
                {cells.map((cell, i) => {
                  if (!cell) {
                    return <div key={`e-${i}`} className="aspect-square" />
                  }
                  const { isStart, isEnd, inRange, isToday } = dayTone(cell.iso)
                  const hasSpan = Boolean(rangeStart && rangeEnd && rangeStart !== rangeEnd)
                  const railClass = !hasSpan
                    ? ''
                    : inRange
                      ? 'bg-[var(--sage)]/12'
                      : isStart
                        ? 'rounded-l-xl bg-[var(--sage)]/12'
                        : isEnd
                          ? 'rounded-r-xl bg-[var(--sage)]/12'
                          : ''

                  return (
                    <div
                      key={cell.iso}
                      className={['relative aspect-square', railClass].filter(Boolean).join(' ')}
                    >
                      <button
                        type="button"
                        onClick={() => selectDay(cell.iso)}
                        onMouseEnter={() => {
                          if (pickingEnd) setHoverIso(cell.iso)
                        }}
                        className={[
                          'relative z-[1] flex h-full w-full items-center justify-center rounded-xl text-sm transition outline-none',
                          'hover:bg-[var(--sage)]/12 focus-visible:ring-2 focus-visible:ring-[var(--sage)]/40',
                          isStart
                            ? 'bg-[var(--copper)] font-medium text-[var(--paper)] hover:bg-[var(--copper)]'
                            : isEnd
                              ? 'bg-[var(--sage)] font-medium text-[var(--paper)] hover:bg-[var(--sage)]'
                              : inRange
                                ? 'text-[var(--ink)] hover:bg-[var(--sage)]/18'
                                : isToday
                                  ? 'font-medium text-[var(--sage)] ring-1 ring-[var(--sage)]/35'
                                  : 'text-[var(--ink)]',
                        ].join(' ')}
                      >
                        {cell.day}
                      </button>
                    </div>
                  )
                })}
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-[var(--stone)]">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-[var(--copper)]" />
              出发
              <span className="inline-block h-2 w-2 rounded-full bg-[var(--sage)]" />
              返程
            </span>
            {hint && <span>{hint}</span>}
          </div>
        </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
