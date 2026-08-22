import { useEffect, useRef } from 'react'
import { animate, useMotionValue, type MotionValue } from 'framer-motion'

interface UseSheetDragDismissOptions {
  open?: boolean
  onClose: () => void
  threshold?: number
  velocityThreshold?: number
}

export interface UseSheetDragDismissReturn<T extends HTMLElement = HTMLDivElement> {
  sheetRef: React.RefObject<T | null>
  dragY: MotionValue<number>
}

/**
 * High-performance mobile gesture arbiter for bottom sheets.
 *
 * Architecture:
 * - Operates on an inner `dragY` MotionValue layer so outer entrance/exit transitions
 *   (`initial: { y: '100%' } -> animate: { y: 0 }`) run completely unhindered.
 * - Only accepts touch gestures below the 640px mobile breakpoint. Centered
 *   desktop dialogs never attach mouse dragging or react to touch dragging.
 * - Attaches a non-passive `touchmove` listener directly to the sheet DOM node.
 * - When content is at top (`scrollTop <= 0`) and user drags downward:
 *   Calls `e.preventDefault()` to totally suppress browser rubber-band bounce,
 *   and smoothly updates `dragY` in real time at hardware frame rate (60/120fps).
 * - When content is scrolled down (`scrollTop > 0`) or swiping up:
 *   Leaves native momentum scrolling 100% untouched.
 * - Handles velocity-based release physics (dismiss on fast flick or passing threshold).
 */
export function useSheetDragDismiss<T extends HTMLElement = HTMLDivElement>({
  open = true,
  onClose,
  threshold = 100,
  velocityThreshold = 350,
}: UseSheetDragDismissOptions): UseSheetDragDismissReturn<T> {
  const sheetRef = useRef<T | null>(null)
  const dragY = useMotionValue(0)

  // Always reset drag offset whenever the sheet opens
  useEffect(() => {
    if (open) {
      dragY.set(0)
    }
  }, [open, dragY])

  useEffect(() => {
    const el = sheetRef.current
    if (!el) return

    let startY = 0
    let startX = 0
    let scrollEl: HTMLElement | null = null
    let isDragging = false
    let lastY = 0
    let lastTime = 0
    let velocityY = 0
    const mobileSheetQuery = window.matchMedia('(max-width: 639px)')

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

    const settleOnRelease = (releaseVelocity: number) => {
      isDragging = false
      const currentY = dragY.get()
      const shouldDismiss =
        currentY > threshold || releaseVelocity > velocityThreshold

      if (shouldDismiss) {
        onClose()
      } else {
        animate(dragY, 0, {
          type: 'spring',
          velocity: releaseVelocity,
          stiffness: 420,
          damping: 32,
          mass: 0.8,
        })
      }
    }

    // --- Touch handling (Mobile) ---
    const onTouchStart = (e: TouchEvent) => {
      if (!mobileSheetQuery.matches) return
      if (e.touches.length !== 1) return
      const touch = e.touches[0]
      const target = touch.target as HTMLElement | null
      if (isFormInteractive(target)) return

      startY = touch.clientY
      startX = touch.clientX
      lastY = touch.clientY
      lastTime = performance.now()
      velocityY = 0
      isDragging = false
      scrollEl = findScrollableAncestor(target)
    }

    const onTouchMove = (e: TouchEvent) => {
      if (!mobileSheetQuery.matches) return
      if (e.touches.length !== 1) return
      const touch = e.touches[0]
      const deltaY = touch.clientY - startY
      const deltaX = touch.clientX - startX

      const now = performance.now()
      const dt = now - lastTime
      if (dt > 4 && dt < 120) {
        const instantVelocity = ((touch.clientY - lastY) / dt) * 1000
        velocityY = velocityY ? velocityY * 0.35 + instantVelocity * 0.65 : instantVelocity
      }
      lastY = touch.clientY
      lastTime = now

      if (!isDragging) {
        if (Math.abs(deltaY) < 4 && Math.abs(deltaX) < 4) return
        const isVerticalDown = deltaY > 4 && deltaY > Math.abs(deltaX) * 1.1
        const atTop = !scrollEl || scrollEl.scrollTop <= 0

        if (isVerticalDown && atTop) {
          isDragging = true
        } else {
          return
        }
      }

      if (isDragging) {
        if (e.cancelable) {
          e.preventDefault()
        }
        const currentDelta = touch.clientY - startY
        if (currentDelta > 0) {
          dragY.set(currentDelta)
        } else {
          dragY.set(currentDelta * 0.15)
        }
      }
    }

    const onTouchEnd = () => {
      if (!mobileSheetQuery.matches) return
      if (isDragging) {
        settleOnRelease(velocityY)
      }
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
  }, [onClose, threshold, velocityThreshold, dragY])

  return {
    sheetRef,
    dragY,
  }
}
