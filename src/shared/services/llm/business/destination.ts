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
        ? 'OpenAI API key is not configured; cannot generate popular destinations.'
        : '未配置 OpenAI API Key，无法生成热门目的地。',
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
    ? 'Travel inspiration assistant. Suggest currently popular travel cities/regions for the user\'s quick-pick destination chips.'
    : '旅行灵感助手。为用户推荐当下热门旅游城市/目的地。'

  const hardRules = isEn
    ? `<hard_rules>
- Suggest exactly ${count} popular travel destinations (cities primarily; regions are okay in moderation).
- "name" must be the commonly-used form in the active locale (e.g. "Paris" / "Tokyo" / "Barcelona" in English; 巴黎 / 东京 / 巴塞罗那 in Chinese).
- "subtitle" must be the local official or widely-used English name (e.g. "Paris", "Tokyo").
- Cover diverse regions (Europe / Asia / Americas) — avoid all destinations being in the same country.
- Do not invent places that do not exist.
- Never suggest cities already present in avoidAlso or currentDestination (match either locale variant).
- When batch>1, produce a clearly different set; do not recycle the previous batch.
</hard_rules>`
    : `<hard_rules>
- 恰好推荐 ${count} 个热门旅游目的地（城市为主，可含个别地区）。
- name 用用户当前语言中常见称呼（中文模式：巴黎、东京、巴塞罗那；英文模式：Paris、Tokyo、Barcelona）。
- subtitle 用当地官方或英文常用名（如 Paris、Tokyo）。
- 覆盖欧亚美等不同区域，避免全是同一国家。
- 不要编造不存在的地名。
- 严禁推荐 avoidAlso 与 currentDestination 中已出现的城市（含中英文名）。
- batch>1 时必须给出明显不同的新名单，不要复用上一批。
</hard_rules>`

  const example = isEn
    ? '{ "destinations": [{ "name": "Barcelona", "subtitle": "Barcelona" }, { "name": "Kyoto", "subtitle": "Kyoto" }] }'
    : '{ "destinations": [{ "name": "巴塞罗那", "subtitle": "Barcelona" }, { "name": "京都", "subtitle": "Kyoto" }] }'

  const system = buildPrompt(
    role,
    null,
    langRule,
    hardRules,
    jsonContract(
      '{ destinations: [{ name, subtitle? }] }',
      example,
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
      isEn ? 'Model did not return any destinations.' : '大模型没有返回热门目的地。',
    )
  }

  const parsed = extractJsonObject(text)
  const list = (parsed?.destinations as unknown[]) || []
  if (!Array.isArray(list) || !list.length) {
    throw new LlmRequestError(
      isEn ? 'Could not parse the destination list.' : '无法解析热门目的地列表。',
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
      isEn ? 'Destination list is empty after filtering.' : '热门目的地列表为空。',
    )
  }

  return out.slice(0, 10)
}
