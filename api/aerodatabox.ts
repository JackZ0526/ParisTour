import {
  getRapidApiKey,
  methodNotAllowed,
  missingKey,
  proxyRequest,
} from './_lib/proxy.js'
import { requireAllowlistedUser } from './_lib/auth.js'

export const runtime = 'nodejs'
export const maxDuration = 30

/** Proxies /api/aerodatabox/* → RapidAPI AeroDataBox. */
export async function GET(req: Request): Promise<Response> {
  return handle(req)
}

export async function POST(req: Request): Promise<Response> {
  return handle(req)
}

async function handle(req: Request): Promise<Response> {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return methodNotAllowed(['GET', 'POST'])
  }

  const auth = await requireAllowlistedUser(req)
  if (auth.ok === false) return auth.response

  const key = getRapidApiKey()
  if (!key) return missingKey('RAPIDAPI_KEY')

  const url = new URL(req.url)
  let rest = url.searchParams.get('rest') || ''
  url.searchParams.delete('rest')
  if (!rest) {
    const prefix = '/api/aerodatabox'
    rest = url.pathname.startsWith(prefix)
      ? url.pathname.slice(prefix.length).replace(/^\//, '')
      : url.pathname.replace(/^\//, '')
  }

  const target = `https://aerodatabox.p.rapidapi.com/${rest}${url.search}`

  try {
    return await proxyRequest(target, req, {
      'X-RapidAPI-Key': key,
      'X-RapidAPI-Host': 'aerodatabox.p.rapidapi.com',
      Accept: 'application/json',
    })
  } catch (err) {
    console.error('[aerodatabox]', err)
    return new Response(
      JSON.stringify({ error: 'Upstream AeroDataBox request failed' }),
      { status: 502, headers: { 'content-type': 'application/json' } },
    )
  }
}
