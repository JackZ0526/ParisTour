/**
 * LLM call site for intelligent preference tag extraction from natural language.
 */
import { buildPrompt, jsonContract, COMMON_RULES } from '../prompts'
import { extractJsonObject } from '../json'
import { generateText, isLlmConfigured } from './_service'

/** Clean emoji / punctuation from tag string */
function cleanTag(text: string): string {
  return text
    .replace(/^[\p{Extended_Pictographic}\uFE0F\u200D\s·•✨☕🍽️🚶🏰🏛️🌿📸🎨🥐🍷🛍️🥖🗼👶💰\-\+\*]+/gu, '')
    .trim()
}

/** Smart rule-based fallback when LLM is offline or unconfigured */
function fallbackExtractTags(input: string): string[] {
  const parts = input
    .split(/[,，.。;；!！\n\r、]+/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 2)

  if (!parts.length) {
    const trimmed = cleanTag(input)
    return trimmed ? [trimmed.slice(0, 5)] : []
  }

  return parts.slice(0, 6).map((part) => {
    // Strip conversational prefixes like "我喜欢", "能不能多去", "然后我爱吃", "我想", "要"
    const cleaned = part
      .replace(/^(我喜欢|我爱吃|我爱|我想去|我想|想要|能不能多去|能不能|多去|尽量|希望能|然后我爱吃|然后我|然后|顺便|最好|希望)/, '')
      .trim() || part

    return cleanTag(cleaned).slice(0, 5)
  }).filter((t) => t.length >= 2)
}

/**
 * Extract concise travel preference tags from user's natural language input.
 * Pure text tags without emoji, strictly 2-5 Chinese characters each.
 * E.g., "我喜欢文艺，能不能多去博物馆和名人故居，然后我爱吃意大利菜，喜欢吃肉" ->
 * ["艺术画廊", "意式风味", "牛排肉食", "名人故居"]
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
      '巴黎旅行偏好提炼专家。你的任务是将用户自由输入的口语化旅行期望与需求，深度归纳、提炼为极简、专业的纯文字旅行偏好标签（Tag Chips）。',
      null,
      COMMON_RULES,
      `<hard_rules>
- 彻底摆脱用户的口语化原句，严禁直接把用户原句断句作为标签！
- 提炼 2 到 5 个精炼、专业的独立偏好标签。
- 【严禁包含 Emoji】：标签必须是纯中文汉字短语，绝对不要包含任何 Emoji 表情或符号！
- 【字数硬性红线】：每个标签严格在 2 到 5 个汉字之间（严禁超过 5 个汉字）！
- 经典极简转换示例：
  * "我喜欢文艺，能不能多去博物馆和名人故居，然后我爱吃意大利菜，喜欢吃肉" -> ["艺术画廊", "意式风味", "牛排肉食", "名人故居"]
  * "想多去小众咖啡馆拍照，晚上吃生蚝，尽量少走路" -> ["小众咖啡", "摄影出片", "生蚝海鲜", "轻松少步"]
  * "带小孩，不要太累，想看铁塔夜景" -> ["亲子友好", "铁塔夜景"]
  * "喜欢复古市集和法式甜点" -> ["玛黑中古", "法式甜点"]
- 严格输出 JSON 格式：{"tags": ["标签1", "标签2", ...]}
</hard_rules>`,
      jsonContract(
        '{ tags: ["艺术画廊", "意式风味", "牛排肉食"] }',
        '{ "tags": ["艺术画廊", "意式风味", "牛排肉食"] }',
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
          .map((t) => cleanTag(String(t || '')))
          .filter((t) => t.length >= 2)
          .map((t) => t.slice(0, 5))
        if (clean.length > 0) return clean
      }
    }
  } catch (err) {
    console.error('[extractPreferenceTags] LLM extraction encountered error:', err)
  }

  // Fallback if LLM failed
  return fallbackExtractTags(text)
}
