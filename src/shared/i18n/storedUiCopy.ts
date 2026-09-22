import { LOCALES } from './locales/registry'
import { getLocale } from './i18nStore'
import type { Locale } from './types'

const indexes = new Map<Locale, Map<string, string>>()
/** Resolve old saved UI labels without rewriting user data or translating free-form content. */
export function localizeStoredUiCopy(value: string, locale: Locale = getLocale()): string {
  let index = indexes.get(locale)
  if (!index) {
    index = new Map()
    const target = LOCALES[locale].dictionary
    function add(source: unknown, translated: unknown) {
      if (typeof source === 'string' && typeof translated === 'string') {
        if (!source.includes('{')) index!.set(source, translated)
      } else if (source && translated && typeof source === 'object' && typeof translated === 'object') {
        for (const [key, text] of Object.entries(source)) add(text, (translated as Record<string, unknown>)[key])
      }
    }
    for (const entry of Object.values(LOCALES)) add(entry.dictionary, target)
    indexes.set(locale, index)
  }
  return index.get(value) || value
}
