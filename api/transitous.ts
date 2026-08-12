import { methodNotAllowed, proxyRequest } from './_lib/proxy.js'
import { requireAllowlistedUser } from './_lib/auth.js'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET(req: Request): Promise<Response> {
  if (req.method !== 'GET') return methodNotAllowed(['GET'])
  const auth = await requireAllowlistedUser(req)
  if (auth.ok === false) return auth.response

  const url = new URL(req.url)
  let rest = url.searchParams.get('rest') || ''
  url.searchParams.delete('rest')
  if (!rest) {
    const prefix = '/api/transitous'
    rest = url.pathname.startsWith(prefix)
      ? url.pathname.slice(prefix.length).replace(/^\//, '')
      : url.pathname.replace(/^\//, '')
  }
  if (!/^api\/v6\/plan$/.test(rest)) {
    return new Response(JSON.stringify({ error: 'Unsupported Transitous path' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    })
  }

  try {
    return await proxyRequest(
      `https://api.transitous.org/${rest}${url.search}`,
      req,
      {
        Accept: 'application/json',
        'User-Agent': 'ParisTour/0.5 (https://paristour.vercel.app)',
      },
    )
  } catch (error) {
    console.error('[transitous]', error)
    return new Response(JSON.stringify({ error: 'Transitous request failed' }), {
      status: 502,
      headers: { 'content-type': 'application/json' },
    })
  }
}
