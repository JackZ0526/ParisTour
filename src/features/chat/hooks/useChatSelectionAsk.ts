import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import {
  readAskableSelection,
  type ChatSelectionAskState,
} from '../components/chatSelectionAsk'

export type { ChatSelectionAskState }

export function useChatSelectionAsk({ enabled, containerRef, toolbarRef }: {
  enabled: boolean
  containerRef: RefObject<HTMLElement | null>
  toolbarRef: RefObject<HTMLElement | null>
}) {
  const [state, setState] = useState<ChatSelectionAskState | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dismiss = useCallback((clearSelection = false) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    if (clearSelection) window.getSelection()?.removeAllRanges()
    setState(null)
  }, [])

  useEffect(() => {
    if (!enabled) { dismiss(); return }
    let selecting = false
    const onToolbar = (target: EventTarget | null) => target instanceof Node && toolbarRef.current?.contains(target)
    const sync = () => {
      if (timer.current) clearTimeout(timer.current)
      const next = readAskableSelection(containerRef.current)
      if (!next) { dismiss(); return }
      const bounds = containerRef.current?.getBoundingClientRect()
      if (bounds && (next.rect.top < bounds.top || next.rect.top + next.rect.height > bounds.bottom)) {
        dismiss(); return
      }
      setState({ text: next.text, context: next.context, rect: next.rect })
    }
    const down = (event: PointerEvent) => {
      if (onToolbar(event.target)) return
      selecting = true
      dismiss()
    }
    const up = (event: PointerEvent) => {
      selecting = false
      if (!onToolbar(event.target)) sync()
    }
    const changed = () => {
      if (selecting) return
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(sync, 100)
    }
    const reposition = () => {
      if (!selecting) sync()
    }
    const cancel = () => { selecting = false; dismiss() }
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && toolbarRef.current) {
        event.preventDefault()
        event.stopPropagation()
        dismiss(true)
      }
    }
    document.addEventListener('pointerdown', down, true)
    document.addEventListener('pointerup', up, true)
    document.addEventListener('pointercancel', cancel, true)
    document.addEventListener('selectionchange', changed)
    document.addEventListener('keydown', key, true)
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    window.visualViewport?.addEventListener('resize', reposition)
    window.visualViewport?.addEventListener('scroll', reposition)
    return () => {
      if (timer.current) clearTimeout(timer.current)
      document.removeEventListener('pointerdown', down, true)
      document.removeEventListener('pointerup', up, true)
      document.removeEventListener('pointercancel', cancel, true)
      document.removeEventListener('selectionchange', changed)
      document.removeEventListener('keydown', key, true)
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
      window.visualViewport?.removeEventListener('resize', reposition)
      window.visualViewport?.removeEventListener('scroll', reposition)
    }
  }, [enabled, containerRef, toolbarRef, dismiss])
  return { state, dismiss }
}
