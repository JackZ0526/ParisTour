/**
 * Service to dynamically synchronize `<meta name="theme-color">` with open dialogs/sheets.
 *
 * Ensures the status bar color in mobile browsers (iOS Safari 15+, Android Chrome)
 * blends seamlessly into modal backdrop overlays without abrupt color steps.
 */

export const DEFAULT_THEME_COLOR = '#ecefe8'
export const OVERLAY_THEME_COLOR = '#7f847f'
export const DARK_DEFAULT_THEME_COLOR = '#121614'
export const DARK_OVERLAY_THEME_COLOR = '#090d0b'

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
export function acquireThemeColorLock(overlayColor?: string): () => void {
  if (typeof document === 'undefined') {
    return () => {}
  }

  const isDark =
    Boolean(document.documentElement?.classList?.contains?.('dark'))
  const effectiveOverlayColor =
    overlayColor || (isDark ? DARK_OVERLAY_THEME_COLOR : OVERLAY_THEME_COLOR)

  if (lockCount === 0) {
    const current = getThemeMetaElement()?.getAttribute('content')
    originalThemeColor = current || (isDark ? DARK_DEFAULT_THEME_COLOR : DEFAULT_THEME_COLOR)
    setThemeColor(effectiveOverlayColor)
  }
  lockCount++

  let released = false
  return () => {
    if (released) return
    released = true
    lockCount = Math.max(0, lockCount - 1)
    if (lockCount === 0) {
      const fallback = Boolean(document.documentElement?.classList?.contains?.('dark'))
        ? DARK_DEFAULT_THEME_COLOR
        : DEFAULT_THEME_COLOR
      setThemeColor(originalThemeColor || fallback)
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
