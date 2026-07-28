/**
 * In-flight + result memo for LLM calls so remounts / Strict Mode /
 * overlapping effects share one request instead of burning duplicate tokens.
 */

type CacheEntry = {
  value: unknown
  expiresAt: number
}

const results = new Map<string, CacheEntry>()
const inflight = new Map<string, Promise<unknown>>()

const DEFAULT_TTL_MS = 1000 * 60 * 60 // 1 hour in-memory

export async function memoizeLlmCall<T>(
  key: string,
  fn: () => Promise<T>,
  options?: { ttlMs?: number; bypass?: boolean },
): Promise<T> {
  if (options?.bypass) return fn()

  const ttl = options?.ttlMs ?? DEFAULT_TTL_MS
  const hit = results.get(key)
  if (hit && hit.expiresAt > Date.now()) {
    return hit.value as T
  }

  const pending = inflight.get(key)
  if (pending) return pending as Promise<T>

  const task = fn()
    .then((value) => {
      results.set(key, { value, expiresAt: Date.now() + ttl })
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
