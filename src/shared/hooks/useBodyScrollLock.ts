import { useEffect } from 'react'

/**
 * Locks background page scroll while `active` is true so open sheets/modals
 * do not cause the page underneath to scroll or rubber-band.
 *
 * Uses non-destructive `overflow: hidden` + `overscroll-behavior: none` so
 * `position: sticky` and scroll-pinned elements do not lose their viewport
 * anchor or jump on lock/unlock.
 */
export function useBodyScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof document === 'undefined') return

    const html = document.documentElement
    const body = document.body

    const prevHtmlOverflow = html.style.overflow
    const prevBodyOverflow = body.style.overflow
    const prevHtmlOverscroll = html.style.overscrollBehavior

    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    html.style.overscrollBehavior = 'none'

    return () => {
      html.style.overflow = prevHtmlOverflow
      body.style.overflow = prevBodyOverflow
      html.style.overscrollBehavior = prevHtmlOverscroll
    }
  }, [active])
}
