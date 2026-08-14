import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const parsed = parseTime(value)
  const [draftHour, setDraftHour] = useState(parsed.hour)
  const [draftMinute, setDraftMinute] = useState(parsed.minute)
  const [panelPosition, setPanelPosition] = useState({
    top: 0,
    left: 0,
    width: 320,
    above: false,
  })

  const updatePanelPosition = useCallback(() => {
    const trigger = rootRef.current?.querySelector('button')
    if (!(trigger instanceof HTMLElement)) return

    const rect = trigger.getBoundingClientRect()
    const viewportPadding = 12
    const panelWidth = Math.min(320, window.innerWidth - viewportPadding * 2)
    const expectedHeight = Math.min(420, window.innerHeight - viewportPadding * 2)
    const roomBelow = window.innerHeight - rect.bottom - viewportPadding
    const above = roomBelow < expectedHeight && rect.top > roomBelow
    const left = Math.min(
      Math.max(viewportPadding, rect.left),
      window.innerWidth - panelWidth - viewportPadding,
    )

    setPanelPosition({
      top: above
        ? Math.max(viewportPadding, rect.top - expectedHeight - 8)
        : rect.bottom + 8,
      left,
      width: panelWidth,
      above,
    })
  }, [])

  useEffect(() => {
    if (!open) return
    const next = parseTime(value)
    setDraftHour(next.hour)
    setDraftMinute(next.minute)
    updatePanelPosition()

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (
        !rootRef.current?.contains(target) &&
        !panelRef.current?.contains(target)
      ) {
        setOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      setOpen(false)
    }
    const onViewportChange = () => updatePanelPosition()

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', onViewportChange)
    window.addEventListener('scroll', onViewportChange, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', onViewportChange)
      window.removeEventListener('scroll', onViewportChange, true)
    }
  }, [open, updatePanelPosition, value])

  const minuteOptions = MINUTES.includes(draftMinute)
    ? MINUTES
    : [...MINUTES, draftMinute].sort((a, b) => a - b)

  const panel = open
    ? createPortal(
        <div
          ref={panelRef}
          role="dialog"
          aria-label={label ? `${label}选择器` : '选择时间'}
          className="fixed z-[2700] max-h-[calc(100vh-1.5rem)] origin-top animate-fade-up overflow-y-auto rounded-2xl border border-white/70 bg-[#fffcf7] p-3 shadow-[var(--shadow)]"
          style={{
            top: panelPosition.top,
            left: panelPosition.left,
            width: panelPosition.width,
            animationDuration: '0.22s',
            transformOrigin: panelPosition.above ? 'bottom' : 'top',
          }}
        >
          <div className="mb-3 flex items-center justify-between gap-3 border-b border-[var(--mist)] pb-2">
            <p className="font-display text-lg tracking-wide text-[var(--ink)]">
              选择开始时间
            </p>
            <span className="rounded-full bg-[var(--sage)]/10 px-3 py-1 text-sm font-medium tabular-nums text-[var(--sage)]">
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
                    'rounded-xl py-1.5 text-sm tabular-nums outline-none transition',
                    draftHour === hour
                      ? 'bg-[var(--copper)] font-medium text-[var(--paper)]'
                      : 'text-[var(--ink)] hover:bg-[var(--sage)]/12 focus-visible:ring-2 focus-visible:ring-[var(--sage)]/40',
                  ].join(' ')}
                >
                  {String(hour).padStart(2, '0')}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3 border-t border-[var(--mist)] pt-3">
            <p className="mb-1.5 text-xs font-medium text-[var(--stone)]">分钟</p>
            <div className="grid grid-cols-6 gap-1">
              {minuteOptions.map((minute) => (
                <button
                  key={minute}
                  type="button"
                  aria-pressed={draftMinute === minute}
                  onClick={() => setDraftMinute(minute)}
                  className={[
                    'rounded-xl py-1.5 text-sm tabular-nums outline-none transition',
                    draftMinute === minute
                      ? 'bg-[var(--sage)] font-medium text-[var(--paper)]'
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
              className="rounded-full border border-[var(--stone)]/30 px-3 py-1.5 text-sm text-[var(--stone)] transition hover:border-[var(--sage)]"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(formatTime(draftHour, draftMinute))
                setOpen(false)
              }}
              className="rounded-full bg-[var(--ink)] px-3 py-1.5 text-sm text-[var(--paper)] transition hover:opacity-90"
            >
              完成
            </button>
          </div>
        </div>,
        document.body,
      )
    : null

  return (
    <div ref={rootRef} className="relative block text-sm">
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
        onClick={() => setOpen((current) => !current)}
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
