import {
  getRapidApiKey,
  methodNotAllowed,
  missingKey,
  proxyRequest,
  readEnv,
} from './_lib/proxy.js'
import { requireAllowlistedUser } from './_lib/auth.js'

export const runtime = 'nodejs'
export const maxDuration = 60

const DEFAULT_HOST = 'tripadvisor34.p.rapidapi.com'
const ALLOWED_PATHS = new Set([
  'api/v1/autocomplete',
  'api/v1/restaurants/detail',
  'api/v1/restaurants/reviews',
  'api/v1/things-to-do/detail',
  'api/v1/things-to-do/reviews',
])

export async function GET(req: Request): Promise<Response> {
  const auth = await requireAllowlistedUser(req)
  if (auth.ok === false) return auth.response
  if (req.method !== 'GET') return methodNotAllowed(['GET'])

  const key = getRapidApiKey()
  if (!key) return missingKey('RAPIDAPI_KEY')

  const url = new URL(req.url)
  const rest = (url.searchParams.get('rest') || '').replace(/^\/+/, '')
  url.searchParams.delete('rest')
  if (!ALLOWED_PATHS.has(rest)) {
    return new Response(JSON.stringify({ error: 'Unsupported Tripadvisor path' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    })
  }

  const host = readEnv('RAPIDAPI_TRIPADVISOR_HOST') || DEFAULT_HOST
  try {
    return await proxyRequest(`https://${host}/${rest}${url.search}`, req, {
      'X-RapidAPI-Key': key,
      'X-RapidAPI-Host': host,
      Accept: 'application/json',
    })
  } catch (error) {
    console.error('[tripadvisor]', error)
    return new Response(
      JSON.stringify({ error: 'Upstream Tripadvisor request failed' }),
      { status: 502, headers: { 'content-type': 'application/json' } },
    )
  }
}
