/**
 * LLM call site for intelligent preference tag extraction from natural language.
 */
import { buildPrompt, jsonContract } from '../prompts'
import { extractJsonObject } from '../json'
import { generateText, isLlmConfigured } from './_service'

/** Smart rule-based fallback when LLM is not configured or network error occurs */
function fallbackExtractTags(input: string): string[] {
  const parts = input
    .split(/[,，.。;；!！\n\r、]+/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 2 && p.length <= 25)

  if (!parts.length) {
    const trimmed = input.trim()
    return trimmed ? [`✨ ${trimmed.slice(0, 16)}`] : []
  }

  return parts.map((part) => {
    if (part.includes('咖啡') || part.includes('早餐')) return `☕ ${part}`
    if (part.includes('餐') || part.includes('吃') || part.includes('美食')) return `🍽️ ${part}`
    if (part.includes('走') || part.includes('步') || part.includes('累') || part.includes('慢')) return `🚶 ${part}`
    if (part.includes('照') || part.includes('摄影') || part.includes('机位') || part.includes('景')) return `📸 ${part}`
    if (part.includes('艺术') || part.includes('馆') || part.includes('画') || part.includes('展')) return `🎨 ${part}`
    if (part.includes('购') || part.includes('买') || part.includes('店') || part.includes('市集')) return `🛍️ ${part}`
    if (part.includes('酒') || part.includes('夜') || part.includes('船') || part.includes('巡航')) return `🍷 ${part}`
    if (part.includes('孩') || part.includes('娃') || part.includes('亲子') || part.includes('家庭')) return `👶 ${part}`
    return `✨ ${part}`
  })
}

/**
 * Extract concise travel preference tags from user's natural language input.
 * E.g., "想多去小众咖啡馆拍照，晚上吃生蚝，尽量少走路" ->
 * ["☕ 小众咖啡馆探店", "📸 摄影出片机位", "🦪 晚餐生蚝海鲜", "🚶 轻松慢节奏少步行"]
 */
export async function extractPreferenceTags(
  userInput: string,
  options?: {
    existingTags?: string[]
    signal?: AbortSignal
  },
): Promise<string[]> {
  const text = userInput.trim()
  if (!text) return []

  if (!isLlmConfigured()) {
    return fallbackExtractTags(text)
  }

  try {
    const system = buildPrompt(
      '巴黎旅行偏好提取助手。根据用户用自然语言表达的旅行期望与要求，智能提炼为简练、清晰、原子化的旅行偏好标签（Tag Chips）。',
      null,
      `<hard_rules>
- 将用户的输入拆解为 1 到 6 个独立的旅行偏好标签。
- 每个标签应简短精炼（4-12个字），概括一个具体的旅行偏好或约束。
- 每个标签前面必须带一个最契合的 Emoji 图标（如 ☕、🍽️、🚶、📸、🎨、🥐、🍷、🛍️、🥖、🗼、👶、💰、🌿、🏰 等）。
- 标签要便于后续行程推荐大模型理解和执行（例如："☕ 喜欢法式小众咖啡馆"、"🦪 晚餐想吃生蚝海鲜"、"🚶 慢节奏不走回头路"）。
- 不要生成模糊无意义的废话（如"好玩的"、"很开心"）。
- 严禁包含违法或无关内容。
</hard_rules>`,
      jsonContract(
        '{ tags: ["☕ 小众精品咖啡馆", "📸 摄影出片机位", "🦪 晚餐海鲜生蚝"] }',
        '{ "tags": ["☕ 小众精品咖啡馆", "📸 摄影出片机位", "🦪 晚餐海鲜生蚝", "🚶 慢节奏少步行"] }',
      ),
    )

    const user = JSON.stringify({
      userInput: text,
      existingTags: options?.existingTags || [],
    })

    const raw = await generateText(system, user, {
      strict: true,
      task: 'preferenceExtract',
      json: true,
      signal: options?.signal,
    })

    if (!raw) {
      return fallbackExtractTags(text)
    }

    const parsed = extractJsonObject(raw)
    const list = (parsed?.tags as unknown[]) || []
    if (!Array.isArray(list) || !list.length) {
      return fallbackExtractTags(text)
    }

    const clean = list
      .map((t) => String(t || '').trim())
      .filter((t) => t.length >= 2 && t.length <= 30)

    return clean.length ? clean : fallbackExtractTags(text)
  } catch (err) {
    console.warn('[extractPreferenceTags] LLM extraction failed, using fallback:', err)
    return fallbackExtractTags(text)
  }
}
