import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type UIEvent } from 'react'
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
const REPEAT_COUNT = 40 // 40 loops of items for seamless infinite wheel scrolling
const MIDDLE_SET = 20 // Center loop offset

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
  const isProgrammaticScrollRef = useRef(false)
  const isScrollingRef = useRef(false)
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wheelLockRef = useRef(false)
  const wheelLockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const n = items.length

  // Construct infinite repeated item list for circular rolling
  const repeatedItems = useMemo(() => {
    const list: { item: T; repIdx: number }[] = []
    for (let loop = 0; loop < REPEAT_COUNT; loop++) {
      for (let i = 0; i < n; i++) {
        const item = items[i]
        if (item !== undefined) {
          list.push({ item, repIdx: loop * n + i })
        }
      }
    }
    return list
  }, [items, n])

  // Instantaneous silent positioning before paint whenever mounted or value changes while idle
  useLayoutEffect(() => {
    const baseIdx = items.indexOf(value)
    if (baseIdx >= 0 && containerRef.current && !isScrollingRef.current) {
      const currentScroll = containerRef.current.scrollTop
      const currentRepIdx = Math.round(currentScroll / ITEM_HEIGHT)
      const currentBaseIdx = ((currentRepIdx % n) + n) % n

      // Only reposition if different from current displayed base index or on initial zero scroll
      if (currentBaseIdx !== baseIdx || currentScroll === 0) {
        isProgrammaticScrollRef.current = true
        const targetRepIdx = MIDDLE_SET * n + baseIdx
        containerRef.current.scrollTop = targetRepIdx * ITEM_HEIGHT
      }
    }
  }, [value, items, n])

  // Desktop Mouse Wheel: 1 wheel notch = exactly 1 discrete step (prevent large continuous multi-item jumps)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const onWheelNative = (e: WheelEvent) => {
      // Prevent browser default large continuous scrolling on desktop mouse wheel
      e.preventDefault()
      e.stopPropagation()

      if (wheelLockRef.current) return
      const delta = e.deltaY
      if (Math.abs(delta) < 2) return

      const direction = delta > 0 ? 1 : -1
      const currentScroll = el.scrollTop
      const currentRepIdx = Math.round(currentScroll / ITEM_HEIGHT)
      const targetRepIdx = currentRepIdx + direction

      el.scrollTo({
        top: targetRepIdx * ITEM_HEIGHT,
        behavior: 'smooth',
      })

      const normIdx = ((targetRepIdx % n) + n) % n
      const selected = items[normIdx]
      if (selected !== undefined) onChange(selected)

      wheelLockRef.current = true
      if (wheelLockTimerRef.current) clearTimeout(wheelLockTimerRef.current)
      wheelLockTimerRef.current = setTimeout(() => {
        wheelLockRef.current = false
      }, 75)
    }

    el.addEventListener('wheel', onWheelNative, { passive: false })
    return () => {
      el.removeEventListener('wheel', onWheelNative)
      if (wheelLockTimerRef.current) clearTimeout(wheelLockTimerRef.current)
    }
  }, [items, n, onChange])

  const handleScroll = (e: UIEvent<HTMLDivElement>) => {
    if (isProgrammaticScrollRef.current) {
      isProgrammaticScrollRef.current = false
      return
    }

    const target = e.currentTarget
    isScrollingRef.current = true
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current)

    const rawIdx = Math.round(target.scrollTop / ITEM_HEIGHT)
    const normalizedIdx = ((rawIdx % n) + n) % n
    const selected = items[normalizedIdx]
    if (selected !== undefined && selected !== value) {
      onChange(selected)
    }

    scrollTimerRef.current = setTimeout(() => {
      isScrollingRef.current = false
      // Silent reset to middle loop if user scrolled too far towards boundaries
      if (containerRef.current && (rawIdx < n * 5 || rawIdx > n * (REPEAT_COUNT - 5))) {
        isProgrammaticScrollRef.current = true
        const resetIdx = MIDDLE_SET * n + normalizedIdx
        containerRef.current.scrollTop = resetIdx * ITEM_HEIGHT
      }
    }, 150)
  }

  const handleItemClick = (repIdx: number, item: T) => {
    if (containerRef.current) {
      containerRef.current.scrollTo({
        top: repIdx * ITEM_HEIGHT,
        behavior: 'smooth',
      })
    }
    onChange(item)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!containerRef.current) return
    const currentScroll = containerRef.current.scrollTop
    const currentRepIdx = Math.round(currentScroll / ITEM_HEIGHT)

    if (e.key === 'ArrowUp') {
      e.preventDefault()
      const targetRepIdx = currentRepIdx - 1
      containerRef.current.scrollTo({
        top: targetRepIdx * ITEM_HEIGHT,
        behavior: 'smooth',
      })
      const normIdx = ((targetRepIdx % n) + n) % n
      const selected = items[normIdx]
      if (selected !== undefined) onChange(selected)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      const targetRepIdx = currentRepIdx + 1
      containerRef.current.scrollTo({
        top: targetRepIdx * ITEM_HEIGHT,
        behavior: 'smooth',
      })
      const normIdx = ((targetRepIdx % n) + n) % n
      const selected = items[normIdx]
      if (selected !== undefined) onChange(selected)
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
      className="relative w-full snap-y snap-mandatory overflow-y-auto select-none touch-pan-y overscroll-contain outline-none focus-visible:ring-1 focus-visible:ring-[var(--copper)]/30 rounded-xl [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
    >
      {/* Top spacer (1 item height) to vertically center the first item in the lens */}
      <div style={{ height: `${ITEM_HEIGHT}px` }} aria-hidden />

      {repeatedItems.map(({ item, repIdx }) => {
        const isSelected = item === value
        return (
          <div
            key={repIdx}
            role="option"
            aria-selected={isSelected}
            onClick={() => handleItemClick(repIdx, item)}
            style={{ height: `${ITEM_HEIGHT}px` }}
            className={`flex snap-center items-center justify-center text-center cursor-pointer text-xl tabular-nums tracking-normal leading-none transition-all duration-200 ease-out ${
              isSelected
                ? 'font-bold text-[var(--ink)] scale-100 opacity-100'
                : 'font-normal text-[var(--stone)]/60 scale-[0.82] opacity-60 hover:text-[var(--ink)] hover:opacity-85'
            }`}
          >
            {formatItem(item)}
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

  // Synchronize draft state when value prop changes
  useEffect(() => {
    const next = parseTime(value)
    setDraftHour(next.hour)
    setDraftMinute(next.minute)
  }, [value])

  const handleCancel = () => {
    const next = parseTime(value)
    setDraftHour(next.hour)
    setDraftMinute(next.minute)
    setOpen(false)
  }

  const handleConfirm = () => {
    onChange(formatTime(draftHour, draftMinute))
    setOpen(false)
  }

  const handleToggle = () => {
    if (!open) {
      const next = parseTime(value)
      setDraftHour(next.hour)
      setDraftMinute(next.minute)
      setOpen(true)
    } else {
      handleCancel()
    }
  }

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        handleCancel()
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation()
        handleCancel()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, value]) // eslint-disable-line react-hooks/exhaustive-deps

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
          onClick={handleToggle}
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
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden"
            >
              <div className="border-t border-[var(--mist)]/70 px-3.5 pb-3.5 pt-2">
                {/* iOS Wheel Body */}
                <div className="relative my-1 overflow-hidden rounded-2xl border border-white/80 bg-white/50 p-2 shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)] backdrop-blur-md">
                  {/* Wheels Section: Lens and Columns share the EXACT SAME container */}
                  <div className="relative" style={{ height: `${WHEEL_HEIGHT}px` }}>
                    {/* Layer 1 (z-0): Dual Distinct 3D Frosted Glass Capsules */}
                    <div
                      className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 grid grid-cols-2 z-0"
                      style={{ height: `${ITEM_HEIGHT}px` }}
                    >
                      {/* Hour Column Capsule */}
                      <div className="flex items-center justify-center">
                        <div className="relative w-[64px] h-[38px] rounded-xl border border-[#d7a98a]/80 bg-[#f6e8de]/85 shadow-[0_2px_8px_rgba(181,106,60,0.14),inset_0_1px_1.5px_rgba(255,255,255,1),inset_0_-1px_1px_rgba(255,255,255,0.6)] before:pointer-events-none before:absolute before:inset-x-1.5 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/95 before:to-transparent" />
                      </div>

                      {/* Minute Column Capsule */}
                      <div className="flex items-center justify-center">
                        <div className="relative w-[64px] h-[38px] rounded-xl border border-[#d7a98a]/80 bg-[#f6e8de]/85 shadow-[0_2px_8px_rgba(181,106,60,0.14),inset_0_1px_1.5px_rgba(255,255,255,1),inset_0_-1px_1px_rgba(255,255,255,0.6)] before:pointer-events-none before:absolute before:inset-x-1.5 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/95 before:to-transparent" />
                      </div>
                    </div>

                    {/* Center Static Colon ':' */}
                    <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-xl font-bold text-[var(--copper)]/90 select-none z-10 leading-none">
                      :
                    </div>

                    {/* Layer 2 (z-10): Dual Scroll Columns with High-Contrast Rich Text */}
                    <div className="relative z-10 grid grid-cols-2 items-center h-full">
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

                    {/* Layer 3 (z-20): Top & Bottom Depth Gradients for 3D Cylinder effect */}
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-white/95 via-white/60 to-transparent z-20" />
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-white/95 via-white/60 to-transparent z-20" />
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="mt-2.5 flex justify-end gap-2 border-t border-[var(--mist)]/70 pt-2.5">
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="rounded-full border border-black/10 bg-white/70 px-3.5 py-1.5 text-xs font-medium text-[var(--stone)] transition hover:bg-white hover:text-[var(--ink)] shadow-2xs active:scale-95 cursor-pointer"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirm}
                    className="rounded-full bg-[var(--ink)] px-4.5 py-1.5 text-xs font-semibold text-[var(--paper)] transition hover:bg-black shadow-[0_3px_10px_rgba(0,0,0,0.15)] active:scale-95 cursor-pointer"
                  >
                    完成
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
