/**
 * Shared upstream proxy helpers for Vercel Serverless Functions.
 * Keeps RapidAPI / provider keys on the server (no VITE_ prefix).
 */

function env(name: string): string {
  try {
    // eslint-disable-next-line no-undef
    return (globalThis as { process?: { env?: Record<string, string | undefined> } })
      .process?.env?.[name]?.trim() || ''
  } catch {
    return ''
  }
}

export function getRapidApiKey(): string {
  return env('RAPIDAPI_KEY') || env('AERODATABOX_RAPIDAPI_KEY')
}

export function methodNotAllowed(allow: string[]): Response {
  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: {
      'content-type': 'application/json',
      allow: allow.join(', '),
    },
  })
}

export function missingKey(name: string): Response {
  return new Response(
    JSON.stringify({ error: `Server missing ${name} environment variable` }),
    { status: 500, headers: { 'content-type': 'application/json' } },
  )
}

/** Strip `/api/<segment>` prefix and return remaining path + search. */
export function restPathAfterApiSegment(
  requestUrl: string,
  segment: string,
): { pathname: string; search: string } {
  const url = new URL(requestUrl)
  const prefix = `/api/${segment}`
  let pathname = url.pathname
  if (pathname.startsWith(prefix)) {
    pathname = pathname.slice(prefix.length) || '/'
  }
  if (!pathname.startsWith('/')) pathname = `/${pathname}`
  return { pathname, search: url.search }
}

export async function proxyRequest(
  targetUrl: string,
  req: Request,
  extraHeaders: Record<string, string>,
): Promise<Response> {
  const headers = new Headers()
  for (const [k, v] of Object.entries(extraHeaders)) {
    headers.set(k, v)
  }

  const accept = req.headers.get('accept')
  if (accept) headers.set('accept', accept)
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const contentType = req.headers.get('content-type')
    if (contentType) headers.set('content-type', contentType)
  }

  const init: RequestInit = {
    method: req.method,
    headers,
    redirect: 'follow',
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = await req.arrayBuffer()
  }

  const upstream = await fetch(targetUrl, init)
  const outHeaders = new Headers()
  const pass = ['content-type', 'cache-control']
  for (const key of pass) {
    const v = upstream.headers.get(key)
    if (v) outHeaders.set(key, v)
  }

  const upstreamType = (upstream.headers.get('content-type') || '').toLowerCase()
  const isEventStream = upstreamType.includes('text/event-stream')
  if (isEventStream) {
    // Keep SSE chunks flowing through Vercel / reverse proxies without buffering.
    outHeaders.set('cache-control', 'no-cache, no-transform')
    outHeaders.set('connection', 'keep-alive')
    outHeaders.set('x-accel-buffering', 'no')
    if (!outHeaders.has('content-type')) {
      outHeaders.set('content-type', 'text/event-stream; charset=utf-8')
    }

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: outHeaders,
    })
  }

  // Buffer ordinary JSON/binary responses inside the function. Returning the
  // upstream ReadableStream directly is fine in local Node, but a serverless
  // runtime can finalize the invocation before the borrowed stream is fully
  // forwarded, producing an HTTP 200 with an empty body in the browser.
  const body = await upstream.arrayBuffer()
  if (upstream.ok && body.byteLength === 0) {
    return new Response(
      JSON.stringify({
        error: {
          message: 'Upstream returned an empty response body',
          code: 'empty_upstream_body',
        },
      }),
      {
        status: 502,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      },
    )
  }

  return new Response(body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: outHeaders,
  })
}

export function readEnv(...names: string[]): string {
  for (const name of names) {
    const v = env(name)
    if (v) return v
  }
  return ''
}
