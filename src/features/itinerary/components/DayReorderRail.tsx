import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode, type UIEventHandler } from 'react'
import { createPortal } from 'react-dom'
import type { DayPlan } from '../../../types'
import { useTranslation } from '../../../shared/i18n'
import { dayOrderCopy } from '../../../shared/i18n/copy/dayOrder'
import { DayReorderContext } from './dayReorderContext'

type DragSession = {
  id: number; from: number; over: number; startX: number; startY: number; x: number; y: number
  scrollLeft: number; mode: 'pending' | 'scroll' | 'drag'; touch: boolean
  button: HTMLButtonElement; days: DayPlan[]; hold?: ReturnType<typeof setTimeout>; frame?: number
}

export function DayReorderRail({ days, disabled, onMoveDay, className, onScroll, children }: {
  days: DayPlan[]; disabled: boolean; onMoveDay: (from: number, to: number) => void
  className: string; onScroll: UIEventHandler<HTMLDivElement>; children: ReactNode
}) {
  const { locale } = useTranslation()
  const rail = useRef<HTMLDivElement>(null)
  const session = useRef<DragSession | null>(null)
  const latest = useRef({ days, disabled, onMoveDay })
  latest.current = { days, disabled, onMoveDay }
  const suppressClickUntil = useRef(0)
  const [drag, setDrag] = useState<{ from: number; over: number; x: number; y: number } | null>(null)
  const [interacting, setInteracting] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const [error, setError] = useState('')
  const hintId = useId()

  function clearSession() {
    const previous = session.current
    if (previous?.hold) clearTimeout(previous.hold)
    if (previous?.frame) cancelAnimationFrame(previous.frame)
    if (previous && previous.button.hasPointerCapture(previous.id)) previous.button.releasePointerCapture(previous.id)
    session.current = null
    setDrag(null)
    setInteracting(false)
    return previous
  }

  useEffect(() => {
    const current = session.current
    if (current && (disabled || current.days !== days)) {
      clearSession()
      suppressClickUntil.current = Date.now() + 400
      setAnnouncement(dayOrderCopy('changed', undefined, locale))
    }
  }, [days, disabled, locale])

  useEffect(() => () => {
    const current = session.current
    if (current?.hold) clearTimeout(current.hold)
    if (current?.frame) cancelAnimationFrame(current.frame)
  }, [])

  function updateDrag(current: DragSession) {
    const buttons = rail.current?.querySelectorAll<HTMLButtonElement>('[data-day-number]')
    let nearest = Infinity
    buttons?.forEach(button => {
      const rect = button.getBoundingClientRect()
      const distance = Math.abs(current.x - rect.left - rect.width / 2)
      if (distance < nearest) { nearest = distance; current.over = Number(button.dataset.dayNumber) }
    })
    setDrag({ from: current.from, over: current.over, x: current.x, y: current.y })
  }

  function activate(current: DragSession) {
    if (session.current !== current || latest.current.disabled) return
    current.mode = 'drag'
    setInteracting(true)
    current.button.setPointerCapture(current.id)
    updateDrag(current)
    const tick = () => {
      if (session.current !== current || current.mode !== 'drag') return
      const node = rail.current
      if (node) {
        const bounds = node.getBoundingClientRect()
        const delta = current.x < bounds.left + 36 ? -12 : current.x > bounds.right - 36 ? 12 : 0
        if (delta) { node.scrollLeft += delta; updateDrag(current) }
      }
      current.frame = requestAnimationFrame(tick)
    }
    current.frame = requestAnimationFrame(tick)
  }

  function start(event: PointerEvent<HTMLButtonElement>, day: number) {
    if (disabled || event.button !== 0 || session.current) return
    setError('')
    const current: DragSession = {
      id: event.pointerId, from: day, over: day, startX: event.clientX, startY: event.clientY,
      x: event.clientX, y: event.clientY, scrollLeft: rail.current?.scrollLeft ?? 0,
      mode: 'pending', touch: event.pointerType !== 'mouse', button: event.currentTarget, days,
    }
    session.current = current
    if (current.touch) current.hold = setTimeout(() => activate(current), 350)
  }

  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    const current = session.current
    if (!current || event.pointerId !== current.id) return
    current.x = event.clientX; current.y = event.clientY
    const dx = event.clientX - current.startX, dy = event.clientY - current.startY
    if (current.mode === 'pending') {
      if (current.touch && Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { clearSession(); return }
      if (Math.abs(dx) > 7 || (!current.touch && Math.abs(dy) > 7)) {
        if (current.hold) clearTimeout(current.hold)
        if (current.touch) { current.mode = 'scroll'; setInteracting(true) }
        else activate(current)
      }
    }
    if (current.mode === 'scroll' && rail.current) {
      event.preventDefault()
      rail.current.scrollLeft = current.scrollLeft - dx
    }
    if (current.mode === 'drag') { event.preventDefault(); updateDrag(current) }
  }

  function move(from: number, to: number) {
    if (from === to || latest.current.disabled) return
    try {
      latest.current.onMoveDay(from, to)
      setAnnouncement(dayOrderCopy('moved', { p0: from, p1: to }, locale))
      requestAnimationFrame(() => {
        const target = rail.current?.querySelector<HTMLButtonElement>(`[data-day-number="${to}"]`)
        target?.focus({ preventScroll: true })
        target?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
      })
    } catch (failure) { setError(failure instanceof Error ? failure.message : dayOrderCopy('invalid', undefined, locale)) }
  }

  function pointerUp(event: PointerEvent<HTMLDivElement>) {
    if (session.current?.id !== event.pointerId) return
    const previous = clearSession()
    if (!previous || previous.mode === 'pending') return
    suppressClickUntil.current = Date.now() + 400
    const bounds = rail.current?.getBoundingClientRect()
    const inside = bounds && previous.x >= bounds.left - 24 && previous.x <= bounds.right + 24 && previous.y >= bounds.top - 48 && previous.y <= bounds.bottom + 48
    if (previous.mode === 'drag' && inside && previous.days === latest.current.days) move(previous.from, previous.over)
  }

  function keyDown(event: KeyboardEvent<HTMLButtonElement>, day: number) {
    if (!event.altKey || !['ArrowLeft', 'ArrowRight'].includes(event.key) || disabled) return
    event.preventDefault()
    const index = days.findIndex(d => d.day === day)
    const target = days[index + (event.key === 'ArrowLeft' ? -1 : 1)]
    if (target) move(day, target.day)
  }

  const draggingDay = days.find(day => day.day === drag?.from)
  return <>
    <DayReorderContext.Provider value={{ disabled, dragging: drag?.from ?? null, over: drag?.over ?? null, describedBy: hintId, start, keyDown }}>
      <div ref={rail} role="group" aria-label={dayOrderCopy('rail', undefined, locale)} className={className}
        style={{ touchAction: disabled ? 'pan-x' : 'pan-y pinch-zoom', scrollSnapType: interacting ? 'none' : undefined }} onScroll={onScroll}
        onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={() => clearSession()}
        onKeyDown={event => { if (event.key === 'Escape' && session.current) { clearSession(); suppressClickUntil.current = Date.now() + 400 } }}
        onClickCapture={event => { if (Date.now() < suppressClickUntil.current) { event.preventDefault(); event.stopPropagation() } }}>
        {children}
      </div>
    </DayReorderContext.Provider>
    {!disabled && <p className="px-1.5 text-[11px] text-[var(--stone)]">{dayOrderCopy('dragHint', undefined, locale)}</p>}
    <span id={hintId} className="sr-only">{dayOrderCopy('hint', undefined, locale)}</span>
    <span role="status" aria-live="polite" className="sr-only">{announcement}</span>
    {error && <p role="alert" className="text-sm text-[var(--copper)]">{error}</p>}
    {drag && draggingDay && createPortal(<div aria-hidden className="pointer-events-none fixed z-[4000] max-w-60 rounded-2xl border border-[var(--copper)] bg-[var(--ink)] px-4 py-2 text-white shadow-xl"
      style={{ left: drag.x + 12, top: drag.y + 12 }}>
      <strong>D{drag.from}</strong><span className="mt-1 block truncate text-xs">{draggingDay.title}</span>
    </div>, document.body)}
  </>
}
