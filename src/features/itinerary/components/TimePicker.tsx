import { useEffect, useId, useRef, useState, type UIEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Clock3 } from 'lucide-react'

interface Props {
  value: string
  onChange: (time: string) => void
  label?: string
  id?: string
}

const HOURS = Array.from({ length: 24 }, (_, hour) => hour)
const MINUTES = Array.from({ length: 12 }, (_, index) => index * 5)

const ITEM_HEIGHT = 38 // 38px per item height
const VISIBLE_COUNT = 3 // 3 visible items in view window
const WHEEL_HEIGHT = ITEM_HEIGHT * VISIBLE_COUNT // 114px

function parseTime(value: string): { hour: number; minute: number } {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match) return { hour: 10, minute: 0 }
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return { hour: 10, minute: 0 }
  return { hour, minute }
}

function formatTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

interface WheelColumnProps<T extends number> {
  items: readonly T[]
  value: T
  onChange: (v: T) => void
  formatItem?: (v: T) => string
  ariaLabel: string
}

function TimeWheelColumn<T extends number>({
  items,
  value,
  onChange,
  formatItem = (v) => String(v).padStart(2, '0'),
  ariaLabel,
}: WheelColumnProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const isScrollingRef = useRef(false)
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Scroll to selected item on mount or when value changes externally
  useEffect(() => {
    const idx = items.indexOf(value)
    if (idx >= 0 && containerRef.current && !isScrollingRef.current) {
      containerRef.current.scrollTop = idx * ITEM_HEIGHT
    }
  }, [value, items])

  const handleScroll = (e: UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget
    isScrollingRef.current = true
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current)

    const index = Math.round(target.scrollTop / ITEM_HEIGHT)
    const clamped = Math.max(0, Math.min(index, items.length - 1))
    const selected = items[clamped]
    if (selected !== undefined && selected !== value) {
      onChange(selected)
    }

    scrollTimerRef.current = setTimeout(() => {
      isScrollingRef.current = false
    }, 150)
  }

  const handleItemClick = (idx: number) => {
    if (containerRef.current) {
      containerRef.current.scrollTo({
        top: idx * ITEM_HEIGHT,
        behavior: 'smooth',
      })
    }
    const selected = items[idx]
    if (selected !== undefined) {
      onChange(selected)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const idx = items.indexOf(value)
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      const prevIdx = Math.max(0, idx - 1)
      handleItemClick(prevIdx)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      const nextIdx = Math.min(items.length - 1, idx + 1)
      handleItemClick(nextIdx)
    }
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="listbox"
      aria-label={ariaLabel}
      style={{ height: `${WHEEL_HEIGHT}px` }}
      className="relative w-full snap-y snap-mandatory overflow-y-auto scroll-smooth select-none touch-pan-y outline-none focus-visible:ring-1 focus-visible:ring-[var(--copper)]/30 rounded-xl [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
    >
      {/* Top spacer (1 item height) to vertically center the first item in the lens */}
      <div style={{ height: `${ITEM_HEIGHT}px` }} aria-hidden />

      {items.map((item, idx) => {
        const isSelected = item === value
        return (
          <div
            key={item}
            role="option"
            aria-selected={isSelected}
            onClick={() => handleItemClick(idx)}
            style={{ height: `${ITEM_HEIGHT}px` }}
            className={`flex snap-center items-center justify-center text-center cursor-pointer transition-all duration-150 ${
              isSelected
                ? 'text-lg sm:text-xl font-bold text-[var(--ink)] scale-105'
                : 'text-sm font-medium text-[var(--stone)]/40 hover:text-[var(--stone)]/80 scale-90'
            }`}
          >
            <span className="tabular-nums font-mono leading-none">{formatItem(item)}</span>
          </div>
        )
      })}

      {/* Bottom spacer (1 item height) to vertically center the last item in the lens */}
      <div style={{ height: `${ITEM_HEIGHT}px` }} aria-hidden />
    </div>
  )
}

export function TimePicker({ value, onChange, label, id: idProp }: Props) {
  const autoId = useId()
  const id = idProp ?? autoId
  const [open, setOpen] = useState(false)
  const parsed = parseTime(value)
  const [draftHour, setDraftHour] = useState(parsed.hour)
  const [draftMinute, setDraftMinute] = useState(parsed.minute)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const next = parseTime(value)
    setDraftHour(next.hour)
    setDraftMinute(next.minute)
  }, [open, value])

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const minuteOptions = MINUTES.includes(draftMinute)
    ? MINUTES
    : [...MINUTES, draftMinute].sort((a, b) => a - b)

  return (
    <div ref={rootRef} className="relative block text-sm">
      {label && (
        <label htmlFor={id} className="font-medium text-[var(--ink)]">
          {label}
        </label>
      )}

      {/*
        Persistent Container:
        Seamlessly holds the persistent top anchor bar, expanding the hour/minute wheel selector below.
      */}
      <div
        className={`relative overflow-hidden rounded-2xl border transition-colors duration-200 ${
          open
            ? 'border-white/90 bg-white/95 shadow-[0_12px_32px_rgba(0,0,0,0.08),inset_0_1px_1.5px_rgba(255,255,255,1)] backdrop-blur-xl'
            : 'border-[var(--mist)]/80 bg-white/80 shadow-2xs hover:border-[var(--copper)]/60'
        }`}
      >
        {/* Persistent Top Bar Anchor (NEVER UNMOUNTS, 100% SPATIAL CONTINUITY) */}
        <button
          type="button"
          id={id}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen((prev) => !prev)}
          className="flex h-9 w-full items-center justify-between gap-2 px-2.5 py-1 text-left outline-none focus:outline-none focus-visible:outline-none cursor-pointer select-none"
        >
          <div className="flex items-center gap-2">
            {/* Time Capsule: High-end 3D Parisian Frosted Glass depth with 1px reflection highlight */}
            <span
              className={`relative overflow-hidden inline-flex items-center rounded-lg border px-2.5 py-0.5 text-sm font-semibold tabular-nums backdrop-blur-md transition-all duration-200 ${
                open
                  ? 'border-[#d7a98a]/80 bg-[#f6e8de]/85 text-[var(--copper)] shadow-[0_2px_8px_rgba(181,106,60,0.15),inset_0_1px_1.5px_rgba(255,255,255,1),inset_0_-1px_1px_rgba(255,255,255,0.6)] before:pointer-events-none before:absolute before:inset-x-2 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/90 before:to-transparent'
                  : 'border-transparent bg-transparent text-[var(--ink)]'
              }`}
            >
              {open ? formatTime(draftHour, draftMinute) : value}
            </span>

            {/* In-place subtitle fading in on the right of the time capsule */}
            <AnimatePresence>
              {open && (
                <motion.span
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -4 }}
                  transition={{ duration: 0.15 }}
                  className="text-xs font-medium text-[var(--stone)]"
                >
                  {label ? `选择${label}` : '选择开始时间'}
                </motion.span>
              )}
            </AnimatePresence>
          </div>

          <Clock3
            className={`h-4 w-4 shrink-0 transition-colors duration-200 ${
              open ? 'text-[var(--copper)]' : 'text-[var(--copper)]/80'
            }`}
            strokeWidth={1.8}
            aria-hidden
          />
        </button>

        {/* Expanded iOS Alarm-Style Rolling Wheel Selector */}
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden border-t border-[var(--mist)]/70 px-3.5 pb-3.5 pt-2"
            >
              {/* iOS Wheel Body */}
              <div className="relative my-1.5 overflow-hidden rounded-2xl border border-white/80 bg-white/50 p-2 shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)] backdrop-blur-md">
                {/* Column Headers (小时 / 分钟) */}
                <div className="relative z-20 grid grid-cols-2 text-center text-[11px] font-semibold text-[var(--stone)]/80 pb-1.5 border-b border-black/[0.04]">
                  <span>小时</span>
                  <span>分钟</span>
                </div>

                {/* Wheels Section: Lens and Columns share the EXACT SAME container */}
                <div className="relative mt-1" style={{ height: `${WHEEL_HEIGHT}px` }}>
                  {/* Center Highlight Selection Lens: Exactly in the middle [38px, 76px] */}
                  <div
                    className="pointer-events-none absolute inset-x-1 top-1/2 -translate-y-1/2 rounded-xl border border-[var(--copper)]/35 bg-[var(--copper)]/12 shadow-[0_2px_8px_rgba(181,106,60,0.1),inset_0_1px_1.5px_rgba(255,255,255,0.9)] backdrop-blur-xs"
                    style={{ height: `${ITEM_HEIGHT}px` }}
                  />

                  {/* Top & Bottom Depth Gradients for 3D Cylinder effect */}
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-white/95 via-white/60 to-transparent z-10 pointer-events-none" />
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-white/95 via-white/60 to-transparent z-10 pointer-events-none" />

                  {/* Dual Scroll Columns */}
                  <div className="relative z-0 grid grid-cols-2 items-center h-full">
                    <TimeWheelColumn
                      items={HOURS}
                      value={draftHour}
                      onChange={setDraftHour}
                      ariaLabel="小时滚轮选择"
                    />
                    <TimeWheelColumn
                      items={minuteOptions}
                      value={draftMinute}
                      onChange={setDraftMinute}
                      ariaLabel="分钟滚轮选择"
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-2.5 flex justify-end gap-2 border-t border-[var(--mist)]/70 pt-2.5">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-full border border-black/10 bg-white/70 px-3.5 py-1.5 text-xs font-medium text-[var(--stone)] transition hover:bg-white hover:text-[var(--ink)] shadow-2xs active:scale-95 cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onChange(formatTime(draftHour, draftMinute))
                    setOpen(false)
                  }}
                  className="rounded-full bg-[var(--ink)] px-4.5 py-1.5 text-xs font-semibold text-[var(--paper)] transition hover:bg-black shadow-[0_3px_10px_rgba(0,0,0,0.15)] active:scale-95 cursor-pointer"
                >
                  完成
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
