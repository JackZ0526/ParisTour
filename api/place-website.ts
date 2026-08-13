import { methodNotAllowed } from './_lib/proxy.js'
import { requireAllowlistedUser } from './_lib/auth.js'
import {
  extractWebsitePhotos,
  homepageFallbackUrl,
  instagramHandleFromUrl,
  isInstagramUrl,
  toPublicHttpsUrl,
} from './_lib/websitePhotos.js'

export const runtime = 'nodejs'
export const maxDuration = 15

const MAX_HTML_BYTES = 512 * 1024
const FETCH_TIMEOUT_MS = 8_000

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

async function fetchPublicHtml(target: string, hops = 0): Promise<string> {
  const safe = toPublicHttpsUrl(target)
  if (!safe) {
    throw new Error('Blocked website URL')
  }
  const response = await fetch(safe, {
    method: 'GET',
    redirect: 'manual',
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (response.status >= 300 && response.status < 400 && hops < 2) {
    const location = response.headers.get('location')
    if (!location) throw new Error('Website redirect missing location')
    const next = new URL(location, safe).toString()
    return fetchPublicHtml(next, hops + 1)
  }
  if (response.status === 404 && hops < 2) {
    const home = homepageFallbackUrl(safe)
    if (home) return fetchPublicHtml(home, hops + 1)
  }
  if (!response.ok) {
    throw new Error(`Website responded ${response.status}`)
  }
  const buffer = await response.arrayBuffer()
  const slice = buffer.byteLength > MAX_HTML_BYTES ? buffer.slice(0, MAX_HTML_BYTES) : buffer
  return new TextDecoder('utf-8', { fatal: false }).decode(slice)
}

export async function handlePlaceWebsite(req: Request): Promise<Response> {
  const auth = await requireAllowlistedUser(req)
  if (auth.ok === false) return auth.response
  if (req.method !== 'GET') return methodNotAllowed(['GET'])

  const url = new URL(req.url)
  const target = toPublicHttpsUrl(url.searchParams.get('url') || '')
  if (!target) {
    return json(400, { error: 'A public https website URL is required' })
  }
  if (isInstagramUrl(target)) {
    return json(200, {
      photos: [],
      instagram: instagramHandleFromUrl(target),
    })
  }

  try {
    const html = await fetchPublicHtml(target)
    return json(200, {
      photos: extractWebsitePhotos(html, target),
      instagram: instagramHandleFromUrl(target),
    })
  } catch (error) {
    console.error('[place-website]', error)
    return json(200, { photos: [], instagram: null })
  }
}

export async function GET(req: Request): Promise<Response> {
  return handlePlaceWebsite(req)
}
