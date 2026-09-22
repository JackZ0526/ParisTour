import { localizePrefTag } from '../../i18n/localeEnum'
import { jevTranslationInstruction } from '../../i18n/jevEnglish'

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u
const cache = new Map<string, { value: string; at: number }>()
const opaque = new Set(['id', 'placeId', 'placeKey', 'googlePlaceId', 'bookingHotelId'])

export function clearJevEnglishCache() { cache.clear() }

/** Translate a copy of decision data, never mutate the user's persisted text or IDs. */
export async function englishJevState(context: unknown, signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted()
  const state = JSON.parse(JSON.stringify(context))
  const missing = new Set<string>()
  function visit(value: unknown, replace: (text: string) => string, key = ''): unknown {
    if (typeof value === 'string') {
      if (opaque.has(key) || !CJK.test(value)) return value
      const preset = localizePrefTag(value, 'en')
      return CJK.test(preset) ? replace(preset) : preset
    }
    if (Array.isArray(value)) return value.map((v) => visit(v, replace, key))
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, visit(v, replace, k)]))
    return value
  }
  visit(state, (text) => {
    const hit = cache.get(text)
    if (!hit || Date.now() - hit.at > 3_600_000) missing.add(text)
    return text
  })
  const texts = [...missing]
  if (texts.length) {
    const { callOpenAIMessages } = await import('./transport')
    const raw = await callOpenAIMessages([
      { role: 'system', content: jevTranslationInstruction },
      { role: 'user', content: JSON.stringify({ texts }) },
    ], { preflight: false, webSearch: false, thinking: { enabled: false, effort: 'off', source: 'auto' }, responseFormat: 'json_object', retryEmpty: false, signal })
    signal?.throwIfAborted()
    const translations: unknown = JSON.parse(raw).translations
    if (!Array.isArray(translations) || translations.length !== texts.length
      || translations.some((v) => typeof v !== 'string' || !v.trim() || CJK.test(v))) {
      throw new Error('Invalid English decision context')
    }
    for (let i = 0; i < texts.length; i++) {
      cache.set(texts[i], { value: translations[i], at: Date.now() })
    }
  }
  const result = JSON.stringify(visit(state, (text) => {
    const hit = cache.get(text)
    if (!hit) throw new Error('Missing English decision context')
    return hit.value
  }))
  while (cache.size > 256) cache.delete(cache.keys().next().value!)
  // Reject untranslated keys/opaque identifiers too; callers use the existing fallback.
  if (CJK.test(result)) throw new Error('Decision context still contains CJK text')
  return result
}
