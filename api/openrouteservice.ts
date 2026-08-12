import {
  methodNotAllowed,
  missingKey,
  proxyRequest,
  readEnv,
} from './_lib/proxy.js'
import { requireAllowlistedUser } from './_lib/auth.js'

export const runtime = 'nodejs'
export const maxDuration = 30

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

  const key = readEnv('OPENROUTESERVICE_API_KEY')
  if (!key) return missingKey('OPENROUTESERVICE_API_KEY')

  const url = new URL(req.url)
  let rest = url.searchParams.get('rest') || ''
  url.searchParams.delete('rest')
  if (!rest) {
    const prefix = '/api/openrouteservice'
    rest = url.pathname.startsWith(prefix)
      ? url.pathname.slice(prefix.length).replace(/^\//, '')
      : url.pathname.replace(/^\//, '')
  }

  try {
    return await proxyRequest(
      `https://api.openrouteservice.org/${rest}${url.search}`,
      req,
      { Authorization: key, Accept: 'application/json, application/geo+json' },
    )
  } catch (error) {
    console.error('[openrouteservice]', error)
    return new Response(JSON.stringify({ error: 'OpenRouteService request failed' }), {
      status: 502,
      headers: { 'content-type': 'application/json' },
    })
  }
}
