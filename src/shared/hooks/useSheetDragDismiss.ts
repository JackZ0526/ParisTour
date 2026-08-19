import { useCallback, useRef, useState } from 'react'
import type { PanInfo } from 'framer-motion'

interface UseSheetDragDismissOptions {
  onClose: () => void
  threshold?: number
  velocityThreshold?: number
}

/**
 * Provides props for Framer Motion bottom sheet modals to support
 * pull-down-to-dismiss gestures anywhere on the sheet surface.
 *
 * Coordination:
 * - If touch starts inside an internal scrollable container where `scrollTop > 0`,
 *   the gesture defers to native scroll.
 * - When `scrollTop === 0` (or anywhere on non-scrolled content, header, margins),
 *   downward drag smoothly pulls down the entire sheet.
 * - If dragged past `threshold` or with `velocityThreshold`, `onClose()` is fired.
 * - Otherwise, smoothly springs back to origin.
 */
export function useSheetDragDismiss<T extends HTMLElement = HTMLDivElement>({
  onClose,
  threshold = 110,
  velocityThreshold = 400,
}: UseSheetDragDismissOptions) {
  const [canDrag, setCanDrag] = useState(true)
  const sheetRef = useRef<T | null>(null)

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // Check if the click/touch began inside a child that is currently scrolled down.
    let el = e.target as HTMLElement | null
    let isScrolled = false
    while (el && el !== sheetRef.current && el !== document.body) {
      if (el.scrollHeight > el.clientHeight && el.scrollTop > 0) {
        const overflowY = window.getComputedStyle(el).overflowY
        if (overflowY === 'auto' || overflowY === 'scroll') {
          isScrolled = true
          break
        }
      }
      el = el.parentElement
    }
    setCanDrag(!isScrolled)
  }, [])

  const handleDragEnd = useCallback(
    (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
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
      dragListener: canDrag,
      dragDirectionLock: true,
      dragConstraints: { top: 0, bottom: 0 },
      dragElastic: { top: 0.05, bottom: 0.75 },
      dragSnapToOrigin: true,
      onPointerDown: handlePointerDown,
      onDragEnd: handleDragEnd,
    },
  }
}
