/**
 * Paris Tour locale registry
 *
 * Single source of truth for every supported language.
 * Adding a new locale is a 2-step change:
 *   1. create `locales/<id>.ts` exporting a typed `I18nSchema` dictionary
 *   2. add one entry here — `isLocale`, `getSystemPreferredLocale`,
 *      `getLlmLanguageInstruction`, `SUPPORTED_LOCALES`, and the
 *      completeness tests all derive from this map automatically.
 */

import type { I18nSchema, Locale } from '../types'
import { zhCN } from './zh-CN'
import { en } from './en'

export interface LocaleMeta {
  /** Stable locale id, matches the `Locale` union type. */
  id: Locale
  /** Name as written in its own language (e.g. "简体中文", "English"). */
  nativeName: string
  /** Full dictionary for this locale. */
  dictionary: I18nSchema
  /**
   * Browser `navigator.language` prefixes that should map to this locale.
   * First match wins. e.g. ['zh'] matches 'zh', 'zh-CN', 'zh-Hans'.
   */
  systemPrefixes: string[]
  /** Instruction sent to the LLM to keep generated copy in this language. */
  llmInstruction: string
}

export const LOCALES: Record<Locale, LocaleMeta> = {
  'zh-CN': {
    id: 'zh-CN',
    nativeName: '简体中文',
    dictionary: zhCN,
    systemPrefixes: ['zh'],
    llmInstruction: '文案使用自然地道的简体中文。',
  },
  en: {
    id: 'en',
    nativeName: 'English',
    dictionary: en,
    systemPrefixes: ['en'],
    llmInstruction: 'Respond and format all descriptive text in natural, elegant English.',
  },
}

export const DEFAULT_LOCALE: Locale = 'zh-CN'

/** Ordered list suitable for rendering in the language picker UI. */
export const SUPPORTED_LOCALES: LocaleMeta[] = Object.values(LOCALES)
