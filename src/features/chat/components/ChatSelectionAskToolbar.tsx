import { useLayoutEffect, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { CornerDownRight } from 'lucide-react'
import { ASK_ABOUT_TOOLBAR_Z, getViewportSize, positionToolbarAbove, type ChatSelectionAskState } from './chatSelectionAsk'

export function ChatSelectionAskToolbar({ state, disabled, label, ariaLabel, toolbarRef, onAsk }: {
  state: ChatSelectionAskState | null
  disabled?: boolean
  label: string
  ariaLabel: string
  toolbarRef: RefObject<HTMLDivElement | null>
  onAsk: (text: string, context: string) => void
}) {
  const [position, setPosition] = useState({ top: 0, left: 0 })
  useLayoutEffect(() => {
    if (!state || !toolbarRef.current) return
    const measure = () => {
      if (!toolbarRef.current) return
      setPosition(positionToolbarAbove(state.rect, toolbarRef.current.getBoundingClientRect(), getViewportSize()))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(toolbarRef.current)
    return () => observer.disconnect()
  }, [state, label, toolbarRef])
  if (!state || typeof document === 'undefined') return null
  return createPortal(
    <div ref={toolbarRef} role="toolbar" aria-label={ariaLabel}
      style={{ position: 'fixed', ...position, zIndex: ASK_ABOUT_TOOLBAR_Z }}
      className="pointer-events-auto rounded-xl border border-black/10 bg-white text-zinc-800 shadow-lg dark:border-white/15 dark:bg-zinc-800 dark:text-zinc-100"
      onPointerDown={(event) => event.preventDefault()}>
      <button type="button" disabled={disabled} onClick={() => onAsk(state.text, state.context)}
        className="flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-xs font-medium transition-colors hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 dark:hover:bg-white/10 disabled:opacity-45">
        <CornerDownRight size={14} aria-hidden />{label}
      </button>
    </div>, document.body,
  )
}
