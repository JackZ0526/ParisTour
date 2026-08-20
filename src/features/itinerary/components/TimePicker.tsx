import { useEffect, useId, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Clock3 } from 'lucide-react'
import {
  glassCapsuleSurfaceClass,
  glassCapsuleToneClass,
} from '../../../shared/styles/glassCapsule'

interface Props {
  value: string
  onChange: (time: string) => void
  label?: string
  id?: string
}

const HOURS = Array.from({ length: 24 }, (_, hour) => hour)
const MINUTES = Array.from({ length: 12 }, (_, index) => index * 5)

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

const MORPH_EASE = [0.22, 1, 0.36, 1] as const
const MORPH_DURATION = 0.32

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
        Sub-wrapper holds the shared layoutId. min-h-[2.25rem] reserves the
        button's vertical slot so the cards below don't jump when the
        popover (absolute) replaces the in-flow button.
      */}
      <div className="relative mt-2 min-h-[2.25rem]">
        <AnimatePresence>
          {!open ? (
            <motion.button
              key="time-picker-button"
              layoutId="time-picker-card"
              type="button"
              id={id}
              aria-haspopup="dialog"
              aria-expanded={false}
              onClick={() => setOpen(true)}
              transition={{
                opacity: { duration: 0.18, ease: 'easeOut' },
                layout: { duration: MORPH_DURATION, ease: MORPH_EASE },
              }}
              className="flex h-9 w-full items-center justify-between gap-2 rounded-xl border border-[var(--mist)] bg-white/80 px-3 py-2 text-left outline-none transition-colors hover:border-[var(--sage)]/60 focus-visible:border-[var(--sage)] focus-visible:ring-2 focus-visible:ring-[var(--sage)]/25"
            >
              <span className="tabular-nums text-[var(--ink)]">{value}</span>
              <Clock3
                className="h-4 w-4 shrink-0 text-[var(--sage)]"
                strokeWidth={1.6}
                aria-hidden
              />
            </motion.button>
          ) : (
            <motion.div
              key="time-picker-popover"
              layoutId="time-picker-card"
              role="dialog"
              aria-modal="true"
              aria-label={label ? `${label}选择器` : '选择时间'}
              transition={{
                opacity: { duration: 0.18, ease: 'easeOut' },
                layout: { duration: MORPH_DURATION, ease: MORPH_EASE },
              }}
              style={{ transformOrigin: 'top center' }}
              className="absolute inset-x-0 top-0 z-30 max-h-[min(70dvh,420px)] overflow-y-auto rounded-2xl border border-white/70 bg-[#fffcf7] p-4 shadow-[var(--shadow)]"
            >
              <div className="mb-3 flex items-center justify-between gap-3 border-b border-[var(--mist)] pb-2">
                <p className="font-display text-base tracking-wide text-[var(--ink)]">
                  选择开始时间
                </p>
                <span className={`${glassCapsuleSurfaceClass} ${glassCapsuleToneClass.sage} inline-flex items-center px-2.5 py-0.5 text-sm font-medium tabular-nums text-[var(--sage)]`}>
                  {formatTime(draftHour, draftMinute)}
                </span>
              </div>

              <div>
                <p className="mb-1.5 text-xs font-medium text-[var(--stone)]">小时</p>
                <div className="grid grid-cols-6 gap-1">
                  {HOURS.map((hour) => (
                    <button
                      key={hour}
                      type="button"
                      aria-pressed={draftHour === hour}
                      onClick={() => setDraftHour(hour)}
                      className={[
                        'rounded-lg py-1.5 text-sm tabular-nums outline-none transition',
                        draftHour === hour
                          ? 'bg-[var(--copper)] font-medium text-[var(--paper)] shadow-sm'
                          : 'text-[var(--ink)] hover:bg-[var(--sage)]/12 focus-visible:ring-2 focus-visible:ring-[var(--sage)]/40',
                      ].join(' ')}
                    >
                      {String(hour).padStart(2, '0')}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-3 border-t border-[var(--mist)] pt-2">
                <p className="mb-1.5 text-xs font-medium text-[var(--stone)]">分钟</p>
                <div className="grid grid-cols-6 gap-1">
                  {minuteOptions.map((minute) => (
                    <button
                      key={minute}
                      type="button"
                      aria-pressed={draftMinute === minute}
                      onClick={() => setDraftMinute(minute)}
                      className={[
                        'rounded-lg py-1.5 text-sm tabular-nums outline-none transition',
                        draftMinute === minute
                          ? 'bg-[var(--sage)] font-medium text-[var(--paper)] shadow-sm'
                          : 'text-[var(--ink)] hover:bg-[var(--sage)]/12 focus-visible:ring-2 focus-visible:ring-[var(--sage)]/40',
                      ].join(' ')}
                    >
                      {String(minute).padStart(2, '0')}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-3 flex justify-end gap-2 border-t border-[var(--mist)] pt-3">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-full border border-[var(--stone)]/30 px-3 py-1.5 text-xs text-[var(--stone)] transition hover:border-[var(--sage)]"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onChange(formatTime(draftHour, draftMinute))
                    setOpen(false)
                  }}
                  className="rounded-full bg-[var(--ink)] px-4 py-1.5 text-xs text-[var(--paper)] transition hover:opacity-90 shadow-sm"
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
