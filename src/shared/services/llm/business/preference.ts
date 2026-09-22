import { chinesePromptFragments } from '../../../i18n/prompts/preference-fragments-f69118'
import { englishPrompt, chinesePrompt } from '../../../i18n/prompts/preference-f69118'
/**
 * LLM call site for intelligent preference tag extraction from natural language.
 */
import { buildPrompt, getCommonRules, jsonContract } from '../prompts'
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
      englishPrompt('mc370355366'),
      null,
      getCommonRules(locale),
      englishPrompt('m6ebfec7d93', { p0: (langRule) }),
      jsonContract(
        englishPrompt('mc14ffa7414'),
        englishPrompt('m64f1eba9b0'),
      ),
    )
  }

  // Chinese (default)
  return buildPrompt(
    chinesePrompt('m3b74eca145'),
    null,
    getCommonRules(locale),
    chinesePrompt('mabb58481c2', { p0: (langRule) }),
    jsonContract(
      chinesePromptFragments('m020620eecf'),
      chinesePromptFragments('m7465a7d69b'),
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
    console.error(englishPrompt('m5d9444677d'), err)
  }

  // Fallback if LLM failed
  return fallbackExtractTags(text, locale)
}
