/**
 * In-flight + result memo for LLM calls so remounts / Strict Mode /
 * overlapping effects share one request instead of burning duplicate tokens.
 *
 * With `durable: true`, successful results are also written to
 * llmArtifactStore (localStorage + trip cloud snapshot) so later sessions /
 * devices reuse the same generation until the caller passes `bypass`.
 */

import {
  getLlmArtifact,
  setLlmArtifact,
} from './llmArtifactStore'

type CacheEntry = {
  value: unknown
  expiresAt: number
}

const results = new Map<string, CacheEntry>()
const inflight = new Map<string, Promise<unknown>>()

/** Durable artifacts should outlive a tab session in memory too. */
const DEFAULT_TTL_MS = 1000 * 60 * 60 // 1 hour in-memory
const DURABLE_TTL_MS = 1000 * 60 * 60 * 24 * 30 // 30 days in-memory mirror

export async function memoizeLlmCall<T>(
  key: string,
  fn: () => Promise<T>,
  options?: { ttlMs?: number; bypass?: boolean; durable?: boolean; model?: string },
): Promise<T> {
  const durable = Boolean(options?.durable)
  const ttl = options?.ttlMs ?? (durable ? DURABLE_TTL_MS : DEFAULT_TTL_MS)

  if (!options?.bypass) {
    const hit = results.get(key)
    if (hit && hit.expiresAt > Date.now()) {
      return hit.value as T
    }

    if (durable) {
      const stored = getLlmArtifact<T>(key)
      if (stored !== undefined) {
        results.set(key, { value: stored, expiresAt: Date.now() + ttl })
        return stored
      }
    }
  }

  const pending = inflight.get(key)
  if (pending && !options?.bypass) return pending as Promise<T>

  const task = fn()
    .then((value) => {
      results.set(key, { value, expiresAt: Date.now() + ttl })
      if (durable) {
        setLlmArtifact(key, value, { model: options?.model })
      }
      inflight.delete(key)
      return value
    })
    .catch((err) => {
      inflight.delete(key)
      throw err
    })

  inflight.set(key, task)
  return task
}

export function peekLlmMemo<T>(key: string): T | undefined {
  const hit = results.get(key)
  if (!hit || hit.expiresAt <= Date.now()) return undefined
  return hit.value as T
}

/** Write / alias a value into the memo without invoking the producer. */
export function seedLlmMemo<T>(
  key: string,
  value: T,
  options?: { ttlMs?: number },
): void {
  const ttl = options?.ttlMs ?? DEFAULT_TTL_MS
  results.set(key, { value, expiresAt: Date.now() + ttl })
}

export function clearLlmMemo(prefix?: string) {
  if (!prefix) {
    results.clear()
    inflight.clear()
    return
  }
  for (const key of [...results.keys()]) {
    if (key.startsWith(prefix)) results.delete(key)
  }
  for (const key of [...inflight.keys()]) {
    if (key.startsWith(prefix)) inflight.delete(key)
  }
}
