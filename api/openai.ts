import {
  methodNotAllowed,
  missingKey,
  proxyRequest,
  readEnv,
} from './_lib/proxy.js'

export const runtime = 'nodejs'
export const maxDuration = 60

/** Proxies /api/openai/* → OpenAI-compatible API. */
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

  const apiKey = readEnv('OPENAI_API_KEY', 'VITE_OPENAI_API_KEY')
  if (!apiKey) return missingKey('OPENAI_API_KEY or VITE_OPENAI_API_KEY')

  const base =
    readEnv('OPENAI_BASE_URL', 'VITE_OPENAI_BASE_URL') || 'https://api.openai.com/v1'

  const url = new URL(req.url)
  let rest = url.searchParams.get('rest') || ''
  url.searchParams.delete('rest')
  if (!rest) {
    const prefix = '/api/openai'
    rest = url.pathname.startsWith(prefix)
      ? url.pathname.slice(prefix.length).replace(/^\//, '')
      : url.pathname.replace(/^\//, '')
  }

  const target = `${base.replace(/\/$/, '')}/${rest}${url.search}`

  try {
    return await proxyRequest(target, req, {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    })
  } catch (err) {
    console.error('[openai]', err)
    return new Response(JSON.stringify({ error: 'Upstream OpenAI request failed' }), {
      status: 502,
      headers: { 'content-type': 'application/json' },
    })
  }
}
