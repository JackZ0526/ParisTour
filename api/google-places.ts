import {
  getRapidApiKey,
  methodNotAllowed,
  missingKey,
  proxyRequest,
  readEnv,
} from './_lib/proxy.js'
import { requireAllowlistedUser } from './_lib/auth.js'

export const runtime = 'nodejs'
export const maxDuration = 30

const DEFAULT_HOST = 'google-map-places-new-v2.p.rapidapi.com'

export async function GET(req: Request): Promise<Response> {
  return handle(req)
}

export async function POST(req: Request): Promise<Response> {
  return handle(req)
}

function allowedPath(method: string, rest: string): boolean {
  if (method === 'POST') return rest === 'v1/places:searchText'
  if (method === 'GET') return /^v1\/places\/[A-Za-z0-9_-]+$/.test(rest)
  return false
}

/** Server-only RapidAPI Places proxy; the browser never receives the key. */
async function handle(req: Request): Promise<Response> {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return methodNotAllowed(['GET', 'POST'])
  }
  const auth = await requireAllowlistedUser(req)
  if (auth.ok === false) return auth.response

  const key = getRapidApiKey()
  if (!key) return missingKey('RAPIDAPI_KEY')

  const url = new URL(req.url)
  const rest = (url.searchParams.get('rest') || '').replace(/^\/+/, '')
  url.searchParams.delete('rest')
  if (!allowedPath(req.method, rest)) {
    return new Response(JSON.stringify({ error: 'Unsupported Places path' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    })
  }

  const host =
    readEnv('RAPIDAPI_GOOGLE_PLACES_HOST') || DEFAULT_HOST
  const target = `https://${host}/${rest}${url.search}`
  try {
    return await proxyRequest(target, req, {
      'X-RapidAPI-Key': key,
      'X-RapidAPI-Host': host,
      // RapidAPI counts endpoint calls rather than fields. Fetch the complete
      // Place once so all UI consumers can share one durable payload.
      'X-Goog-FieldMask': '*',
      Accept: 'application/json',
      'Content-Type': 'application/json',
    })
  } catch (error) {
    console.error('[google-places]', error)
    return new Response(
      JSON.stringify({ error: 'Upstream Google Places request failed' }),
      { status: 502, headers: { 'content-type': 'application/json' } },
    )
  }
}
