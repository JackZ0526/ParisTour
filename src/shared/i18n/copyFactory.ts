import { getLocale } from './i18nStore'
import type { Locale } from './types'

/** Per-feature dictionaries keep lazy features out of the initial application bundle. */
export function createCopy<K extends string>(en: Record<K, string>, zhCN: Record<K, string>) {
  return (key: K, params?: Record<string, unknown>, locale: Locale = getLocale()): string => {
    const text = (locale === 'en' ? en : zhCN)[key]
    if (text === undefined) throw new Error(`Missing localized copy: ${key}`)
    return text.replace(/\{(p\d+)\}/g, (token, name: string) =>
      params && Object.hasOwn(params, name) ? String(params[name]) : token,
    )
  }
}

/** For instructions that intentionally target a fixed language, independent of the UI. */
export function fixedCopy<K extends string>(dictionary: Record<K, string>) {
  return (key: K, params?: Record<string, unknown>): string => dictionary[key].replace(
    /\{(p\d+)\}/g,
    (token, name: string) => params && Object.hasOwn(params, name) ? String(params[name]) : token,
  )
}
