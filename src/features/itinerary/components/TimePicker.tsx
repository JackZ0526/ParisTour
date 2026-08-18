import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const next = parseTime(value)
    setDraftHour(next.hour)
    setDraftMinute(next.minute)

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, value])

  const minuteOptions = MINUTES.includes(draftMinute)
    ? MINUTES
    : [...MINUTES, draftMinute].sort((a, b) => a - b)

  const panel = createPortal(
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-[2700] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setOpen(false)
            }
          }}
        >
          <motion.div
            key="time-picker-panel"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={label ? `${label}选择器` : '选择时间'}
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 12 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="max-h-[min(calc(100dvh-2rem),calc(100vh-2rem))] w-full max-w-sm overflow-y-auto rounded-3xl border border-white/80 bg-[#fffcf7] p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between gap-3 border-b border-[var(--mist)] pb-3">
              <p className="font-display text-lg tracking-wide text-[var(--ink)]">
                选择开始时间
              </p>
              <span className="rounded-full bg-[var(--sage)]/10 px-3 py-1 text-sm font-medium tabular-nums text-[var(--sage)]">
                {formatTime(draftHour, draftMinute)}
              </span>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium text-[var(--stone)]">小时</p>
              <div className="grid grid-cols-6 gap-1.5">
                {HOURS.map((hour) => (
                  <button
                    key={hour}
                    type="button"
                    aria-pressed={draftHour === hour}
                    onClick={() => setDraftHour(hour)}
                    className={[
                      'rounded-xl py-2 text-sm tabular-nums outline-none transition',
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

            <div className="mt-4 border-t border-[var(--mist)] pt-3">
              <p className="mb-2 text-xs font-medium text-[var(--stone)]">分钟</p>
              <div className="grid grid-cols-6 gap-1.5">
                {minuteOptions.map((minute) => (
                  <button
                    key={minute}
                    type="button"
                    aria-pressed={draftMinute === minute}
                    onClick={() => setDraftMinute(minute)}
                    className={[
                      'rounded-xl py-2 text-sm tabular-nums outline-none transition',
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

            <div className="mt-5 flex justify-end gap-2 border-t border-[var(--mist)] pt-4">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full border border-[var(--stone)]/30 px-4 py-2 text-sm text-[var(--stone)] transition hover:border-[var(--sage)]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  onChange(formatTime(draftHour, draftMinute))
                  setOpen(false)
                }}
                className="rounded-full bg-[var(--ink)] px-5 py-2 text-sm text-[var(--paper)] transition hover:opacity-90 shadow-sm"
              >
                完成
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )

  return (
    <div className="relative block text-sm">
      {label && (
        <label htmlFor={id} className="font-medium text-[var(--ink)]">
          {label}
        </label>
      )}
      <button
        type="button"
        id={id}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={[
          'mt-2 flex w-full items-center justify-between gap-2 rounded-xl border bg-white/80 px-3 py-2 text-left outline-none transition',
          open
            ? 'border-[var(--sage)] shadow-[0_0_0_3px_rgba(74,99,86,0.12)]'
            : 'border-[var(--mist)] hover:border-[var(--sage)]/60 focus:border-[var(--sage)]',
        ].join(' ')}
      >
        <span className="tabular-nums text-[var(--ink)]">{value}</span>
        <Clock3 className="h-4 w-4 shrink-0 text-[var(--sage)]" strokeWidth={1.6} aria-hidden />
      </button>
      {panel}
    </div>
  )
}
