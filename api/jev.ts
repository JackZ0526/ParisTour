import { requireAllowlistedUser } from './_lib/auth.js'
import { methodNotAllowed } from './_lib/proxy.js'
import { evaluateRoute } from './_lib/jev.js'

export const runtime = 'nodejs'
export const maxDuration = 15

export async function POST(req: Request): Promise<Response> {
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
    if (!body || (body.kind !== 'chat' && body.kind !== 'preflight') || typeof body.state !== 'string') {
      return Response.json({ error: 'Invalid routing request' }, { status: 400 })
    }
    const result = await evaluateRoute(body.kind, body.state, AbortSignal.any([req.signal, AbortSignal.timeout(4_000)]))
    return Response.json(result, { headers: { 'cache-control': 'no-store' } })
  } catch {
    // Never include upstream request headers/credentials in logs or client errors.
    console.warn('[jev] Evaluation unavailable; caller will use its existing router')
    return Response.json({ error: 'Jev routing unavailable' }, { status: 502 })
  }
}
