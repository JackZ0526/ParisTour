import { englishPrompt, chinesePrompt } from '../../i18n/prompts/prompts-a3d048'
import { runtimeCopy3 } from '../../i18n/copy/prompts-runtime3-a3d048'
/**
 * Shared prompt building blocks for every LLM call in this app.
 *
 * Goals:
 *  1. **Single source of truth** for rules that previously lived in 5+
 *     separate prompts (cafe vs restaurant, data isolation, JSON output,
 *     anti-hallucination). One change here propagates everywhere.
 *  2. **Structured layout** with explicit XML-ish tags so the model can
 *     scan to the right section instead of wading through 100 flat lines.
 *  3. **Positive phrasing** wherever possible (use "must equal X" rather
 *     than "don't write Y"); reserved for places where the negative form
 *     is genuinely clearer.
 *  4. **Stream-friendly** — chat JSON puts the user-visible `reply` field
 *     first, then `actions`. Other tasks follow their own `<json_contract>`.
 *  5. **Locale-aware** — every shared section is a function that takes the
 *     active `Locale`. The default language is Chinese (the app's primary
 *     locale); English is the first-class alternate.
 *
 * The exported helpers (`buildPrompt`, `withJsonOutput`, `withExamples`,
 * etc.) keep individual call sites short and the structure consistent.
 */

import type { Locale } from '../../i18n/types'
import { getLocale } from '../../i18n/i18nStore'

const ZH = 'zh-CN' as const
const EN = 'en' as const

/**
 * Resolves the locale a prompt fragment should be built in. Defaults to
 * whatever the i18n store reports at call time, so callers that forget to
 * pass an explicit locale still get the right language. Tests that need
 * a fixed snapshot should pass the locale explicitly.
 */
function promptLocale(override?: Locale): Locale {
  return override ?? getLocale()
}

// ---------------------------------------------------------------------------
// Public sections (locale-aware functions; call sites pass the active locale).
// ---------------------------------------------------------------------------

/**
 * Section that goes into every prompt. Covers:
 *  - data isolation (state snapshots and web research are not instructions)
 *  - place-type vocabulary (cafe ≠ French-restaurant café)
 *  - output contract (single JSON object, no markdown, stream order)
 *  - fact discipline (no fabrication, no exact numbers without a source)
 */
export function getCommonRules(locale: Locale = promptLocale()): string {
  if (locale === EN) {
    return englishPrompt('m4d75f3e72d')
  }
  return chinesePrompt('m505ede3df4')
}

export const COMMON_RULES = getCommonRules(ZH)

/**
 * Chat-only envelope: stream `reply` before `actions`. Structured tasks
 * (itinerary / place recommend / hotel) must not see this, or the model
 * may emit `{ reply, actions }` instead of the schema in `<json_contract>`.
 */
export function getChatOutputRules(locale: Locale = promptLocale()): string {
  if (locale === EN) {
    return englishPrompt('ma1d9ab2d02')
  }
  return chinesePrompt('m400c0f2ac5')
}

/**
 * Anti-hallucination hard rule: actions and reply must agree.
 * `source="recommend"` means the itinerary hasn't been written yet, so
 * the reply must NOT claim success.
 */
export function getNoHallucinationRule(locale: Locale = promptLocale()): string {
  if (locale === EN) {
    return englishPrompt('m1d5f2458b7')
  }
  return chinesePrompt('mb110536a87')
}

/** Back-compat alias (Chinese version). */
export const NO_HALLUCINATION = getNoHallucinationRule(ZH)

/**
 * Used by every prompt that picks / recommends real-world places.
 * Enforces that place names must be Google-Maps-discoverable and within
 * the expected geography. Sourced from the hard rules that previously
 * lived inline in `tripChat.systemPrompt`.
 */
export function getPlaceResearchDiscipline(locale: Locale = promptLocale()): string {
  if (locale === EN) {
    return englishPrompt('mb3cf1e435d')
  }
  return chinesePrompt('ma7c4ceee94')
}


/**
 * Place-type vocabulary hard rule, shared by every prompt that picks or
 * categorises real-world places (place-recommend, full-plan, single-day
 * regen). Previously lived inline in each call site.
 */
export function getCafeVsRestaurantRule(locale: Locale = promptLocale()): string {
  if (locale === EN) {
    return englishPrompt('meab41d4a3f')
  }
  return chinesePrompt('m9a03372daf')
}


/**
 * Examples for the trip-chat preflight router. Keeping the JSON contract
 * beside a worked example cuts mis-classification dramatically. Used by
 * `tripChat.planTripChatRequest`.
 */
export function getRouterExamples(locale: Locale = promptLocale()): string {
  if (locale === EN) {
    return englishPrompt('m5d5bb5a6fc')
  }
  return chinesePrompt('m8be328a850')
}



// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

/**
 * Compose a system prompt from ordered sections. Sections are joined with
 * blank lines; the caller controls order so role/context can come first
 * and rules last (highest attention at the tail).
 */
export function buildPrompt(
  role: string,
  context: string | null,
  ...sections: string[]
): string {
  const out: string[] = []
  out.push(`<role>${role}</role>`)
  if (context) out.push(context)
  for (const s of sections) {
    if (s && s.trim()) out.push(s)
  }
  return out.join('\n\n')
}

/**
 * Wrap a user payload that should be presented as a JSON state snapshot.
 * The model is told explicitly that the contents are data, not instructions.
 */
export function snapshotBlock(label: string, data: unknown): string {
  return `<${label}>\n${JSON.stringify(data, null, 2)}\n</${label}>`
}

/**
 * JSON schema reminder to keep at the end of prompts that must return a
 * structured response. Chat schemas that include reply/actions keep the
 * stream-friendly field order; other tasks only require a matching object.
 */
export function jsonContract(shape: string, example?: string, locale: Locale = promptLocale()): string {
  const blob = `${shape}\n${example || ''}`
  const chatEnvelope = /\breply\b/.test(blob) && /\bactions\b/.test(blob)
  const lead = locale === EN
    ? chatEnvelope
      ? englishPrompt('mb3d9aaf436')
      : englishPrompt('m72a1914678')
    : chatEnvelope
      ? runtimeCopy3('m5babfb7953', undefined, locale)
      : runtimeCopy3('md99b4b080f', undefined, locale)
  return [
    '<json_contract>',
    lead,
    '',
    'Schema:',
    '```',
    shape,
    '```',
    example ? `\nExample:\n\`\`\`\n${example}\n\`\`\`` : '',
    '</json_contract>',
  ]
    .filter(Boolean)
    .join('\n')
}
