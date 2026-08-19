/**
 * Service to dynamically synchronize `<meta name="theme-color">` with open dialogs/sheets.
 *
 * Ensures the status bar color in mobile browsers (iOS Safari 15+, Android Chrome)
 * blends seamlessly into modal backdrop overlays without abrupt color steps.
 */

export const DEFAULT_THEME_COLOR = '#ecefe8'
export const OVERLAY_THEME_COLOR = '#7f847f'

let lockCount = 0
let originalThemeColor: string | null = null

function getThemeMetaElement(): HTMLMetaElement | null {
  if (typeof document === 'undefined') return null
  return document.querySelector('meta[name="theme-color"]')
}

/**
 * Returns current content of `<meta name="theme-color">`.
 */
export function getThemeColor(): string {
  const meta = getThemeMetaElement()
  return meta?.getAttribute('content') || DEFAULT_THEME_COLOR
}

/**
 * Directly updates `<meta name="theme-color">`.
 */
export function setThemeColor(color: string): void {
  if (typeof document === 'undefined') return
  let meta = getThemeMetaElement()
  if (!meta) {
    meta = document.createElement('meta')
    meta.setAttribute('name', 'theme-color')
    document.head.appendChild(meta)
  }
  meta.setAttribute('content', color)
}

/**
 * Acquires a theme color lock for an overlay (e.g. BottomSheet, TripChatPanel).
 * Returns a release callback to restore the original color when all overlays close.
 */
export function acquireThemeColorLock(overlayColor = OVERLAY_THEME_COLOR): () => void {
  if (typeof document === 'undefined') {
    return () => {}
  }

  if (lockCount === 0) {
    const current = getThemeMetaElement()?.getAttribute('content')
    originalThemeColor = current || DEFAULT_THEME_COLOR
    setThemeColor(overlayColor)
  }
  lockCount++

  let released = false
  return () => {
    if (released) return
    released = true
    lockCount = Math.max(0, lockCount - 1)
    if (lockCount === 0) {
      setThemeColor(originalThemeColor || DEFAULT_THEME_COLOR)
      originalThemeColor = null
    }
  }
}

/**
 * Resets lock state (primarily for unit tests).
 */
export function _resetThemeColorLockForTests(): void {
  lockCount = 0
  originalThemeColor = null
}
