import { requireAllowlistedUser } from './auth.js'
import { methodNotAllowed } from './proxy.js'
import { parseRankState, rankCandidates } from './jev-ranking.js'
import { evaluateRoute } from './jev.js'
import { JevCircuit, JEV_COOLDOWN_MS, JEV_SERVER_BUDGET_MS, withinJevDeadline } from '../../src/shared/services/jevCircuit.js'

export const jevServerCircuit = new JevCircuit()
function unavailable(reason: string, status = 503) {
  return Response.json({ error: 'Jev evaluation unavailable', reason }, {
    status, headers: { 'cache-control': 'no-store', 'retry-after': String(JEV_COOLDOWN_MS / 1000) },
  })
}
function upstreamStatus(error: unknown): number | undefined {
  let current = error
  for (let i = 0; i < 4 && current && typeof current === 'object'; i++) {
    const value = current as { statusCode?: unknown; cause?: unknown }
    if (typeof value.statusCode === 'number' && Number.isInteger(value.statusCode) && value.statusCode >= 400 && value.statusCode <= 599) return value.statusCode
    current = value.cause
  }
}

export async function handleJev(req: Request): Promise<Response> {
  if (req.method !== 'POST') return methodNotAllowed(['POST'])
  try {
    const auth = await requireAllowlistedUser(req)
    if (auth.ok === false) return auth.response
    const raw = await req.text()
    if (raw.length > 32_000) return Response.json({ error: 'Routing context too large' }, { status: 413 })
    let body: { kind?: unknown; state?: unknown }
    try { body = JSON.parse(raw) } catch {
      return Response.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    if (!body || (body.kind !== 'chat' && body.kind !== 'preflight' && body.kind !== 'rank') || typeof body.state !== 'string') {
      return Response.json({ error: 'Invalid routing request' }, { status: 400 })
    }
    // Decode first so escaped Unicode cannot bypass the language boundary.
    let decoded: unknown
    try { decoded = JSON.parse(body.state) } catch {
      return Response.json({ error: 'Invalid routing state' }, { status: 400 })
    }
    if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(JSON.stringify(decoded))) {
      return Response.json({ error: 'English decision context required' }, { status: 422 })
    }
    const kind = body.kind
    const state = body.state
    const rankState = kind === 'rank' ? parseRankState(state) : null
    if (kind === 'rank' && !rankState) return Response.json({ error: 'Invalid candidate ranking request' }, { status: 400 })
    const finish = jevServerCircuit.acquire(kind)
    if (!finish) return unavailable('cooldown')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(new DOMException('Evaluation deadline exceeded', 'TimeoutError')), JEV_SERVER_BUDGET_MS)
    const signal = AbortSignal.any([req.signal, controller.signal])
    const start = Date.now()
    try {
      const result = await withinJevDeadline<unknown>(signal, () => kind === 'rank'
        ? rankCandidates(rankState!, signal) : evaluateRoute(kind, state, signal))
      finish('success')
      return Response.json(result, { headers: { 'cache-control': 'no-store' } })
    } catch (error) {
      finish(req.signal.aborted ? 'cancelled' : 'failure')
      const status = upstreamStatus(error)
      const reason = req.signal.aborted ? 'cancelled' : controller.signal.aborted ? 'timeout'
        : status === 429 ? 'rate_limited' : status === 401 || status === 403 ? 'upstream_auth'
        : status === 503 ? 'upstream_unavailable' : 'upstream_error'
      // Only bounded metadata; never log error objects, state, URLs or credentials.
      console.warn('[jev] Evaluation fallback', { kind, reason, upstreamStatus: status, elapsedMs: Date.now() - start })
      return unavailable(reason, reason === 'timeout' ? 504 : 503)
    } finally { clearTimeout(timer) }
  } catch {
    // Never include upstream request headers/credentials in logs or client errors.
    console.warn('[jev] Evaluation unavailable; caller will use its existing router')
    return Response.json({ error: 'Jev routing unavailable' }, { status: 502 })
  }
}
