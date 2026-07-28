import {
  getRapidApiKey,
  methodNotAllowed,
  missingKey,
  proxyRequest,
} from './_lib/proxy.js'

export const runtime = 'nodejs'
export const maxDuration = 30

/** Proxies /api/timetable-lookup/* → RapidAPI TimeTable Lookup. */
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

  const key = getRapidApiKey()
  if (!key) return missingKey('RAPIDAPI_KEY')

  const url = new URL(req.url)
  // Prefer rewrite-captured path; fall back to pathname after /api/timetable-lookup
  let rest = url.searchParams.get('rest') || ''
  url.searchParams.delete('rest')
  if (!rest) {
    const prefix = '/api/timetable-lookup'
    rest = url.pathname.startsWith(prefix)
      ? url.pathname.slice(prefix.length).replace(/^\//, '')
      : url.pathname.replace(/^\//, '')
  }

  const target = `https://timetable-lookup.p.rapidapi.com/${rest}${url.search}`

  try {
    return await proxyRequest(target, req, {
      'X-RapidAPI-Key': key,
      'X-RapidAPI-Host': 'timetable-lookup.p.rapidapi.com',
      Accept: 'application/json',
    })
  } catch (err) {
    console.error('[timetable-lookup]', err)
    return new Response(
      JSON.stringify({ error: 'Upstream timetable-lookup request failed' }),
      { status: 502, headers: { 'content-type': 'application/json' } },
    )
  }
}
