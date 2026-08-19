import { useCallback, useEffect, useRef } from 'react'
import type { PanInfo } from 'framer-motion'

interface UseSheetDragDismissOptions {
  onClose: () => void
  threshold?: number
  velocityThreshold?: number
}

export interface UseSheetDragDismissReturn<T extends HTMLElement = HTMLDivElement> {
  sheetRef: React.RefObject<T | null>
  dragProps: {
    drag: 'y'
    dragDirectionLock: boolean
    dragConstraints: { top: number; bottom: number }
    dragElastic: { top: number; bottom: number }
    dragSnapToOrigin: boolean
    onDragEnd: (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => void
  }
}

/**
 * Bottom Sheet pull-down-to-dismiss gesture hook.
 *
 * Coordinates:
 * 1. Framer Motion's native `drag="y"` for hardware-accelerated drag and exit.
 * 2. Non-passive native `touchmove` listener to call `e.preventDefault()` when
 *    content is at top (`scrollTop <= 0`), completely suppressing browser rubberband overscroll.
 * 3. Preserves `initial: { y: '100%' }` -> `animate: { y: 0 }` entrance transitions without
 *    MotionValue style collisions.
 */
export function useSheetDragDismiss<T extends HTMLElement = HTMLDivElement>({
  onClose,
  threshold = 100,
  velocityThreshold = 350,
}: UseSheetDragDismissOptions): UseSheetDragDismissReturn<T> {
  const sheetRef = useRef<T | null>(null)

  useEffect(() => {
    const el = sheetRef.current
    if (!el) return

    let startY = 0
    let startX = 0
    let scrollEl: HTMLElement | null = null
    let isIntercepting = false

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

    const findScrollableAncestor = (target: HTMLElement | null): HTMLElement | null => {
      let current = target
      while (current && current !== el && current !== document.body) {
        if (current.scrollHeight > current.clientHeight + 1) {
          const overflowY = window.getComputedStyle(current).overflowY
          if (overflowY === 'auto' || overflowY === 'scroll') {
            return current
          }
        }
        current = current.parentElement
      }
      return null
    }

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return
      const touch = e.touches[0]
      const target = touch.target as HTMLElement | null
      if (isFormInteractive(target)) return

      startY = touch.clientY
      startX = touch.clientX
      isIntercepting = false
      scrollEl = findScrollableAncestor(target)
    }

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return
      const touch = e.touches[0]
      const deltaY = touch.clientY - startY
      const deltaX = touch.clientX - startX

      if (!isIntercepting) {
        if (Math.abs(deltaY) < 4 && Math.abs(deltaX) < 4) return
        const isVerticalDown = deltaY > 4 && deltaY > Math.abs(deltaX) * 1.1
        const atTop = !scrollEl || scrollEl.scrollTop <= 0

        if (isVerticalDown && atTop) {
          isIntercepting = true
        } else {
          return
        }
      }

      if (isIntercepting) {
        // Prevent browser's native overscroll bounce
        if (e.cancelable) {
          e.preventDefault()
        }
      }
    }

    const onTouchEnd = () => {
      isIntercepting = false
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    el.addEventListener('touchcancel', onTouchEnd, { passive: true })

    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
    }
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
      dragDirectionLock: true,
      dragConstraints: { top: 0, bottom: 0 },
      dragElastic: { top: 0.05, bottom: 0.75 },
      dragSnapToOrigin: true,
      onDragEnd: handleDragEnd,
    },
  }
}
