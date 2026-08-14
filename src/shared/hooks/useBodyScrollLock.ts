import { useEffect } from 'react'

/**
 * Locks background page scroll while `active` is true so open sheets/modals
 * do not cause the page underneath to rubber-band on iOS Safari.
 */
export function useBodyScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof document === 'undefined') return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [active])
}