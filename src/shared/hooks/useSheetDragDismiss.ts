import { useCallback, useRef } from 'react'
import { useDragControls, type PanInfo } from 'framer-motion'

interface UseSheetDragDismissOptions {
  onClose: () => void
  threshold?: number
  velocityThreshold?: number
}

/**
 * Enhanced Bottom Sheet pull-down-to-dismiss gesture hook.
 *
 * Implements a Directional Touch Arbiter:
 * 1. Non-scrollable surfaces (headers, empty areas, toolbars):
 *    - Pulling down smoothly drags the sheet.
 * 2. Scrollable content areas (lists, detail cards):
 *    - When `scrollTop > 0` (viewing scrolled content): native scroll handles browsing.
 *    - When `scrollTop <= 0` (top of content): pulling down immediately transfers
 *      control to sheet drag, preventing browser native rubberband overscroll.
 *    - Swiping up from top immediately scrolls content without sheet jitter.
 */
export function useSheetDragDismiss<T extends HTMLElement = HTMLDivElement>({
  onClose,
  threshold = 110,
  velocityThreshold = 400,
}: UseSheetDragDismissOptions) {
  const dragControls = useDragControls()
  const sheetRef = useRef<T | null>(null)
  const touchTrackingRef = useRef<{
    startY: number
    startX: number
    scrollEl: HTMLElement | null
    captured: boolean
  } | null>(null)

  const findScrollableAncestor = (target: HTMLElement | null): HTMLElement | null => {
    let el = target
    while (el && el !== sheetRef.current && el !== document.body) {
      if (el.scrollHeight > el.clientHeight + 1) {
        const overflowY = window.getComputedStyle(el).overflowY
        if (overflowY === 'auto' || overflowY === 'scroll') {
          return el
        }
      }
      el = el.parentElement
    }
    return null
  }

  const isFormInteractive = (target: HTMLElement | null): boolean => {
    if (!target) return false
    const tag = target.tagName.toLowerCase()
    return (
      tag === 'input' ||
      tag === 'textarea' ||
      tag === 'select' ||
      target.isContentEditable
    )
  }

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      const target = e.target as HTMLElement | null
      if (isFormInteractive(target)) return

      const scrollEl = findScrollableAncestor(target)

      // If clicked on a non-scrollable header/chrome and not a button, start drag immediately
      const isButtonOrLink = Boolean(
        target?.closest('button, a, [role="button"], input, textarea'),
      )

      if (!scrollEl && !isButtonOrLink) {
        dragControls.start(e)
        return
      }

      // Track touch on scrollable content or interactive buttons to decide intent
      touchTrackingRef.current = {
        startY: e.clientY,
        startX: e.clientX,
        scrollEl,
        captured: false,
      }
    },
    [dragControls],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const tracking = touchTrackingRef.current
      if (!tracking || tracking.captured) return

      const deltaY = e.clientY - tracking.startY
      const deltaX = e.clientX - tracking.startX

      // Jitter tolerance
      if (Math.abs(deltaY) < 6 && Math.abs(deltaX) < 6) return

      const isVerticalDown = deltaY > 6 && deltaY > Math.abs(deltaX) * 1.1

      if (isVerticalDown) {
        const atTop = !tracking.scrollEl || tracking.scrollEl.scrollTop <= 0
        if (atTop) {
          // Top of content pulled down -> Start dragging sheet to dismiss
          tracking.captured = true
          dragControls.start(e)
          return
        }
      }

      // Otherwise let normal scroll or horizontal gesture continue
      if (deltaY < -6 || (tracking.scrollEl && tracking.scrollEl.scrollTop > 0)) {
        touchTrackingRef.current = null
      }
    },
    [dragControls],
  )

  const handlePointerEnd = useCallback(() => {
    touchTrackingRef.current = null
  }, [])

  const handleDragEnd = useCallback(
    (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      touchTrackingRef.current = null
      if (info.offset.y > threshold || info.velocity.y > velocityThreshold) {
        onClose()
      }
    },
    [onClose, threshold, velocityThreshold],
  )

  return {
    sheetRef,
    dragProps: {
      drag: 'y' as const,
      dragControls,
      dragListener: false,
      dragDirectionLock: true,
      dragConstraints: { top: 0, bottom: 0 },
      dragElastic: { top: 0.05, bottom: 0.75 },
      dragSnapToOrigin: true,
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerEnd,
      onPointerCancel: handlePointerEnd,
      onDragEnd: handleDragEnd,
    },
  }
}
