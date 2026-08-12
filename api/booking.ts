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

const DEFAULT_HOST = 'booking-com18.p.rapidapi.com'
const ALLOWED_PATHS = new Set([
  'stays/auto-complete',
  'stays/search-by-geo',
  'stays/detail',
  'stays/get-photos',
  'stays/review-featured',
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
    return new Response(JSON.stringify({ error: 'Unsupported Booking path' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    })
  }

  const host = readEnv('RAPIDAPI_BOOKING_HOST') || DEFAULT_HOST
  try {
    const upstream = await proxyRequest(`https://${host}/${rest}${url.search}`, req, {
      'X-RapidAPI-Key': key,
      'X-RapidAPI-Host': host,
      Accept: 'application/json',
    })
    if (!upstream.ok) {
      const body = await upstream.clone().text().catch(() => '')
      if (/AwsWafIntegration|challenge-container|verify that you(?:'|’)re not a robot/i.test(body)) {
        return new Response(
          JSON.stringify({
            error: 'Booking provider was blocked by upstream bot protection',
            code: 'booking_upstream_waf',
          }),
          { status: 502, headers: { 'content-type': 'application/json' } },
        )
      }
    }
    return upstream
  } catch (error) {
    console.error('[booking]', error)
    return new Response(
      JSON.stringify({ error: 'Upstream Booking request failed' }),
      { status: 502, headers: { 'content-type': 'application/json' } },
    )
  }
}
