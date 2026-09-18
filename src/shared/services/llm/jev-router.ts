import { authFetch } from '../../../features/auth/services/authFetch'

type Effort = 'off' | 'low' | 'medium' | 'high'
type Intent = 'answer' | 'recommend' | 'mutate'
export type JevRoute = { intent?: Intent; needsWeb: boolean; reasoningEffort: Effort }

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {}
}
function probability(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
}

/** Initial conservative threshold; tune against labeled ParisTour requests. */
const MIN_CONFIDENCE = 0.75
export function parseJevRoute(value: unknown, kind: 'chat' | 'preflight'): JevRoute | null {
  const payload = record(value)
  const answers = record(payload.answers)
  const confidence = record(record(record(payload.providerMetadata).typesafe).confidence)
  function choice<T extends string>(key: string, allowed: readonly T[], requireConfidence = true): T | null {
    const answer = record(answers[key])
    const selected = answer.choice
    if (answer.type !== 'choice' || typeof selected !== 'string' || !allowed.includes(selected as T)) return null
    const p = record(answer.probabilities)[selected]
    if (!probability(p) || (requireConfidence && p < MIN_CONFIDENCE)) return null
    // TypeSafe confidence is separate from the option probabilities.
    const c = confidence[key]
    if (c !== undefined && (!probability(c) || (requireConfidence && c < MIN_CONFIDENCE))) return null
    return selected as T
  }
  const web = record(answers.needsWeb)
  if (web.type !== 'boolean' || !probability(web.probability)) return null
  if (Math.max(web.probability, 1 - web.probability) < MIN_CONFIDENCE) return null
  // Effort is an advisory cost/latency setting, not permission to edit or skip research.
  // Adjacent effort tiers often split probability; that alone should not add an LLM call.
  const reasoningEffort = choice('reasoningEffort', ['off', 'low', 'medium', 'high'] as const, false)
  const intent = kind === 'chat' ? choice('intent', ['answer', 'recommend', 'mutate'] as const) : null
  if (!reasoningEffort || (kind === 'chat' && !intent)) return null
  return { needsWeb: web.probability >= 0.5, reasoningEffort, ...(intent ? { intent } : {}) }
}

/** Null means use the existing LLM router; user cancellation must propagate. */
export async function tryJevRoute(kind: 'chat' | 'preflight', context: unknown, signal?: AbortSignal): Promise<JevRoute | null> {
  signal?.throwIfAborted()
  const controller = new AbortController()
  const cancel = () => controller.abort(signal?.reason)
  signal?.addEventListener('abort', cancel, { once: true })
  const timeout = setTimeout(() => controller.abort(), 5_000)
  try {
    const response = await authFetch('/api/jev', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind, state: JSON.stringify(context) }),
      signal: controller.signal,
    })
    if (!response.ok) return null
    return parseJevRoute(await response.json(), kind)
  } catch {
    signal?.throwIfAborted()
    return null
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', cancel)
  }
}
