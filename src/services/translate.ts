import { extractLlmJsonObject, isLlmConfigured, openaiChat } from './llm'
import { memoizeLlmCall } from './llmMemo'

const MEMORY_CACHE = new Map<string, string>()
const SESSION_KEY = 'paris-tour-review-translations-v1'

function readSessionCache(): Record<string, string> {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, string>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeSessionCache(map: Record<string, string>) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(map))
  } catch {
    /* ignore quota */
  }
}

function cacheGet(text: string): string | undefined {
  const mem = MEMORY_CACHE.get(text)
  if (mem) return mem
  const session = readSessionCache()[text]
  if (session) {
    MEMORY_CACHE.set(text, session)
    return session
  }
  return undefined
}

function cacheSet(original: string, translated: string) {
  MEMORY_CACHE.set(original, translated)
  const session = readSessionCache()
  session[original] = translated
  writeSessionCache(session)
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

/**
 * Translate non-Chinese texts to Simplified Chinese.
 * Dedupes in-flight batches and caches results in memory + sessionStorage.
 */
export async function translateTextsToChinese(
  texts: string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  const unique = [...new Set(texts.map((t) => t.trim()).filter(Boolean))]

  const needTranslate: string[] = []
  for (const text of unique) {
    if (looksChinese(text)) {
      result.set(text, text)
      continue
    }
    const cached = cacheGet(text)
    if (cached) {
      result.set(text, cached)
      continue
    }
    needTranslate.push(text)
  }

  if (!needTranslate.length) return result

  if (!isLlmConfigured()) {
    for (const text of needTranslate) result.set(text, text)
    return result
  }

  // Stable key so overlapping UI mounts share one request.
  const batchKey = `translate:${needTranslate.slice().sort().join('\n')}`

  const translatedBatch = await memoizeLlmCall(batchKey, async () => {
    const raw = await openaiChat([
      {
        role: 'system',
        content:
          '你是翻译助手。把用户给出的 Google 评论译成简洁通顺的简体中文。只输出 JSON：{"translations":["..."]}，数组顺序与输入 texts 一致，长度必须相同。不要解释。',
      },
      {
        role: 'user',
        content: JSON.stringify({ texts: needTranslate }),
      },
    ])

    const parsed = extractLlmJsonObject(raw)
    const list = (parsed?.translations as unknown[]) || []
    return needTranslate.map((original, i) => {
      const translated = String(list[i] || '').trim()
      return translated || original
    })
  })

  needTranslate.forEach((original, i) => {
    const translated = translatedBatch[i] || original
    if (translated !== original) cacheSet(original, translated)
    result.set(original, translated)
  })

  return result
}
