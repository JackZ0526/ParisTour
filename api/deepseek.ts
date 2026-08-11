import {
  methodNotAllowed,
  missingKey,
  proxyRequest,
  readEnv,
} from './_lib/proxy.js'
import { requireAllowlistedUser } from './_lib/auth.js'

export const runtime = 'nodejs'
export const maxDuration = 120

/** Proxies /api/deepseek/* → DeepSeek OpenAI-compatible API. */
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

  const apiKey = readEnv('DEEPSEEK_API_KEY')
  if (!apiKey) return missingKey('DEEPSEEK_API_KEY')

  const base = readEnv('DEEPSEEK_BASE_URL') || 'https://api.deepseek.com/v1'

  const url = new URL(req.url)
  let rest = url.searchParams.get('rest') || ''
  url.searchParams.delete('rest')
  if (!rest) {
    const prefix = '/api/deepseek'
    rest = url.pathname.startsWith(prefix)
      ? url.pathname.slice(prefix.length).replace(/^\//, '')
      : url.pathname.replace(/^\//, '')
  }

  const target = `${base.replace(/\/$/, '')}/${rest}${url.search}`

  try {
    return await proxyRequest(target, req, {
      Authorization: `Bearer ${apiKey}`,
    })
  } catch (err) {
    console.error('[deepseek]', err)
    return new Response(JSON.stringify({ error: 'Upstream DeepSeek request failed' }), {
      status: 502,
      headers: { 'content-type': 'application/json' },
    })
  }
}
