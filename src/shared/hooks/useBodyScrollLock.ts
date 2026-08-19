import { useEffect } from 'react'
import { acquireThemeColorLock } from '../services/themeColor'

let activeScrollLocks = 0
let prevHtmlOverflow = ''
let prevBodyOverflow = ''
let prevHtmlOverscroll = ''

/**
 * Locks background page scroll while `active` is true so open sheets/modals
 * do not cause the page underneath to scroll or rubber-band.
 * Also synchronizes the mobile status bar `<meta name="theme-color">` to match
 * the dimmed backdrop seamlessly.
 *
 * Uses reference counting so nested sheets do not unlock scroll or restore
 * theme-color prematurely.
 */
export function useBodyScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof document === 'undefined') return

    const html = document.documentElement
    const body = document.body

    if (activeScrollLocks === 0) {
      prevHtmlOverflow = html.style.overflow
      prevBodyOverflow = body.style.overflow
      prevHtmlOverscroll = html.style.overscrollBehavior

      html.style.overflow = 'hidden'
      body.style.overflow = 'hidden'
      html.style.overscrollBehavior = 'none'
    }
    activeScrollLocks++

    const releaseThemeColor = acquireThemeColorLock()

    return () => {
      releaseThemeColor()
      activeScrollLocks = Math.max(0, activeScrollLocks - 1)
      if (activeScrollLocks === 0) {
        html.style.overflow = prevHtmlOverflow
        body.style.overflow = prevBodyOverflow
        html.style.overscrollBehavior = prevHtmlOverscroll
      }
    }
  }, [active])
}

/**
 * Resets lock state (primarily for testing).
 */
export function _resetBodyScrollLockForTests(): void {
  activeScrollLocks = 0
  prevHtmlOverflow = ''
  prevBodyOverflow = ''
  prevHtmlOverscroll = ''
}
