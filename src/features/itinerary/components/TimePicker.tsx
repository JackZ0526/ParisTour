import { useEffect, useId, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Clock3 } from 'lucide-react'
import { glassCapsuleToneClass } from '../../../shared/styles/glassCapsule'

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
        Seamlessly holds the persistent top anchor bar, expanding the hour/minute selection below.
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
            {/* Time Capsule: Always has identical inline-flex, px, py, rounded-lg, border box model so 10:00 NEVER shifts */}
            <span
              className={`relative inline-flex items-center rounded-lg border px-2.5 py-0.5 text-sm font-semibold tabular-nums transition-all duration-200 ${
                open
                  ? `${glassCapsuleToneClass.copper} text-[var(--copper)] shadow-2xs`
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

        {/* Expanded Selection Body (Smooth In-Place Downward Accordion Flow) */}
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden border-t border-[var(--mist)]/70 px-3.5 pb-3.5 pt-2.5"
            >
              {/* Hours Grid */}
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
                        'rounded-lg py-1.5 text-sm tabular-nums outline-none transition cursor-pointer',
                        draftHour === hour
                          ? 'bg-[var(--copper)] font-medium text-[var(--paper)] shadow-sm'
                          : 'text-[var(--ink)] hover:bg-[var(--copper)]/10 focus-visible:ring-2 focus-visible:ring-[var(--copper)]/40',
                      ].join(' ')}
                    >
                      {String(hour).padStart(2, '0')}
                    </button>
                  ))}
                </div>
              </div>

              {/* Minutes Grid */}
              <div className="mt-3 border-t border-[var(--mist)]/60 pt-2">
                <p className="mb-1.5 text-xs font-medium text-[var(--stone)]">分钟</p>
                <div className="grid grid-cols-6 gap-1">
                  {minuteOptions.map((minute) => (
                    <button
                      key={minute}
                      type="button"
                      aria-pressed={draftMinute === minute}
                      onClick={() => setDraftMinute(minute)}
                      className={[
                        'rounded-lg py-1.5 text-sm tabular-nums outline-none transition cursor-pointer',
                        draftMinute === minute
                          ? 'bg-[var(--copper)] font-medium text-[var(--paper)] shadow-sm'
                          : 'text-[var(--ink)] hover:bg-[var(--copper)]/10 focus-visible:ring-2 focus-visible:ring-[var(--copper)]/40',
                      ].join(' ')}
                    >
                      {String(minute).padStart(2, '0')}
                    </button>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-3.5 flex justify-end gap-2 border-t border-[var(--mist)]/70 pt-2.5">
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
