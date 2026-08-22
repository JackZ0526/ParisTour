import { useSyncExternalStore } from 'react'
import { getLocale, setLocale, subscribeLocale, translate } from './i18nStore'
import type { Locale, TranslationKey } from './types'

export function useTranslation() {
  const locale = useSyncExternalStore(subscribeLocale, getLocale, getLocale)

  const t = (key: TranslationKey, params?: Record<string, string | number>) => {
    return translate(key, params, locale)
  }

  const changeLocale = (nextLocale: Locale) => {
    setLocale(nextLocale)
  }

  return {
    t,
    locale,
    setLocale: changeLocale,
  }
}
