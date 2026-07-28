import {
  methodNotAllowed,
  missingKey,
  proxyRequest,
  readEnv,
} from './_lib/proxy.js'

export const runtime = 'nodejs'
export const maxDuration = 60

/** Proxies /api/gemini/* → Google Generative Language API. */
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

  const key = readEnv('GEMINI_API_KEY')
  const url = new URL(req.url)
  let rest = url.searchParams.get('rest') || ''
  url.searchParams.delete('rest')
  // Never trust a browser-supplied key=
  url.searchParams.delete('key')
  if (!rest) {
    const prefix = '/api/gemini'
    rest = url.pathname.startsWith(prefix)
      ? url.pathname.slice(prefix.length).replace(/^\//, '')
      : url.pathname.replace(/^\//, '')
  }

  const target = new URL(`https://generativelanguage.googleapis.com/${rest}${url.search}`)
  if (key) {
    target.searchParams.set('key', key)
  }
  if (!target.searchParams.get('key')) {
    return missingKey('GEMINI_API_KEY')
  }

  try {
    return await proxyRequest(target.toString(), req, {
      Accept: 'application/json',
    })
  } catch (err) {
    console.error('[gemini]', err)
    return new Response(JSON.stringify({ error: 'Upstream Gemini request failed' }), {
      status: 502,
      headers: { 'content-type': 'application/json' },
    })
  }
}
