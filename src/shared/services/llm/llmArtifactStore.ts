/**
 * Durable generated-artifact store (localStorage + trip cloud snapshot).
 *
 * LLM output and stable fetched payloads are persisted once and reused across
 * remounts / devices until the user explicitly regenerates or wipes the trip.
 *
 * Reads hit an in-memory map. JSON.stringify + localStorage writes are deferred
 * so hotel/detail loading does not stall shimmer on the main thread.
 *
 * Only allowlisted LLM copy is queued for cloud sync; third-party API caches
 * stay local. See `artifactCloudPolicy.ts`.
 */
import {
  filterCloudArtifactMap,
  isCloudSyncedArtifactKey,
} from './artifactCloudPolicy'

const STORAGE_KEY = 'paris-tour-llm-artifacts-v1'
const PERSIST_DEBOUNCE_MS = 320

export type LlmArtifactEntry = {
  value: unknown
  generatedAt: number
  model?: string
}

export type LlmArtifactMap = Record<string, LlmArtifactEntry>

/** Keys added/updated and removed since the last successful cloud ack. */
export type ArtifactCloudDiff = {
  upserts: LlmArtifactMap
  deletes: string[]
}

type ChangeListener = () => void
type WriteOptions = { silent?: boolean; flush?: boolean }

const changeListeners = new Set<ChangeListener>()

let initialized = false
let memory: LlmArtifactMap = {}
let dirty = false
const pendingUpsertKeys = new Set<string>()
const pendingDeleteKeys = new Set<string>()
let persistTimer: ReturnType<typeof setTimeout> | null = null
let persistIdle: number | null = null
let pagehideBound = false

function parseStoredMap(raw: string | null): LlmArtifactMap {
  if (!raw) return {}
  try {
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

function readAllFromStorage(): LlmArtifactMap {
  try {
    return parseStoredMap(localStorage.getItem(STORAGE_KEY))
  } catch {
    return {}
  }
}

function ensureMemory(): LlmArtifactMap {
  if (!initialized) {
    memory = readAllFromStorage()
    initialized = true
  }
  return memory
}

function notifyChange() {
  for (const cb of changeListeners) cb()
}

function persistNow() {
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  if (persistIdle != null && typeof window !== 'undefined' && window.cancelIdleCallback) {
    window.cancelIdleCallback(persistIdle)
    persistIdle = null
  }
  if (!dirty) return
  const serialized = JSON.stringify(ensureMemory())
  try {
    localStorage.setItem(STORAGE_KEY, serialized)
  } catch {
    /* ignore quota / private mode */
  }
  dirty = false
}

function bindPagehideFlush() {
  if (pagehideBound || typeof window === 'undefined') return
  pagehideBound = true
  const flush = () => persistNow()
  window.addEventListener('pagehide', flush)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush()
  })
}

function schedulePersist() {
  bindPagehideFlush()
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    persistTimer = null
    const ric = typeof window !== 'undefined' ? window.requestIdleCallback : undefined
    if (typeof ric === 'function') {
      persistIdle = ric(() => {
        persistIdle = null
        persistNow()
      }, { timeout: 400 })
      return
    }
    persistNow()
  }, PERSIST_DEBOUNCE_MS)
}

function writeAll(map: LlmArtifactMap, options?: WriteOptions) {
  memory = map
  initialized = true
  dirty = true
  if (options?.flush) persistNow()
  else schedulePersist()
  if (!options?.silent) notifyChange()
}

function markKeysUpserted(keys: string[]) {
  for (const key of keys) {
    if (!isCloudSyncedArtifactKey(key)) continue
    pendingDeleteKeys.delete(key)
    pendingUpsertKeys.add(key)
  }
}

function markKeysDeleted(keys: string[]) {
  for (const key of keys) {
    if (!isCloudSyncedArtifactKey(key)) continue
    pendingUpsertKeys.delete(key)
    pendingDeleteKeys.add(key)
  }
}

export function markArtifactsCloudSynced() {
  pendingUpsertKeys.clear()
  pendingDeleteKeys.clear()
}

export function hasArtifactCloudDiff(): boolean {
  return pendingUpsertKeys.size > 0 || pendingDeleteKeys.size > 0
}

export function peekArtifactCloudDiff(): ArtifactCloudDiff {
  const map = ensureMemory()
  const upserts: LlmArtifactMap = {}
  for (const key of pendingUpsertKeys) {
    if (!isCloudSyncedArtifactKey(key)) continue
    const entry = map[key]
    if (entry) upserts[key] = entry
  }
  return {
    upserts,
    deletes: [...pendingDeleteKeys].filter(isCloudSyncedArtifactKey),
  }
}

/** `{ key: generatedAt }` for incremental `pull_trip_artifacts`. */
export function cloudArtifactKnownMap(): Record<string, number> {
  const known: Record<string, number> = {}
  for (const [key, entry] of Object.entries(filterCloudArtifactMap(ensureMemory()))) {
    known[key] = entry.generatedAt
  }
  return known
}

/**
 * Merge server artifact upserts/deletes into local storage without wiping
 * third-party API caches or in-flight local cloud edits.
 */
export function mergeCloudArtifacts(options: {
  upserts?: LlmArtifactMap | null
  deletes?: string[] | null
  silent?: boolean
}) {
  const map = ensureMemory()
  let changed = false
  for (const key of options.deletes || []) {
    if (!isCloudSyncedArtifactKey(key)) continue
    if (pendingUpsertKeys.has(key)) continue
    if (!(key in map)) continue
    delete map[key]
    pendingDeleteKeys.delete(key)
    changed = true
  }
  for (const [key, entry] of Object.entries(options.upserts || {})) {
    if (!isCloudSyncedArtifactKey(key) || !entry || typeof entry !== 'object') continue
    if (pendingUpsertKeys.has(key) || pendingDeleteKeys.has(key)) continue
    map[key] = {
      value: entry.value,
      generatedAt:
        typeof entry.generatedAt === 'number' && Number.isFinite(entry.generatedAt)
          ? entry.generatedAt
          : Date.now(),
      model: typeof entry.model === 'string' ? entry.model : undefined,
    }
    pendingUpsertKeys.delete(key)
    changed = true
  }
  if (!changed) return
  writeAll(map, { silent: options.silent !== false, flush: true })
}

export function artifactCloudDiffIsEmpty(diff: ArtifactCloudDiff): boolean {
  return Object.keys(diff.upserts).length === 0 && diff.deletes.length === 0
}

/** Drop keys from the pending diff only if they still match what we sent. */
export function ackArtifactCloudDiff(sent: ArtifactCloudDiff) {
  const map = ensureMemory()
  for (const [key, sentEntry] of Object.entries(sent.upserts)) {
    const current = map[key]
    if (
      current &&
      current.generatedAt === sentEntry.generatedAt &&
      current.model === sentEntry.model &&
      sameValue(current.value, sentEntry.value)
    ) {
      pendingUpsertKeys.delete(key)
    }
  }
  for (const key of sent.deletes) {
    if (!(key in map)) pendingDeleteKeys.delete(key)
  }
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    return false
  }
}

function sameEntry(
  entry: LlmArtifactEntry | undefined,
  value: unknown,
  model?: string,
): boolean {
  return Boolean(
    entry && entry.model === model && sameValue(entry.value, value),
  )
}

/** Subscribe to durable writes (used to trigger trip cloud autosave). */
export function subscribeLlmArtifacts(listener: ChangeListener): () => void {
  changeListeners.add(listener)
  return () => {
    changeListeners.delete(listener)
  }
}

export function loadLlmArtifacts(): LlmArtifactMap {
  return ensureMemory()
}

export function saveLlmArtifacts(
  map: LlmArtifactMap | null | undefined,
  options?: { silent?: boolean },
) {
  const next = map && typeof map === 'object' ? map : {}
  writeAll(next, { silent: options?.silent, flush: true })
  markArtifactsCloudSynced()
}

export function clearLlmArtifacts(options?: { silent?: boolean }) {
  const hadMemory = initialized && Object.keys(ensureMemory()).length > 0
  markKeysDeleted(Object.keys(ensureMemory()))
  let hadStorage = false
  try {
    hadStorage = localStorage.getItem(STORAGE_KEY) != null
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
  memory = {}
  initialized = true
  dirty = false
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  if (hadMemory || hadStorage) {
    if (!options?.silent) notifyChange()
  }
}

export function getLlmArtifact<T>(key: string): T | undefined {
  if (!key) return undefined
  const entry = ensureMemory()[key]
  if (!entry) return undefined
  return entry.value as T
}

export function peekLlmArtifactEntry(key: string): LlmArtifactEntry | undefined {
  if (!key) return undefined
  return ensureMemory()[key]
}

export function setLlmArtifact(
  key: string,
  value: unknown,
  options?: { model?: string; silent?: boolean; aliases?: string[] },
) {
  if (!key) return
  const map = ensureMemory()
  const keys = [key, ...(options?.aliases || [])].filter(
    (item, index, all) => Boolean(item) && all.indexOf(item) === index,
  )
  if (keys.every((item) => sameEntry(map[item], value, options?.model))) {
    return
  }
  const existing = keys.map((item) => map[item]).find(
    (entry) => sameEntry(entry, value, options?.model),
  )
  const entry: LlmArtifactEntry = existing || {
    value,
    generatedAt: Date.now(),
    model: options?.model,
  }
  const changed: string[] = []
  for (const item of keys) {
    if (!sameEntry(map[item], value, options?.model)) {
      map[item] = entry
      changed.push(item)
    }
  }
  if (!changed.length) return
  markKeysUpserted(changed)
  writeAll(map, { silent: options?.silent })
}

export function setLlmArtifactsForKeys(
  keys: string[],
  value: unknown,
  options?: { model?: string; silent?: boolean },
) {
  const unique = [...new Set(keys.filter(Boolean))]
  if (!unique.length) return
  const map = ensureMemory()
  if (unique.every((key) => sameEntry(map[key], value, options?.model))) {
    return
  }
  const existing = unique.map((key) => map[key]).find(
    (entry) => sameEntry(entry, value, options?.model),
  )
  const entry: LlmArtifactEntry = existing || {
    value,
    generatedAt: Date.now(),
    model: options?.model,
  }
  const changed: string[] = []
  for (const key of unique) {
    if (!sameEntry(map[key], value, options?.model)) {
      map[key] = entry
      changed.push(key)
    }
  }
  if (!changed.length) return
  markKeysUpserted(changed)
  writeAll(map, { silent: options?.silent })
}

export function removeLlmArtifact(key: string, options?: { silent?: boolean }) {
  if (!key) return
  const map = ensureMemory()
  if (!(key in map)) return
  delete map[key]
  markKeysDeleted([key])
  writeAll(map, { silent: options?.silent })
}

export function removeLlmArtifactsByPrefix(
  prefix: string,
  options?: { silent?: boolean },
) {
  if (!prefix) return
  const map = ensureMemory()
  const removed: string[] = []
  for (const key of Object.keys(map)) {
    if (key.startsWith(prefix)) {
      delete map[key]
      removed.push(key)
    }
  }
  if (!removed.length) return
  markKeysDeleted(removed)
  writeAll(map, { silent: options?.silent })
}

/** Flush deferred localStorage writes (cloud save / page hide). */
export function flushLlmArtifactsToStorage() {
  persistNow()
}

export function resetLlmArtifactStoreForTests() {
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  if (persistIdle != null && typeof window !== 'undefined' && window.cancelIdleCallback) {
    window.cancelIdleCallback(persistIdle)
    persistIdle = null
  }
  initialized = false
  memory = {}
  dirty = false
  pendingUpsertKeys.clear()
  pendingDeleteKeys.clear()
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
