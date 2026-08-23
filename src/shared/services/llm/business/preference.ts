/**
 * LLM call site for intelligent preference tag extraction from natural language.
 */
import { buildPrompt, jsonContract, COMMON_RULES } from '../prompts'
import { extractJsonObject } from '../json'
import { generateText, isLlmConfigured } from './_service'
import {
  getLocale,
  getLlmLanguageInstruction,
  type Locale,
} from '../../../i18n'

/** Strip emoji / leading bullets and the legacy Chinese decorative punctuation
 *  that sometimes ends up in tag strings. */
function cleanTag(text: string): string {
  return text
    .replace(/^[\p{Extended_Pictographic}\uFE0F\u200D\s·•✨☕🍽️🚶🏰🏛️🌿📸🎨🥐🍷🛍️🥖🗼👶💰\-\+\*]+/gu, '')
    .replace(/[\p{Extended_Pictographic}\uFE0F\u200D]+/gu, '')
    .trim()
}

/** Smart rule-based fallback when LLM is offline or unconfigured.
 *  Locale-aware: Chinese strips Chinese conversational prefixes; English splits
 *  on commas/periods and strips English prefixes like "I like", "I want". */
function fallbackExtractTags(input: string, locale: Locale): string[] {
  if (locale === 'en') {
    // Split on common English delimiters and "and"/"&" connectors
    const parts = input
      .split(/[,.;:!?\n\r]+|\s+(?:and|&)\s+/i)
      .map((p) => p.trim())
      .filter((p) => p.length >= 2)
    if (!parts.length) {
      const trimmed = cleanTag(input)
      return trimmed ? [trimmed.split(/\s+/).slice(0, 4).join(' ')] : []
    }
    return parts.slice(0, 6).map((part) => {
      const cleaned = part
        .replace(
          /^(i\s+(?:really\s+)?(?:like|love|enjoy|prefer|want|would\s+like|hate)|i\s+am|i'm|we\s+(?:like|love|prefer|want)|please\s+(?:include|add|give|show)|more\s+|less\s+|avoid\s+)/i,
          '',
        )
        .trim() || part
      // Cap each English tag to 4 words max
      return cleanTag(cleaned).split(/\s+/).slice(0, 4).join(' ')
    }).filter((t) => t.length >= 2)
  }

  // Chinese (default) fallback
  const parts = input
    .split(/[,，.。;；!！\n\r、]+/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 2)

  if (!parts.length) {
    const trimmed = cleanTag(input)
    return trimmed ? [trimmed.slice(0, 5)] : []
  }

  return parts.slice(0, 6).map((part) => {
    const cleaned = part
      .replace(/^(我喜欢|我爱吃|我爱|我想去|我想|想要|能不能多去|能不能|多去|尽量|希望能|然后我爱吃|然后我|然后|顺便|最好|希望)/, '')
      .trim() || part

    return cleanTag(cleaned).slice(0, 5)
  }).filter((t) => t.length >= 2)
}

function buildSystemPrompt(locale: Locale): string {
  const langRule = getLlmLanguageInstruction(locale)
  if (locale === 'en') {
    return buildPrompt(
      'Paris travel preference extractor. Your job is to deeply condense a user\'s free-form, conversational travel wishes into a tight set of professional, plain-text travel preference chips.',
      null,
      COMMON_RULES,
      `<hard_rules>
- ${langRule}
- Strip the user's conversational phrasing entirely; never return raw fragments of the input as a tag.
- Produce 2 to 5 concise, professional preference tags.
- NO EMOJI. Tags must be plain text only — no emojis, symbols, or punctuation.
- Length: each tag is 1 to 4 English words (do NOT exceed 4 words).
- Prefer mapping the user\'s intent to one of the canonical tag codes below when it fits; otherwise invent a new short English tag.
- Canonical tag codes (return the chip text, not the code):
  * Morning coffee, Lunch + dinner, Light walking, Disney Paris, Arc de Triomphe & Champs, Skip big museums
  * Photo spots, Art galleries, French bakery, Seine cruise, Marais vintage, Local markets
  * Eiffel night view, Family-friendly, Affordable eats
- Concrete examples:
  * "I love art, can we hit a few museums and historic houses, and I love Italian food and steak" -> ["Art galleries", "Italian food", "Steak", "Historic houses"]
  * "I want indie coffee shops for photos, oysters at night, and minimal walking" -> ["Indie coffee", "Photo spots", "Seafood", "Light walking"]
  * "Traveling with kids, nothing too tiring, want to see the Eiffel Tower lit up at night" -> ["Family-friendly", "Eiffel night view"]
  * "I love vintage markets and French pastries" -> ["Marais vintage", "French bakery"]
- Strict JSON output: {"tags": ["tag1", "tag2", ...]}
</hard_rules>`,
      jsonContract(
        '{ tags: ["Art galleries", "Italian food", "Steak"] }',
        '{ "tags": ["Art galleries", "Italian food", "Steak"] }',
      ),
    )
  }

  // Chinese (default)
  return buildPrompt(
    '巴黎旅行偏好提炼专家。你的任务是将用户自由输入的口语化旅行期望与需求，深度归纳、提炼为极简、专业的纯文字旅行偏好标签（Tag Chips）。',
    null,
    COMMON_RULES,
    `<hard_rules>
- ${langRule}
- 彻底摆脱用户的口语化原句，严禁直接把用户原句断句作为标签！
- 提炼 2 到 5 个精炼、专业的独立偏好标签。
- 【严禁包含 Emoji】：标签必须是纯中文汉字短语，绝对不要包含任何 Emoji 表情或符号！
- 【字数硬性红线】：每个标签严格在 2 到 5 个汉字之间（严禁超过 5 个汉字）！
- 优先映射到下方的标准 tag code（直接返回中文文案，而不是 code）：
  * 晨间咖啡、两顿正餐、轻松少步行、巴黎迪士尼、凯旋门香街、避开大展馆
  * 摄影出片、艺术画廊、法式烘焙、塞纳河游船、玛黑中古店、在地市集
  * 铁塔夜景、亲子友好、平价美食
- 经典极简转换示例：
  * "我喜欢文艺，能不能多去博物馆和名人故居，然后我爱吃意大利菜，喜欢吃肉" -> ["艺术画廊", "意式风味", "牛排肉食", "名人故居"]
  * "想多去小众咖啡馆拍照，晚上吃生蚝，尽量少走路" -> ["小众咖啡", "摄影出片", "生蚝海鲜", "轻松少步行"]
  * "带小孩，不要太累，想看铁塔夜景" -> ["亲子友好", "铁塔夜景"]
  * "喜欢复古市集和法式甜点" -> ["玛黑中古店", "法式烘焙"]
- 严格输出 JSON 格式：{"tags": ["标签1", "标签2", ...]}
</hard_rules>`,
    jsonContract(
      '{ tags: ["艺术画廊", "意式风味", "牛排肉食"] }',
      '{ "tags": ["艺术画廊", "意式风味", "牛排肉食"] }',
    ),
  )
}

/**
 * Extract concise travel preference tags from user's natural language input.
 * Pure text tags without emoji; strict length cap depends on the active locale
 * (Chinese: 2–5 chars; English: 1–4 words).
 *
 * Examples (Chinese):
 *   "我喜欢文艺..." -> ["艺术画廊", "意式风味", "牛排肉食", "名人故居"]
 *
 * Examples (English):
 *   "I love art, can we hit a few museums..." -> ["Art galleries", "Italian food", "Steak", "Historic houses"]
 */
export async function extractPreferenceTags(
  userInput: string,
  options?: {
    existingTags?: string[]
    /** Optional explicit locale override. Falls back to the active i18n locale. */
    locale?: Locale
    signal?: AbortSignal
  },
): Promise<string[]> {
  const text = userInput.trim()
  if (!text) return []

  const locale: Locale = options?.locale ?? getLocale()
  const isEn = locale === 'en'

  if (!isLlmConfigured()) {
    return fallbackExtractTags(text, locale)
  }

  try {
    const system = buildSystemPrompt(locale)
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
          .map((t) =>
            isEn
              ? t.split(/\s+/).filter(Boolean).slice(0, 4).join(' ')
              : t.slice(0, 5),
          )
          .filter((t) => t.length >= 2)
        if (clean.length > 0) return clean
      }
    }
  } catch (err) {
    console.error('[extractPreferenceTags] LLM extraction encountered error:', err)
  }

  // Fallback if LLM failed
  return fallbackExtractTags(text, locale)
}
