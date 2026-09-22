export type JevKind = 'chat' | 'preflight' | 'rank'
export const JEV_CLIENT_BUDGET_MS = 2_000
export const JEV_SERVER_BUDGET_MS = 1_500
export const JEV_COOLDOWN_MS = 30_000

/** Per-runtime, per-purpose protection; no persisted user data or shared provider outage assumption. */
export class JevCircuit {
  private states = new Map<JevKind, { epoch: number; until: number; probing: boolean }>()

  acquire(kind: JevKind) {
    let state = this.states.get(kind)
    if (!state) {
      state = { epoch: 0, until: 0, probing: false }
      this.states.set(kind, state)
    }
    if (state.until > Date.now() || state.probing) return null
    const epoch = state.epoch
    if (state.until) state.probing = true
    let finished = false
    return (outcome: 'success' | 'failure' | 'cancelled') => {
      if (finished || state.epoch !== epoch) return
      finished = true
      state.probing = false
      if (outcome === 'failure') {
        state.epoch++
        state.until = Date.now() + JEV_COOLDOWN_MS
      } else if (outcome === 'success') state.until = 0
    }
  }

  reset() { this.states.clear() }
}

/** Enforce the deadline even when a dependency is slow to observe AbortSignal. */
export async function withinJevDeadline<T>(signal: AbortSignal, operation: () => Promise<T>): Promise<T> {
  signal.throwIfAborted()
  let onAbort: () => void = () => {}
  const cancelled = new Promise<never>((_, reject) => {
    onAbort = () => reject(signal.reason)
    signal.addEventListener('abort', onAbort, { once: true })
  })
  try { return await Promise.race([operation(), cancelled]) }
  finally { signal.removeEventListener('abort', onAbort) }
}
