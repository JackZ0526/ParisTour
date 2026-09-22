import { englishPrompt, chinesePrompt } from '../../../i18n/prompts/destination-035b9f'
import { localizedCopy } from '../../../i18n/copy/destination-035b9f'
/**
 * LLM call sites for destination quick-pick chips.
 */
import { buildPrompt, jsonContract } from '../prompts'
import { LlmRequestError } from '../errors'
import { extractJsonObject } from '../json'
import type { DestinationSuggestion } from '../types'
import { generateText, isLlmConfigured } from './_service'
import { getLocale, getLlmLanguageInstruction, type Locale } from '../../../i18n'

export type { DestinationSuggestion }

function toExcludeSet(names: string[]): Set<string> {
  return new Set(names.map((n) => n.toLowerCase().trim()).filter(Boolean))
}

/**
 * Suggest popular travel destinations for quick-select chips.
 * Returns locale-appropriate labels with optional subtitle.
 */
export async function suggestPopularDestinations(options?: {
  /** Names/subtitles from the current chip batch to avoid */
  excludeNames?: string[]
  /** Currently selected destination (also avoided when refreshing) */
  currentDestination?: string
  /** Bump when asking for a fresh batch */
  batch?: number
  /** Target chip count (clamped to 6–10) */
  count?: number
  /** Optional explicit locale override (defaults to the active i18n locale) */
  locale?: Locale
}): Promise<DestinationSuggestion[]> {
  if (!isLlmConfigured()) {
    const locale: Locale = options?.locale ?? getLocale()
    throw new LlmRequestError(
      locale === 'en'
        ? localizedCopy('m82f5e426d8', undefined, 'en')
        : localizedCopy('m82f5e426d8', undefined, 'zh-CN'),
      'missing_key',
    )
  }

  const count = Math.min(10, Math.max(6, options?.count ?? 8))
  const batch = Math.max(1, options?.batch || 1)
  const avoidAlso = [
    ...(options?.excludeNames || []),
    ...(options?.currentDestination?.trim() ? [options.currentDestination.trim()] : []),
  ]
  const exclude = toExcludeSet(avoidAlso)

  const locale: Locale = options?.locale ?? getLocale()
  const isEn = locale === 'en'
  const langRule = getLlmLanguageInstruction(locale)

  const role = isEn
    ? localizedCopy('m4e89c71c69', undefined, 'en')
    : localizedCopy('m4e89c71c69', undefined, 'zh-CN')

  const hardRules = isEn
    ? englishPrompt('md563184aac', { p0: (count) })
    : chinesePrompt('me50291af82', { p0: (count) })

  const example = isEn
    ? localizedCopy('m334adc195d', undefined, 'en')
    : localizedCopy('m334adc195d', undefined, 'zh-CN')

  const system = buildPrompt(
    role,
    null,
    langRule,
    hardRules,
    jsonContract(
      '{ destinations: [{ name, subtitle? }] }',
      example,
      locale,
    ),
  )
  const user = JSON.stringify({
    count,
    batch,
    avoidAlso,
    currentDestination: options?.currentDestination?.trim() || '',
  })

  const text = await generateText(system, user, {
    strict: true,
    task: 'destinationSuggest',
    json: true,
  })
  if (!text) {
    throw new LlmRequestError(
      isEn ? localizedCopy('m7004b0307d', undefined, 'en') : localizedCopy('m7004b0307d', undefined, 'zh-CN'),
    )
  }

  const parsed = extractJsonObject(text)
  const list = (parsed?.destinations as unknown[]) || []
  if (!Array.isArray(list) || !list.length) {
    throw new LlmRequestError(
      isEn ? localizedCopy('mce3851a07e', undefined, 'en') : localizedCopy('mce3851a07e', undefined, 'zh-CN'),
    )
  }

  const out: DestinationSuggestion[] = []
  const seen = new Set<string>()
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const name = String(row.name || '').trim()
    if (!name) continue
    const key = name.toLowerCase()
    const subtitle = String(row.subtitle || '').trim() || undefined
    const subKey = subtitle?.toLowerCase()
    if (exclude.has(key) || (subKey && exclude.has(subKey)) || seen.has(key)) continue
    out.push({ name, subtitle })
    seen.add(key)
    if (subKey) seen.add(subKey)
  }

  if (!out.length) {
    throw new LlmRequestError(
      isEn ? localizedCopy('mabcf4c869d', undefined, 'en') : localizedCopy('mabcf4c869d', undefined, 'zh-CN'),
    )
  }

  return out.slice(0, 10)
}
