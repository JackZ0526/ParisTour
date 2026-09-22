import { englishJevState } from './jev-english'
import { authFetch } from '../../../features/auth/services/authFetch'
import { JevCircuit, JEV_CLIENT_BUDGET_MS, withinJevDeadline, type JevKind } from '../jevCircuit'

export const jevClientCircuit = new JevCircuit()

/** Optional acceleration: the budget includes English normalization, transport and body parsing. */
export async function requestJev(kind: JevKind, context: unknown, signal?: AbortSignal): Promise<unknown | null> {
  signal?.throwIfAborted()
  const finish = jevClientCircuit.acquire(kind)
  if (!finish) return null
  const controller = new AbortController()
  const cancel = () => controller.abort(signal?.reason)
  signal?.addEventListener('abort', cancel, { once: true })
  const timeout = setTimeout(() => controller.abort(new DOMException('Evaluation deadline exceeded', 'TimeoutError')), JEV_CLIENT_BUDGET_MS)
  let requested = false
  try {
    return await withinJevDeadline(controller.signal, async () => {
      const state = await englishJevState(context, controller.signal)
      controller.signal.throwIfAborted()
      requested = true
      const response = await authFetch('/api/jev', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind, state }), signal: controller.signal,
      })
      if (!response.ok) {
        finish(response.status >= 500 || response.status === 429 ? 'failure' : 'success')
        return null
      }
      const result: unknown = await response.json()
      controller.signal.throwIfAborted()
      finish('success')
      return result
    })
  } catch {
    // A translation failure is not evidence of a Jev outage.
    finish(signal?.aborted || !requested ? 'cancelled' : 'failure')
    signal?.throwIfAborted()
    return null
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', cancel)
  }
}
