import { useEffect, useRef } from 'react'
import { animate, useMotionValue, type MotionValue } from 'framer-motion'

interface UseSheetDragDismissOptions {
  onClose: () => void
  threshold?: number
  velocityThreshold?: number
}

export interface UseSheetDragDismissReturn<T extends HTMLElement = HTMLDivElement> {
  sheetRef: React.RefObject<T | null>
  y: MotionValue<number>
  dragProps: {
    style: {
      y: MotionValue<number>
    }
  }
}

/**
 * Non-passive native touch & mouse gesture arbiter for bottom sheets.
 *
 * Why this is needed:
 * Browsers process touch scrolling on their compositor thread. React's passive
 * event handlers cannot prevent the browser's native rubberband/overscroll bounce.
 *
 * By attaching a non-passive `touchmove` listener directly to the sheet element:
 * - When `scrollTop <= 0` and the user swipes down, we call `e.preventDefault()`
 *   to completely suppress native rubberbanding and drive sheet dismissal via MotionValue.
 * - When `scrollTop > 0` or the user scrolls up, `e.preventDefault()` is NOT called,
 *   preserving 100% native momentum scrolling inside the content.
 */
export function useSheetDragDismiss<T extends HTMLElement = HTMLDivElement>({
  onClose,
  threshold = 110,
  velocityThreshold = 400,
}: UseSheetDragDismissOptions): UseSheetDragDismissReturn<T> {
  const sheetRef = useRef<T | null>(null)
  const y = useMotionValue(0)

  useEffect(() => {
    const el = sheetRef.current
    if (!el) return

    let startY = 0
    let startX = 0
    let scrollEl: HTMLElement | null = null
    let isDraggingSheet = false
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
      isDraggingSheet = false
      scrollEl = findScrollableAncestor(target)
    }

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return
      const touch = e.touches[0]
      const deltaY = touch.clientY - startY
      const deltaX = touch.clientX - startX

      const now = performance.now()
      const dt = now - lastTime
      if (dt > 0) {
        velocityY = ((touch.clientY - lastY) / dt) * 1000
      }
      lastY = touch.clientY
      lastTime = now

      if (!isDraggingSheet) {
        if (Math.abs(deltaY) < 5 && Math.abs(deltaX) < 5) return

        const isVerticalDown = deltaY > 5 && deltaY > Math.abs(deltaX) * 1.1
        const atTop = !scrollEl || scrollEl.scrollTop <= 0

        if (isVerticalDown && atTop) {
          isDraggingSheet = true
        } else {
          return
        }
      }

      if (isDraggingSheet) {
        // Suppress native rubberband bounce
        if (e.cancelable) {
          e.preventDefault()
        }

        const currentDelta = touch.clientY - startY
        if (currentDelta > 0) {
          y.set(currentDelta)
        } else {
          // Elastic resistance when dragged up
          y.set(currentDelta * 0.15)
        }
      }
    }

    const onTouchEnd = () => {
      if (isDraggingSheet) {
        isDraggingSheet = false
        const currentY = y.get()
        if (currentY > threshold || velocityY > velocityThreshold) {
          animate(y, window.innerHeight, {
            duration: 0.22,
            ease: [0.22, 1, 0.36, 1] as const,
          }).then(onClose)
        } else {
          animate(y, 0, {
            type: 'spring',
            stiffness: 420,
            damping: 32,
            mass: 0.8,
          })
        }
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
      isDraggingSheet = false

      const onMouseMove = (moveEvent: MouseEvent) => {
        const deltaY = moveEvent.clientY - startY
        const deltaX = moveEvent.clientX - startX

        const now = performance.now()
        const dt = now - lastTime
        if (dt > 0) {
          velocityY = ((moveEvent.clientY - lastY) / dt) * 1000
        }
        lastY = moveEvent.clientY
        lastTime = now

        if (!isDraggingSheet) {
          if (Math.abs(deltaY) < 5 && Math.abs(deltaX) < 5) return
          if (deltaY > 5 && deltaY > Math.abs(deltaX)) {
            isDraggingSheet = true
          } else {
            return
          }
        }

        if (isDraggingSheet) {
          const currentDelta = moveEvent.clientY - startY
          if (currentDelta > 0) {
            y.set(currentDelta)
          } else {
            y.set(currentDelta * 0.15)
          }
        }
      }

      const onMouseUp = () => {
        window.removeEventListener('mousemove', onMouseMove)
        window.removeEventListener('mouseup', onMouseUp)
        if (isDraggingSheet) {
          isDraggingSheet = false
          const currentY = y.get()
          if (currentY > threshold || velocityY > velocityThreshold) {
            animate(y, window.innerHeight, {
              duration: 0.22,
              ease: [0.22, 1, 0.36, 1] as const,
            }).then(onClose)
          } else {
            animate(y, 0, {
              type: 'spring',
              stiffness: 420,
              damping: 32,
              mass: 0.8,
            })
          }
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
  }, [onClose, threshold, velocityThreshold, y])

  return {
    sheetRef,
    y,
    dragProps: {
      style: {
        y,
      },
    },
  }
}
