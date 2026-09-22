import { englishPromptFragments, chinesePromptFragments } from '../../../shared/i18n/prompts/translate-fragments-f37c5d'
import { chinesePrompt } from '../../../shared/i18n/prompts/translate-f37c5d'
import {
  extractLlmJsonObject,
  extractPartialJsonStringArray,
  extractPartialJsonStringField,
  isLlmConfigured,
  openaiChatStream,
} from '../../../shared/services/llm/llm'
import { getLlmArtifact, setLlmArtifact } from '../../../shared/services/llm/llmArtifactStore'
import { memoizeLlmCall } from '../../../shared/services/llm/llmMemo'
import { buildPrompt, jsonContract } from '../../../shared/services/llm/prompts'

const MEMORY_CACHE = new Map<string, string>()
const TRANSLATIONS_ARTIFACT_KEY = 'translations:zh'
const HOTEL_LOCATION_ARTIFACT_KEY = 'translations:hotel-location:zh:v2'
const PLACE_NAME_ARTIFACT_KEY = 'place-names:zh'

type TranslationMap = Record<string, string>

function readDurableCache(key = TRANSLATIONS_ARTIFACT_KEY): TranslationMap {
  const stored = getLlmArtifact<TranslationMap>(key)
  return stored && typeof stored === 'object' ? stored : {}
}

function writeDurableCache(map: TranslationMap, key = TRANSLATIONS_ARTIFACT_KEY) {
  setLlmArtifact(key, map)
}

function cacheGet(text: string, artifactKey = TRANSLATIONS_ARTIFACT_KEY): string | undefined {
  const memKey = `${artifactKey}|${text}`
  const mem = MEMORY_CACHE.get(memKey)
  if (mem) return mem
  const durable = readDurableCache(artifactKey)[text]
  if (durable) {
    MEMORY_CACHE.set(memKey, durable)
    return durable
  }
  return undefined
}

function cacheSet(
  original: string,
  translated: string,
  artifactKey = TRANSLATIONS_ARTIFACT_KEY,
) {
  const memKey = `${artifactKey}|${original}`
  MEMORY_CACHE.set(memKey, translated)
  writeDurableCache({ ...readDurableCache(artifactKey), [original]: translated }, artifactKey)
}

/** True when the text is already mostly Chinese (or has no Latin letters to translate). */
export function looksChinese(text: string): boolean {
  const chars = text.replace(/\s+/g, '')
  if (!chars) return true

  const cjk = (chars.match(/[\u3400-\u9fff\uf900-\ufaff]/g) || []).length
  const latin = (chars.match(/[A-Za-z\u00C0-\u024F]/g) || []).length

  if (latin === 0) return true
  if (cjk === 0) return false
  return cjk >= latin * 0.6
}

type TranslateOptions = {
  onPartial?: (map: Map<string, string>) => void
}

/**
 * Translate non-Chinese texts to Simplified Chinese.
 * Dedupes in-flight batches and caches results in memory + durable trip artifacts.
 */
export async function translateTextsToChinese(
  texts: string[],
  options?: TranslateOptions,
): Promise<Map<string, string>> {
  return translateWithPrompt(texts, {
    artifactKey: TRANSLATIONS_ARTIFACT_KEY,
    batchKeyPrefix: 'translate',
    systemPrompt: chinesePromptFragments('mfc2907b1df'),
    example:
      chinesePrompt('m1c94ce909a'),
    outputRules: chinesePrompt('m7f9602e43d'),
    onPartial: options?.onPartial,
  })
}

async function translateWithPrompt(
  texts: string[],
  options: {
    artifactKey: string
    batchKeyPrefix: string
    systemPrompt: string
    example: string
    outputRules: string
    onPartial?: (map: Map<string, string>) => void
  },
): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  const unique = [...new Set(texts.map((t) => t.trim()).filter(Boolean))]

  const needTranslate: string[] = []
  for (const text of unique) {
    if (looksChinese(text)) {
      result.set(text, text)
      continue
    }
    const cached = cacheGet(text, options.artifactKey)
    if (cached) {
      result.set(text, cached)
      continue
    }
    needTranslate.push(text)
  }

  if (!needTranslate.length) {
    options.onPartial?.(new Map(result))
    return result
  }

  if (!isLlmConfigured()) {
    for (const text of needTranslate) result.set(text, text)
    return result
  }

  const batchKey = `${options.batchKeyPrefix}:${needTranslate.slice().sort().join('\n')}`

  const translatedBatch = await memoizeLlmCall(batchKey, async () => {
    const raw = await openaiChatStream(
      [
        {
          role: 'system',
          content: buildPrompt(
            options.systemPrompt,
            null,
            jsonContract('{ translations: ["..."] }', options.example),
            options.outputRules,
          ),
        },
        {
          role: 'user',
          content: JSON.stringify({ texts: needTranslate }),
        },
      ],
      {
        task: 'translate',
        thinking: { enabled: false, effort: 'low', source: 'auto' },
        preflight: false,
        userText: needTranslate[0],
        webSearch: false,
        responseFormat: 'json_object',
        onDelta: (_delta, fullText) => {
          if (!options.onPartial) return
          const list = extractPartialJsonStringArray(fullText, 'translations')
          if (!list?.length) return
          const partial = new Map(result)
          needTranslate.forEach((original, i) => {
            const translated = String(list[i] || '').trim()
            if (translated) partial.set(original, translated)
          })
          options.onPartial(partial)
        },
      },
    )

    const parsed = extractLlmJsonObject(raw)
    const list = (parsed?.translations as unknown[]) || []
    return needTranslate.map((original, i) => {
      const translated = String(list[i] || '').trim()
      return translated || original
    })
  })

  needTranslate.forEach((original, i) => {
    const translated = translatedBatch[i] || original
    if (translated !== original) cacheSet(original, translated, options.artifactKey)
    result.set(original, translated)
  })

  options.onPartial?.(new Map(result))
  return result
}

/**
 * Translate hotel location / facility blurbs with readable Chinese layout.
 */
export async function translateHotelLocationTextsToChinese(
  texts: string[],
  options?: TranslateOptions,
): Promise<Map<string, string>> {
  return translateWithPrompt(texts, {
    artifactKey: HOTEL_LOCATION_ARTIFACT_KEY,
    batchKeyPrefix: 'translate-hotel-location',
    systemPrompt:
      chinesePrompt('m56d7226650'),
    example:
      chinesePrompt('mc2e60fc7bf'),
    outputRules: chinesePrompt('m5ec7849aa9'),
    onPartial: options?.onPartial,
  })
}

/** Sync peek of a cached place-name translation (no network). */
export function peekPlaceNameZh(original: string): string | undefined {
  const key = original.trim()
  if (!key) return undefined
  return cacheGet(key, PLACE_NAME_ARTIFACT_KEY)
}

/**
 * Translate a place / shop display name into a short Simplified Chinese label.
 * Returns null when translation is unavailable or identical to the original.
 *
 * Pass `onPartial` to receive progressive `zh` while the JSON streams
 * (same pattern as `generatePlaceDetailCopy`). Cache hits skip streaming.
 */
export async function translatePlaceNameToChinese(
  original: string,
  options?: {
    onPartial?: (zh: string) => void
    signal?: AbortSignal
  },
): Promise<string | null> {
  const key = original.trim()
  if (!key) return null
  if (looksChinese(key)) return null

  const cached = cacheGet(key, PLACE_NAME_ARTIFACT_KEY)
  if (cached) {
    // Cache hit: no stream — caller should seed UI from peekPlaceNameZh / final value.
    return looksChinese(cached) && cached !== key ? cached : null
  }

  if (!isLlmConfigured()) return null

  const memoKey = `place-name-zh:${key.toLowerCase()}`
  const translated = await memoizeLlmCall(
    memoKey,
    async () => {
      let lastZh = ''
      const raw = await openaiChatStream(
        [
          {
            role: 'system',
            content: buildPrompt(
              chinesePromptFragments('m8f79ac954b'),
              null,
              jsonContract('{ zh: "..." }', chinesePromptFragments('m1327a71f58')),
              chinesePrompt('m278480dfe6'),
            ),
          },
          {
            role: 'user',
            content: JSON.stringify({
              name: key,
              locale: 'zh-CN',
              context: englishPromptFragments('mb36980739a'),
            }),
          },
        ],
        {
          task: 'translate',
          thinking: { enabled: false, effort: 'low', source: 'auto' },
          preflight: false,
          userText: key,
          webSearch: false,
          responseFormat: 'json_object',
          signal: options?.signal,
          onDelta: (_delta, fullText) => {
            if (!options?.onPartial) return
            const zh = extractPartialJsonStringField(fullText, 'zh')
            if (zh == null || zh === lastZh) return
            lastZh = zh
            options.onPartial(zh)
          },
        },
      )
      const parsed = extractLlmJsonObject(raw)
      const final = String(parsed?.zh || '').trim() || key
      if (options?.onPartial && final !== lastZh) {
        options.onPartial(final)
      }
      return final
    },
    { durable: true },
  )

  if (!translated || translated === key || !looksChinese(translated)) return null
  cacheSet(key, translated, PLACE_NAME_ARTIFACT_KEY)
  return translated
}
