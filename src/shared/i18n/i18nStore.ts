/**
 * Paris Tour i18n Store
 *
 * Lightweight, type-safe reactive store using useSyncExternalStore.
 * Manages locale selection, localStorage persistence, and DOM <html lang="..."> attribute.
 *
 * All locale metadata (id, native name, dictionary, system prefixes,
 * LLM instruction) is sourced from `./locales/registry.ts` — this file
 * contains no per-locale branching and stays untouched when adding a
 * new language.
 */

import { LOCALES, DEFAULT_LOCALE } from './locales/registry'
import type { Locale, TranslationKey } from './types'

const LOCALE_STORAGE_KEY = 'paris_tour_locale_mode'

let currentLocale: Locale = DEFAULT_LOCALE
const listeners = new Set<() => void>()

/* ------------------------------------------------------------------ *
 *  Dev-time missing-key warnings
 * ------------------------------------------------------------------ */

let devWarnEnabled: boolean =
  typeof import.meta !== 'undefined' && Boolean((import.meta as any).env?.DEV)

const warnedKeys = new Set<string>()

/** Test-only: silence or restore the dev missing-key console.warn. */
export function setI18nDevWarnEnabled(enabled: boolean) {
  devWarnEnabled = enabled
  if (!enabled) warnedKeys.clear()
}

function warnMissingKey(key: string, activeLocale: Locale) {
  if (!devWarnEnabled) return
  // Dedupe within a session so re-renders don't spam the console.
  const tag = `${activeLocale}::${key}`
  if (warnedKeys.has(tag)) return
  warnedKeys.add(tag)
  // eslint-disable-next-line no-console
  console.warn(`[i18n] Missing key "${key}" in "${activeLocale}". Falling back to "${DEFAULT_LOCALE}".`)
}

/* ------------------------------------------------------------------ *
 *  Locale validation
 * ------------------------------------------------------------------ */

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && value in LOCALES
}

/* ------------------------------------------------------------------ *
 *  System preference detection
 * ------------------------------------------------------------------ */

export function getSystemPreferredLocale(): Locale {
  if (typeof navigator === 'undefined') return 'en'
  const candidate = (
    navigator.language ||
    (Array.isArray(navigator.languages) && navigator.languages[0]) ||
    ''
  ).toLowerCase()

  if (candidate.startsWith('zh')) {
    return 'zh-CN'
  }
  return 'en'
}

/* ------------------------------------------------------------------ *
 *  DOM sync
 * ------------------------------------------------------------------ */

function applyLocaleToDOM(locale: Locale) {
  if (typeof document === 'undefined') return
  document.documentElement.lang = locale
}

function notifyListeners() {
  listeners.forEach((listener) => listener())
}

/* ------------------------------------------------------------------ *
 *  Public API
 * ------------------------------------------------------------------ */

export function getLocale(): Locale {
  return currentLocale
}

export function setLocale(locale: Locale, options: { persist?: boolean } = {}) {
  if (!isLocale(locale)) return

  currentLocale = locale
  applyLocaleToDOM(locale)

  if (options.persist !== false && typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, locale)
    } catch {
      // Ignore localStorage write failures
    }
  }

  notifyListeners()
}

export function initLocale(): Locale {
  let initial: Locale = DEFAULT_LOCALE
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(LOCALE_STORAGE_KEY)
      if (stored && isLocale(stored)) {
        initial = stored
      } else {
        initial = getSystemPreferredLocale()
      }
    } else {
      initial = getSystemPreferredLocale()
    }
  } catch {
    initial = getSystemPreferredLocale()
  }

  currentLocale = initial
  applyLocaleToDOM(initial)
  return initial
}

export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Dot-path key lookup and parameter interpolation.
 * e.g. translate('nav.dayN', { day: 3 }) => '第 3 天' / 'Day 3'
 *
 * Lookup chain: active locale → DEFAULT_LOCALE → key string.
 * Missing keys in the active locale trigger a dev-only `console.warn`
 * (deduped per session). Missing keys in the default locale are always
 * silent (they're a developer bug, not a translation gap).
 */
export function translate(
  key: TranslationKey,
  params?: Record<string, string | number>,
  overrideLocale?: Locale,
): string {
  const activeLocale = overrideLocale || currentLocale
  const activeDict = (LOCALES[activeLocale] ?? LOCALES[DEFAULT_LOCALE]).dictionary
  const defaultDict = LOCALES[DEFAULT_LOCALE].dictionary

  const parts = key.split('.')
  let current: unknown = activeDict
  let activeMissing = false

  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = (current as Record<string, unknown>)[part]
    } else {
      activeMissing = true
      break
    }
  }

  if (activeMissing) {
    warnMissingKey(key, activeLocale)
    // Fall back to the default dictionary.
    current = defaultDict
    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = (current as Record<string, unknown>)[part]
      } else {
        current = undefined
        break
      }
    }
  }

  if (typeof current !== 'string') {
    return key
  }

  if (!params) return current

  let result = current
  for (const [paramKey, paramValue] of Object.entries(params)) {
    result = result.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(paramValue))
  }
  return result
}

export function getLlmLanguageInstruction(overrideLocale?: Locale): string {
  const id = overrideLocale || currentLocale
  return (LOCALES[id] ?? LOCALES[DEFAULT_LOCALE]).llmInstruction
}

export function _resetI18nStoreForTests() {
  currentLocale = DEFAULT_LOCALE
  listeners.clear()
  warnedKeys.clear()
  devWarnEnabled = false
}
