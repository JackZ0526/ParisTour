/**
 * Durable LLM output store (localStorage + trip cloud snapshot).
 *
 * Generate once → persist → reuse across remounts / devices until the user
 * explicitly regenerates (bypass) or the trip is wiped.
 */

const STORAGE_KEY = 'paris-tour-llm-artifacts-v1'

export type LlmArtifactEntry = {
  value: unknown
  generatedAt: number
  model?: string
}

export type LlmArtifactMap = Record<string, LlmArtifactEntry>

type ChangeListener = () => void

const changeListeners = new Set<ChangeListener>()

function readAll(): LlmArtifactMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as LlmArtifactMap
    if (!parsed || typeof parsed !== 'object') return {}
    const out: LlmArtifactMap = {}
    for (const [key, entry] of Object.entries(parsed)) {
      if (!key || !entry || typeof entry !== 'object') continue
      if (!('value' in entry)) continue
      const generatedAt =
        typeof entry.generatedAt === 'number' && Number.isFinite(entry.generatedAt)
          ? entry.generatedAt
          : Date.now()
      out[key] = {
        value: entry.value,
        generatedAt,
        model: typeof entry.model === 'string' ? entry.model : undefined,
      }
    }
    return out
  } catch {
    return {}
  }
}

function writeAll(map: LlmArtifactMap, options?: { silent?: boolean }) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    /* ignore quota / private mode */
  }
  if (!options?.silent) {
    for (const cb of changeListeners) cb()
  }
}

/** Subscribe to durable writes (used to trigger trip cloud autosave). */
export function subscribeLlmArtifacts(listener: ChangeListener): () => void {
  changeListeners.add(listener)
  return () => {
    changeListeners.delete(listener)
  }
}

export function loadLlmArtifacts(): LlmArtifactMap {
  return readAll()
}

export function saveLlmArtifacts(
  map: LlmArtifactMap | null | undefined,
  options?: { silent?: boolean },
) {
  const next = map && typeof map === 'object' ? map : {}
  writeAll(next, options)
}

export function clearLlmArtifacts(options?: { silent?: boolean }) {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
  if (!options?.silent) {
    for (const cb of changeListeners) cb()
  }
}

export function getLlmArtifact<T>(key: string): T | undefined {
  if (!key) return undefined
  const entry = readAll()[key]
  if (!entry) return undefined
  return entry.value as T
}

export function peekLlmArtifactEntry(key: string): LlmArtifactEntry | undefined {
  if (!key) return undefined
  return readAll()[key]
}

export function setLlmArtifact(
  key: string,
  value: unknown,
  options?: { model?: string; silent?: boolean; aliases?: string[] },
) {
  if (!key) return
  const map = readAll()
  const entry: LlmArtifactEntry = {
    value,
    generatedAt: Date.now(),
    model: options?.model,
  }
  map[key] = entry
  for (const alias of options?.aliases || []) {
    if (alias && alias !== key) map[alias] = entry
  }
  writeAll(map, { silent: options?.silent })
}

export function setLlmArtifactsForKeys(
  keys: string[],
  value: unknown,
  options?: { model?: string; silent?: boolean },
) {
  const unique = [...new Set(keys.filter(Boolean))]
  if (!unique.length) return
  const map = readAll()
  const entry: LlmArtifactEntry = {
    value,
    generatedAt: Date.now(),
    model: options?.model,
  }
  for (const key of unique) map[key] = entry
  writeAll(map, { silent: options?.silent })
}

export function removeLlmArtifact(key: string, options?: { silent?: boolean }) {
  if (!key) return
  const map = readAll()
  if (!(key in map)) return
  delete map[key]
  writeAll(map, { silent: options?.silent })
}

export function removeLlmArtifactsByPrefix(
  prefix: string,
  options?: { silent?: boolean },
) {
  if (!prefix) return
  const map = readAll()
  let changed = false
  for (const key of Object.keys(map)) {
    if (key.startsWith(prefix)) {
      delete map[key]
      changed = true
    }
  }
  if (changed) writeAll(map, { silent: options?.silent })
}
