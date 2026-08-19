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
 * High-performance gesture arbiter for bottom sheets.
 *
 * Architecture:
 * - Operates on an inner `dragY` MotionValue layer so outer entrance/exit transitions
 *   (`initial: { y: '100%' } -> animate: { y: 0 }`) run completely unhindered.
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
      if (isDragging) {
        settleOnRelease(velocityY)
      }
    }

    // --- Mouse handling (Desktop) ---
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      const target = e.target as HTMLElement | null
      if (isFormInteractive(target)) return
      if (target?.closest('button, a, [role="button"], input, textarea, select')) return

      const scrollAncestor = findScrollableAncestor(target)
      if (scrollAncestor && scrollAncestor.scrollTop > 0) return

      startY = e.clientY
      startX = e.clientX
      lastY = e.clientY
      lastTime = performance.now()
      velocityY = 0
      isDragging = false

      const onMouseMove = (moveEvent: MouseEvent) => {
        const deltaY = moveEvent.clientY - startY
        const deltaX = moveEvent.clientX - startX

        const now = performance.now()
        const dt = now - lastTime
        if (dt > 4 && dt < 120) {
          const instantVelocity = ((moveEvent.clientY - lastY) / dt) * 1000
          velocityY = velocityY ? velocityY * 0.35 + instantVelocity * 0.65 : instantVelocity
        }
        lastY = moveEvent.clientY
        lastTime = now

        if (!isDragging) {
          if (Math.abs(deltaY) < 4 && Math.abs(deltaX) < 4) return
          if (deltaY > 4 && deltaY > Math.abs(deltaX)) {
            isDragging = true
          } else {
            return
          }
        }

        if (isDragging) {
          const currentDelta = moveEvent.clientY - startY
          if (currentDelta > 0) {
            dragY.set(currentDelta)
          } else {
            dragY.set(currentDelta * 0.15)
          }
        }
      }

      const onMouseUp = () => {
        window.removeEventListener('mousemove', onMouseMove)
        window.removeEventListener('mouseup', onMouseUp)
        if (isDragging) {
          settleOnRelease(velocityY)
        }
      }

      window.addEventListener('mousemove', onMouseMove)
      window.addEventListener('mouseup', onMouseUp)
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    el.addEventListener('touchcancel', onTouchEnd, { passive: true })
    el.addEventListener('mousedown', onMouseDown)

    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
      el.removeEventListener('mousedown', onMouseDown)
    }
  }, [onClose, threshold, velocityThreshold, dragY])

  return {
    sheetRef,
    dragY,
  }
}
