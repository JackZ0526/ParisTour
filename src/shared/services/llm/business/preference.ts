/**
 * LLM call site for intelligent preference tag extraction from natural language.
 */
import { buildPrompt, jsonContract, COMMON_RULES } from '../prompts'
import { extractJsonObject } from '../json'
import { generateText, isLlmConfigured } from './_service'

/** Smart rule-based fallback when LLM is offline or unconfigured */
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
    // Strip conversational prefixes like "我喜欢", "能不能多去", "然后我爱吃", "我想", "要"
    const cleaned = part
      .replace(/^(我喜欢|我爱吃|我爱|我想去|我想|想要|能不能多去|能不能|多去|尽量|希望能|然后我爱吃|然后我|然后|顺便|最好|希望)/, '')
      .trim() || part

    if (cleaned.includes('咖啡') || cleaned.includes('早餐')) return `☕ ${cleaned}`
    if (cleaned.includes('餐') || cleaned.includes('吃') || cleaned.includes('菜') || cleaned.includes('肉') || cleaned.includes('美食')) return `🍽️ ${cleaned}`
    if (cleaned.includes('走') || cleaned.includes('步') || cleaned.includes('累') || cleaned.includes('慢')) return `🚶 ${cleaned}`
    if (cleaned.includes('照') || cleaned.includes('摄影') || cleaned.includes('机位') || cleaned.includes('景')) return `📸 ${cleaned}`
    if (cleaned.includes('艺术') || cleaned.includes('馆') || cleaned.includes('画') || cleaned.includes('展') || cleaned.includes('文艺') || cleaned.includes('故居')) return `🎨 ${cleaned}`
    if (cleaned.includes('购') || cleaned.includes('买') || cleaned.includes('店') || cleaned.includes('市集')) return `🛍️ ${cleaned}`
    if (cleaned.includes('酒') || cleaned.includes('夜') || cleaned.includes('船') || cleaned.includes('巡航')) return `🍷 ${cleaned}`
    if (cleaned.includes('孩') || cleaned.includes('娃') || cleaned.includes('亲子') || cleaned.includes('家庭')) return `👶 ${cleaned}`
    return `✨ ${cleaned}`
  })
}

/**
 * Extract concise travel preference tags from user's natural language input.
 * E.g., "我喜欢文艺，能不能多去博物馆和名人故居，然后我爱吃意大利菜，喜欢吃肉" ->
 * ["🎨 深度艺术馆与故居探访", "🍝 经典意式风味餐厅", "🥩 纯正牛排肉食体验", "🏛️ 文艺历史巡礼"]
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
      '巴黎旅行偏好提炼专家。你的任务是将用户自由输入的口语化旅行期望与需求，深度归纳、提炼为标准专业的旅行偏好标签（Tag Chips）。',
      null,
      COMMON_RULES,
      `<hard_rules>
- 彻底摆脱用户的口语化原句，严禁直接把用户原句断句作为标签！
- 提炼 2 到 5 个精炼、专业的独立偏好标签。
- 每个标签 4 到 10 个字，概括具体偏好，且开头必须前缀一个最契合的 Emoji 图标。
- 经典提炼示例：
  * "我喜欢文艺，能不能多去博物馆和名人故居，然后我爱吃意大利菜，喜欢吃肉" -> ["🎨 深度艺术馆与故居探访", "🍝 经典意式风味餐厅", "🥩 纯正牛排肉食体验", "🏛️ 文艺历史巡礼"]
  * "想多去小众咖啡馆拍照，晚上吃生蚝，尽量少走路" -> ["☕ 小众精品咖啡馆探店", "📸 绝佳摄影出片机位", "🦪 晚餐海鲜生蚝盛宴", "🚶 慢节奏少步行漫游"]
  * "带小孩，不要太累，想看铁塔夜景" -> ["👶 亲子友好轻松节奏", "🗼 埃菲尔铁塔夜景观景"]
- 严格输出 JSON：{"tags": ["标签1", "标签2", ...]}
</hard_rules>`,
      jsonContract(
        '{ tags: ["🎨 深度艺术馆探访", "🍝 经典意式风味美食", "🥩 牛排肉食体验"] }',
        '{ "tags": ["🎨 深度艺术馆探访", "🍝 经典意式风味美食", "🥩 牛排肉食体验"] }',
      ),
    )

    const user = JSON.stringify({
      userRequirementText: text,
      currentExistingTags: options?.existingTags || [],
    })

    const raw = await generateText(system, user, {
      strict: true,
      task: 'preferenceExtract',
      json: true,
      signal: options?.signal,
    })

    if (raw) {
      const parsed = extractJsonObject(raw)
      const list = (parsed?.tags as unknown[]) || []
      if (Array.isArray(list) && list.length > 0) {
        const clean = list
          .map((t) => String(t || '').trim())
          .filter((t) => t.length >= 2 && t.length <= 30)
        if (clean.length > 0) return clean
      }
    }
  } catch (err) {
    console.error('[extractPreferenceTags] LLM extraction encountered error:', err)
  }

  // Fallback if LLM failed
  return fallbackExtractTags(text)
}
