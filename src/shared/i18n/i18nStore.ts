/**
 * Paris Tour i18n Store
 *
 * Lightweight, type-safe reactive store using useSyncExternalStore.
 * Manages locale selection, localStorage persistence, and DOM <html lang="..."> attribute.
 */

import { zhCN } from './locales/zh-CN'
import { en } from './locales/en'
import type { Locale, TranslationKey, I18nSchema } from './types'

const LOCALE_STORAGE_KEY = 'paris_tour_locale_mode'
const DEFAULT_LOCALE: Locale = 'zh-CN'

const dictionaries: Record<Locale, I18nSchema> = {
  'zh-CN': zhCN,
  en,
  fr: en, // Fallback to English for French until French dictionary is added
}

let currentLocale: Locale = DEFAULT_LOCALE
const listeners = new Set<() => void>()

export function isLocale(value: unknown): value is Locale {
  return value === 'zh-CN' || value === 'en' || value === 'fr'
}

function getSystemPreferredLocale(): Locale {
  if (typeof window === 'undefined' || !navigator.language) return DEFAULT_LOCALE
  const lang = navigator.language.toLowerCase()
  if (lang.startsWith('zh')) return 'zh-CN'
  if (lang.startsWith('en')) return 'en'
  if (lang.startsWith('fr')) return 'fr'
  return DEFAULT_LOCALE
}

function applyLocaleToDOM(locale: Locale) {
  if (typeof document === 'undefined') return
  document.documentElement.lang = locale === 'zh-CN' ? 'zh-CN' : locale
}

function notifyListeners() {
  listeners.forEach((listener) => listener())
}

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
 */
export function translate(
  key: TranslationKey,
  params?: Record<string, string | number>,
  overrideLocale?: Locale,
): string {
  const activeLocale = overrideLocale || currentLocale
  const dict = dictionaries[activeLocale] || dictionaries[DEFAULT_LOCALE]

  const parts = key.split('.')
  let current: unknown = dict

  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = (current as Record<string, unknown>)[part]
    } else {
      // Fallback to default dictionary if missing in active
      const fallbackDict = dictionaries[DEFAULT_LOCALE] as unknown as Record<string, unknown>
      let fallbackVal: unknown = fallbackDict
      for (const fallbackPart of parts) {
        if (fallbackVal && typeof fallbackVal === 'object' && fallbackPart in fallbackVal) {
          fallbackVal = (fallbackVal as Record<string, unknown>)[fallbackPart]
        } else {
          fallbackVal = undefined
          break
        }
      }
      current = typeof fallbackVal === 'string' ? fallbackVal : key
      break
    }
  }

  if (typeof current !== 'string') {
    return key
  }

  let result = current
  if (params) {
    for (const [paramKey, paramValue] of Object.entries(params)) {
      result = result.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(paramValue))
    }
  }

  return result
}

export function getLlmLanguageInstruction(overrideLocale?: Locale): string {
  const activeLocale = overrideLocale || currentLocale
  if (activeLocale === 'en') {
    return 'Respond and format all descriptive text in natural, elegant English.'
  }
  if (activeLocale === 'fr') {
    return 'Répondez et formulez tous les textes descriptifs en français.'
  }
  return '文案使用自然地道的简体中文。'
}

export function _resetI18nStoreForTests() {
  currentLocale = DEFAULT_LOCALE
  listeners.clear()
}

