/**
 * Theme Store for Paris Tour
 *
 * Supports 3 modes:
 * - 'light': Classic French Pale Paper theme
 * - 'dark': Midnight Paris (Noir Emeraude & Champagne Gold)
 * - 'system': Automatically follows OS / browser dark mode preference (default)
 */

import { useSyncExternalStore } from 'react'
import { setThemeColor } from './themeColor'

export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

const THEME_STORAGE_KEY = 'paris_tour_theme_mode'
export const LIGHT_THEME_COLOR = '#ecefe8'
export const DARK_THEME_COLOR = '#121614'

let currentPreference: ThemePreference = 'system'
const listeners = new Set<() => void>()

function getSystemPrefersDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === 'dark') return 'dark'
  if (preference === 'light') return 'light'
  return getSystemPrefersDark() ? 'dark' : 'light'
}

function applyThemeToDOM(resolved: ResolvedTheme) {
  if (typeof document === 'undefined') return

  const root = document.documentElement
  if (resolved === 'dark') {
    root.classList.add('dark')
    root.style.colorScheme = 'dark'
    setThemeColor(DARK_THEME_COLOR)
  } else {
    root.classList.remove('dark')
    root.style.colorScheme = 'light'
    setThemeColor(LIGHT_THEME_COLOR)
  }
}

function notifyListeners() {
  listeners.forEach((listener) => listener())
}

export function getThemePreference(): ThemePreference {
  return currentPreference
}

export function getResolvedTheme(): ResolvedTheme {
  return resolveTheme(currentPreference)
}

export function setThemePreference(pref: ThemePreference): void {
  if (currentPreference === pref) return

  currentPreference = pref
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(THEME_STORAGE_KEY, pref)
    }
  } catch {
    // Storage access might be restricted in some iframe/incognito modes
  }

  const resolved = resolveTheme(pref)
  applyThemeToDOM(resolved)
  notifyListeners()
}

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Initializes theme listener and applies saved theme on startup.
 */
export function initTheme(): void {
  if (typeof window === 'undefined') return

  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY) as ThemePreference | null
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      currentPreference = saved
    } else {
      currentPreference = 'system'
    }
  } catch {
    currentPreference = 'system'
  }

  const resolved = resolveTheme(currentPreference)
  applyThemeToDOM(resolved)

  // Listen to OS system theme changes
  if (window.matchMedia) {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleSystemChange = () => {
      if (currentPreference === 'system') {
        const nextResolved = resolveTheme('system')
        applyThemeToDOM(nextResolved)
        notifyListeners()
      }
    }

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleSystemChange)
    } else if ('addListener' in mediaQuery) {
      ;(mediaQuery as any).addListener(handleSystemChange)
    }
  }
}

/**
 * React hook to read and update theme state.
 */
export function useTheme() {
  const preference = useSyncExternalStore(subscribeTheme, getThemePreference, () => 'system' as ThemePreference)
  const resolved = resolveTheme(preference)

  return {
    themePreference: preference,
    resolvedTheme: resolved,
    isDark: resolved === 'dark',
    setThemePreference,
  }
}

/**
 * Resets theme store state (primarily for unit tests).
 */
export function _resetThemeStoreForTests(): void {
  currentPreference = 'system'
  listeners.clear()
}
