/**
 * LLM call sites for destination quick-pick chips.
 */
import { buildPrompt, jsonContract } from '../prompts'
import { LlmRequestError } from '../errors'
import { extractJsonObject } from '../json'
import type { DestinationSuggestion } from '../types'
import { generateText, isLlmConfigured } from './_service'

export type { DestinationSuggestion }

function toExcludeSet(names: string[]): Set<string> {
  return new Set(names.map((n) => n.toLowerCase().trim()).filter(Boolean))
}

/**
 * Suggest popular travel destinations for quick-select chips.
 * Returns Chinese labels with optional local/English subtitle.
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
}): Promise<DestinationSuggestion[]> {
  if (!isLlmConfigured()) {
    throw new LlmRequestError('未配置 OpenAI API Key，无法生成热门目的地。', 'missing_key')
  }

  const count = Math.min(10, Math.max(6, options?.count ?? 8))
  const batch = Math.max(1, options?.batch || 1)
  const avoidAlso = [
    ...(options?.excludeNames || []),
    ...(options?.currentDestination?.trim() ? [options.currentDestination.trim()] : []),
  ]
  const exclude = toExcludeSet(avoidAlso)

  const system = buildPrompt(
    '旅行灵感助手。为中文用户推荐当下热门旅游城市/目的地。',
    null,
    `<hard_rules>
- 恰好推荐 ${count} 个热门旅游目的地（城市为主，可含个别地区）。
- name 用简体中文常见称呼（如 巴黎、东京、巴塞罗那）。
- subtitle 用当地官方或英文常用名（如 Paris、Tokyo）。
- 覆盖欧亚美等不同区域，避免全是同一国家。
- 不要编造不存在的地名。
- 严禁推荐 avoidAlso 与 currentDestination 中已出现的城市（含中英文名）。
- batch>1 时必须给出明显不同的新名单，不要复用上一批。
</hard_rules>`,
    jsonContract(
      '{ destinations: [{ name: "巴黎", subtitle: "Paris" }] }',
      '{ "destinations": [{ "name": "巴塞罗那", "subtitle": "Barcelona" }, { "name": "京都", "subtitle": "Kyoto" }] }',
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
    throw new LlmRequestError('大模型没有返回热门目的地。')
  }

  const parsed = extractJsonObject(text)
  const list = (parsed?.destinations as unknown[]) || []
  if (!Array.isArray(list) || !list.length) {
    throw new LlmRequestError('无法解析热门目的地列表。')
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
    throw new LlmRequestError('热门目的地列表为空。')
  }

  return out.slice(0, 10)
}
