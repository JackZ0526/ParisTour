import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import {
  ASK_ABOUT_TOOLBAR_ESTIMATE,
  getViewportSize,
  positionToolbarAbove,
  readAskableSelection,
  type ChatSelectionAskState,
} from '../components/chatSelectionAsk'

export type { ChatSelectionAskState }

function applyCssHighlight(range: Range | null) {
  if (typeof CSS === 'undefined' || !CSS.highlights) return
  CSS.highlights.delete('ask-about')
  if (range && typeof Highlight === 'function') {
    try {
      CSS.highlights.set('ask-about', new Highlight(range))
    } catch {
      CSS.highlights.delete('ask-about')
    }
  }
}

export function useChatSelectionAsk(opts: {
  enabled: boolean
  containerRef: RefObject<HTMLElement | null>
  toolbarRef: RefObject<HTMLElement | null>
}): {
  state: ChatSelectionAskState | null
  dismiss: (clearSelection?: boolean) => void
} {
  const { enabled, containerRef, toolbarRef } = opts
  const [state, setState] = useState<ChatSelectionAskState | null>(null)
  const stateRef = useRef(state)
  stateRef.current = state
  const savedRangeRef = useRef<Range | null>(null)
  const restoringRef = useRef(false)

  const dismiss = useCallback((clearSelection = false) => {
    savedRangeRef.current = null
    applyCssHighlight(null)
    if (clearSelection && typeof window !== 'undefined') {
      window.getSelection()?.removeAllRanges()
    }
    setState(null)
  }, [])

  const restoreSavedRange = useCallback(() => {
    const range = savedRangeRef.current
    if (!range || typeof window === 'undefined') return
    const sel = window.getSelection()
    if (!sel) return
    if (sel.rangeCount > 0 && sel.toString().trim()) return
    restoringRef.current = true
    try {
      sel.removeAllRanges()
      sel.addRange(range)
      applyCssHighlight(range)
    } catch {
      savedRangeRef.current = null
      applyCssHighlight(null)
    } finally {
      restoringRef.current = false
    }
  }, [])

  useLayoutEffect(() => {
    if (!state) return
    restoreSavedRange()
  }, [restoreSavedRange, state])

  useEffect(() => {
    if (!enabled) {
      savedRangeRef.current = null
      applyCssHighlight(null)
      setState(null)
      return
    }

    let pointerSelecting = false
    let dismissedByScroll = false
    let debounceId: number | null = null

    const clearDebounce = () => {
      if (debounceId != null) {
        window.clearTimeout(debounceId)
        debounceId = null
      }
    }

    const syncFromSelection = (immediate: boolean) => {
      const apply = () => {
        const next = readAskableSelection(containerRef.current)
        if (!next) {
          // Keep the snapshot toolbar if iOS/Android collapsed the native
          // highlight after the overlay appeared.
          if (stateRef.current) {
            restoreSavedRange()
            return
          }
          savedRangeRef.current = null
          applyCssHighlight(null)
          setState(null)
          return
        }
        savedRangeRef.current = next.range
        applyCssHighlight(next.range)
        const pos = positionToolbarAbove(
          next.rect,
          ASK_ABOUT_TOOLBAR_ESTIMATE,
          getViewportSize(),
        )
        setState((prev) => {
          if (
            prev &&
            prev.text === next.text &&
            Math.abs(prev.top - pos.top) < 0.5 &&
            Math.abs(prev.left - pos.left) < 0.5
          ) {
            return prev
          }
          return { text: next.text, top: pos.top, left: pos.left, highlights: next.highlights }
        })
      }

      if (immediate) {
        clearDebounce()
        apply()
        return
      }
      clearDebounce()
      debounceId = window.setTimeout(apply, 80)
    }

    const isOnToolbar = (target: EventTarget | null) => {
      const toolbar = toolbarRef.current
      return Boolean(toolbar && target instanceof Node && toolbar.contains(target))
    }

    const onPointerDown = (event: PointerEvent) => {
      if (isOnToolbar(event.target)) return
      pointerSelecting = true
      if (stateRef.current) {
        savedRangeRef.current = null
        applyCssHighlight(null)
        setState(null)
      }
    }

    const onPointerUp = (event: PointerEvent) => {
      pointerSelecting = false
      if (isOnToolbar(event.target)) return
      if (dismissedByScroll) {
        dismissedByScroll = false
        return
      }
      syncFromSelection(true)
    }

    const onSelectionChange = () => {
      if (restoringRef.current) return
      const sel = window.getSelection()
      const empty = !sel || sel.isCollapsed || !sel.toString().trim()
      if (empty) {
        dismissedByScroll = false
        if (stateRef.current) {
          restoreSavedRange()
          return
        }
        syncFromSelection(true)
        return
      }
      dismissedByScroll = false
      if (pointerSelecting) return
      syncFromSelection(false)
    }

    const onScroll = () => {
      dismissedByScroll = true
      savedRangeRef.current = null
      applyCssHighlight(null)
      if (stateRef.current) setState(null)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !stateRef.current) return
      event.preventDefault()
      event.stopPropagation()
      savedRangeRef.current = null
      applyCssHighlight(null)
      window.getSelection()?.removeAllRanges()
      setState(null)
    }

    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('pointerup', onPointerUp, true)
    document.addEventListener('selectionchange', onSelectionChange)
    document.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('scroll', onScroll, true)
    window.visualViewport?.addEventListener('resize', onScroll)
    window.visualViewport?.addEventListener('scroll', onScroll)
    const container = containerRef.current
    container?.addEventListener('scroll', onScroll, { passive: true })

    return () => {
      clearDebounce()
      applyCssHighlight(null)
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('pointerup', onPointerUp, true)
      document.removeEventListener('selectionchange', onSelectionChange)
      document.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('scroll', onScroll, true)
      window.visualViewport?.removeEventListener('resize', onScroll)
      window.visualViewport?.removeEventListener('scroll', onScroll)
      container?.removeEventListener('scroll', onScroll)
    }
  }, [containerRef, enabled, restoreSavedRange, toolbarRef])

  return { state, dismiss }
}
