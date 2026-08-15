import { useEffect } from 'react'

/**
 * Locks background page scroll while `active` is true so open sheets/modals
 * do not cause the page underneath to scroll or rubber-band (notably on iOS
 * Safari, where `overflow: hidden` on <body> alone is not enough).
 *
 * Strategy: pin the page in place with `position: fixed; top: -scrollY` and
 * restore the original scroll position on unlock. The pinning prevents any
 * further scroll on the underlying page regardless of where the user
 * touches, while `overflow: hidden` keeps the visual state stable.
 */
export function useBodyScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof document === 'undefined') return

    const html = document.documentElement
    const body = document.body
    const scrollY = window.scrollY || window.pageYOffset || 0

    // Snapshot existing inline styles so we can restore them exactly.
    const previous = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyLeft: body.style.left,
      bodyRight: body.style.right,
      bodyWidth: body.style.width,
    }

    // Lock both the real scroll element and the body. Setting only `body`
    // is unreliable because the actual scroll container is usually <html>
    // (and on iOS Safari `overflow: hidden` on body does not stop
    // rubber-band scrolling at all).
    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.left = '0'
    body.style.right = '0'
    body.style.width = '100%'

    return () => {
      html.style.overflow = previous.htmlOverflow
      body.style.overflow = previous.bodyOverflow
      body.style.position = previous.bodyPosition
      body.style.top = previous.bodyTop
      body.style.left = previous.bodyLeft
      body.style.right = previous.bodyRight
      body.style.width = previous.bodyWidth
      // Restore where the user was on the page (instant — no animated jump).
      window.scrollTo(0, scrollY)
    }
  }, [active])
}
