import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'

const PAID_API_PREFIXES = [
  '/api/openai',
  '/api/deepseek',
  '/api/gemini',
  '/api/aerodatabox',
  '/api/timetable-lookup',
  '/api/booking',
  '/api/tripadvisor',
  '/api/place-website',
  '/api/google-places',
]

function readBearer(req: IncomingMessage): string | null {
  const header = req.headers.authorization
  if (!header || typeof header !== 'string') return null
  const m = header.match(/^Bearer\s+(.+)$/i)
  return m?.[1]?.trim() || null
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(body))
}

/** Gate paid Vite proxies behind Supabase JWT + allowlist (mirrors api/_lib/auth.ts). */
function paidApiAuthPlugin(supabaseUrl: string, anonKey: string): Plugin {
  return {
    name: 'paristour-paid-api-auth',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url || ''
        const path = url.split('?')[0] || ''
        if (!PAID_API_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) {
          next()
          return
        }

        if (!supabaseUrl || !anonKey) {
          json(res, 500, {
            error: 'Dev server missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY',
          })
          return
        }

        const token = readBearer(req)
        if (!token) {
          json(res, 401, { error: 'Missing Authorization bearer token' })
          return
        }

        try {
          const userRes = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, {
            headers: {
              Authorization: `Bearer ${token}`,
              apikey: anonKey,
            },
          })
          if (!userRes.ok) {
            json(res, 401, { error: 'Invalid or expired session' })
            return
          }
          const userJson = (await userRes.json()) as { email?: string }
          const email = (userJson.email || '').trim().toLowerCase()
          if (!email) {
            json(res, 401, { error: 'Invalid user' })
            return
          }

          const rpcRes = await fetch(
            `${supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/is_allowlisted_email`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token}`,
                apikey: anonKey,
                'Content-Type': 'application/json',
                Prefer: 'return=representation',
              },
              body: JSON.stringify({ check_email: email }),
            },
          )
          if (!rpcRes.ok) {
            json(res, 403, { error: 'Allowlist check failed' })
            return
          }
          const listed = await rpcRes.json()
          if (listed !== true) {
            json(res, 403, { error: 'Email is not invite-allowlisted' })
            return
          }

          next()
        } catch (err) {
          console.error('[paid-api-auth]', err)
          json(res, 500, { error: 'Auth middleware failed' })
        }
      })
    },
  }
}

/** Local handler for /api/share-invite (Vercel serves api/share-invite.ts in prod). */
function shareInviteDevPlugin(): Plugin {
  return {
    name: 'paristour-share-invite-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const urlPath = (req.url || '').split('?')[0] || ''
        if (urlPath !== '/api/share-invite') {
          next()
          return
        }

        try {
          const chunks: Buffer[] = []
          for await (const chunk of req) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
          }
          const raw = Buffer.concat(chunks)
          const host = req.headers.host || '127.0.0.1:5173'
          const proto = 'http'
          const headers = new Headers()
          for (const [k, v] of Object.entries(req.headers)) {
            if (typeof v === 'string') headers.set(k, v)
            else if (Array.isArray(v)) headers.set(k, v.join(', '))
          }
          if (!headers.has('origin')) {
            headers.set('origin', `${proto}://${host}`)
          }

          const request = new Request(`${proto}://${host}${urlPath}`, {
            method: req.method || 'POST',
            headers,
            body: req.method === 'GET' || req.method === 'HEAD' ? undefined : raw,
          })

          // Resolve from project root (not Vite's .vite-temp copy of this config).
          const modulePath = path.resolve(server.config.root, 'api/share-invite.ts')
          const mod = (await server.ssrLoadModule(modulePath)) as {
            handleShareInvite: (req: Request) => Promise<Response>
          }
          const response = await mod.handleShareInvite(request)
          const outBody = Buffer.from(await response.arrayBuffer())
          res.statusCode = response.status
          response.headers.forEach((value: string, key: string) => {
            if (key.toLowerCase() === 'transfer-encoding') return
            res.setHeader(key, value)
          })
          res.end(outBody)
        } catch (err) {
          console.error('[share-invite-dev]', err)
          json(res, 500, {
            error: err instanceof Error ? err.message : 'share-invite failed',
          })
        }
      })
    },
  }
}

/** Local handler for /api/google-places (Vercel serves api/google-places.ts in prod). */
function googlePlacesDevPlugin(): Plugin {
  return {
    name: 'paristour-google-places-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const urlPath = (req.url || '').split('?')[0] || ''
        if (urlPath !== '/api/google-places') {
          next()
          return
        }

        try {
          const chunks: Buffer[] = []
          for await (const chunk of req) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
          }
          const raw = Buffer.concat(chunks)
          const host = req.headers.host || '127.0.0.1:5173'
          const headers = new Headers()
          for (const [k, v] of Object.entries(req.headers)) {
            if (typeof v === 'string') headers.set(k, v)
            else if (Array.isArray(v)) headers.set(k, v.join(', '))
          }
          const request = new Request(`http://${host}${req.url || urlPath}`, {
            method: req.method || 'GET',
            headers,
            body:
              req.method === 'GET' || req.method === 'HEAD' ? undefined : raw,
          })
          const modulePath = path.resolve(server.config.root, 'api/google-places.ts')
          const mod = (await server.ssrLoadModule(modulePath)) as {
            handleGooglePlaces: (req: Request) => Promise<Response>
          }
          const response = await mod.handleGooglePlaces(request)
          const outBody = Buffer.from(await response.arrayBuffer())
          res.statusCode = response.status
          response.headers.forEach((value: string, key: string) => {
            if (key.toLowerCase() === 'transfer-encoding') return
            res.setHeader(key, value)
          })
          res.end(outBody)
        } catch (err) {
          console.error('[google-places-dev]', err)
          json(res, 500, {
            error: err instanceof Error ? err.message : 'google-places failed',
          })
        }
      })
    },
  }
}

/** Local handler for /api/place-website (Vercel serves api/place-website.ts in prod). */
function placeWebsiteDevPlugin(): Plugin {
  return {
    name: 'paristour-place-website-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const urlPath = (req.url || '').split('?')[0] || ''
        if (urlPath !== '/api/place-website') {
          next()
          return
        }

        try {
          const host = req.headers.host || '127.0.0.1:5173'
          const headers = new Headers()
          for (const [k, v] of Object.entries(req.headers)) {
            if (typeof v === 'string') headers.set(k, v)
            else if (Array.isArray(v)) headers.set(k, v.join(', '))
          }
          const request = new Request(`http://${host}${req.url || urlPath}`, {
            method: req.method || 'GET',
            headers,
          })
          const modulePath = path.resolve(server.config.root, 'api/place-website.ts')
          const mod = (await server.ssrLoadModule(modulePath)) as {
            handlePlaceWebsite: (req: Request) => Promise<Response>
          }
          const response = await mod.handlePlaceWebsite(request)
          const outBody = Buffer.from(await response.arrayBuffer())
          res.statusCode = response.status
          response.headers.forEach((value: string, key: string) => {
            if (key.toLowerCase() === 'transfer-encoding') return
            res.setHeader(key, value)
          })
          res.end(outBody)
        } catch (err) {
          console.error('[place-website-dev]', err)
          json(res, 500, {
            error: err instanceof Error ? err.message : 'place-website failed',
          })
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Expose .env to Node middleware (share-invite uses process.env via readEnv).
  for (const [k, v] of Object.entries(env)) {
    if (process.env[k] === undefined) process.env[k] = v
  }
  const rapidApiKey = env.RAPIDAPI_KEY || env.AERODATABOX_RAPIDAPI_KEY || ''
  const bookingRapidHost =
    env.RAPIDAPI_BOOKING_HOST || 'booking-com18.p.rapidapi.com'
  const tripadvisorRapidHost =
    env.RAPIDAPI_TRIPADVISOR_HOST || 'tripadvisor-com1.p.rapidapi.com'
  const openaiKey = env.OPENAI_API_KEY || ''
  const deepseekKey = env.DEEPSEEK_API_KEY || ''
  const geminiKey = env.GEMINI_API_KEY || ''
  const openaiBase = (env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')
  const deepseekBase = (env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1').replace(/\/$/, '')
  const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL || ''
  const supabaseAnon = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || ''

  let openaiTarget = 'https://api.openai.com'
  let openaiPrefix = '/v1'
  try {
    const u = new URL(openaiBase)
    openaiTarget = u.origin
    openaiPrefix = u.pathname.replace(/\/$/, '') || ''
  } catch {
    /* keep defaults */
  }

  let deepseekTarget = 'https://api.deepseek.com'
  let deepseekPrefix = '/v1'
  try {
    const u = new URL(deepseekBase)
    deepseekTarget = u.origin
    deepseekPrefix = u.pathname.replace(/\/$/, '') || ''
  } catch {
    /* keep defaults */
  }

  return {
    plugins: [
      react(),
      tailwindcss(),
      paidApiAuthPlugin(supabaseUrl, supabaseAnon),
      shareInviteDevPlugin(),
      placeWebsiteDevPlugin(),
      googlePlacesDevPlugin(),
    ],
    server: {
      // Windows often resolves localhost → 127.0.0.1; default Node may bind [::1] only
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      proxy: {
        // Booking COM hotel endpoints. Client-side code has an additional
        // disabled-by-default switch, so development consumes no quota until
        // VITE_BOOKING_API_ENABLED=true is explicitly configured.
        '/api/booking': {
          target: `https://${bookingRapidHost}`,
          changeOrigin: true,
          rewrite: (path) => {
            const url = new URL(path, 'http://localhost')
            const rest = (url.searchParams.get('rest') || '').replace(/^\/+/, '')
            url.searchParams.delete('rest')
            return `/${rest}${url.search}`
          },
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.removeHeader('authorization')
              if (rapidApiKey) proxyReq.setHeader('X-RapidAPI-Key', rapidApiKey)
              proxyReq.setHeader('X-RapidAPI-Host', bookingRapidHost)
              proxyReq.setHeader('Accept', 'application/json')
            })
          },
        },
        '/api/tripadvisor': {
          target: `https://${tripadvisorRapidHost}`,
          changeOrigin: true,
          rewrite: (path) => {
            const url = new URL(path, 'http://localhost')
            const rest = (url.searchParams.get('rest') || '').replace(/^\/+/, '')
            url.searchParams.delete('rest')
            return `/${rest}${url.search}`
          },
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.removeHeader('authorization')
              if (rapidApiKey) proxyReq.setHeader('X-RapidAPI-Key', rapidApiKey)
              proxyReq.setHeader('X-RapidAPI-Host', tripadvisorRapidHost)
              proxyReq.setHeader('Accept', 'application/json')
            })
          },
        },
        // AeroDataBox (RapidAPI) — key injected server-side, never exposed to the browser
        '/api/aerodatabox': {
          target: 'https://aerodatabox.p.rapidapi.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/aerodatabox/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              // Drop user JWT; upstream expects RapidAPI key only
              proxyReq.removeHeader('authorization')
              if (rapidApiKey) {
                proxyReq.setHeader('X-RapidAPI-Key', rapidApiKey)
              }
              proxyReq.setHeader('X-RapidAPI-Host', 'aerodatabox.p.rapidapi.com')
              proxyReq.setHeader('Accept', 'application/json')
            })
          },
        },
        // TimeTable Lookup (RapidAPI / FlightLookup) — schedule XML; key stays server-side
        '/api/timetable-lookup': {
          target: 'https://timetable-lookup.p.rapidapi.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/timetable-lookup/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.removeHeader('authorization')
              if (rapidApiKey) {
                proxyReq.setHeader('X-RapidAPI-Key', rapidApiKey)
              }
              proxyReq.setHeader('X-RapidAPI-Host', 'timetable-lookup.p.rapidapi.com')
              proxyReq.setHeader('Content-Type', 'application/json')
            })
          },
        },
        // Gemini — key injected server-side from GEMINI_API_KEY
        '/api/gemini': {
          target: 'https://generativelanguage.googleapis.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/gemini/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq, req) => {
              proxyReq.removeHeader('authorization')
              if (!geminiKey) return
              try {
                const incoming = new URL(req.url || '/', 'http://localhost')
                incoming.searchParams.delete('key')
                incoming.searchParams.set('key', geminiKey)
                proxyReq.path = `${proxyReq.path.split('?')[0]}?${incoming.searchParams.toString()}`
              } catch {
                /* ignore */
              }
            })
          },
        },
        // OpenAI-compatible — key injected server-side from OPENAI_API_KEY
        '/api/openai': {
          target: openaiTarget,
          changeOrigin: true,
          rewrite: (path) => {
            const rest = path.replace(/^\/api\/openai/, '')
            return `${openaiPrefix}${rest}`
          },
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq, req) => {
              if (openaiKey) {
                proxyReq.setHeader('Authorization', `Bearer ${openaiKey}`)
              }
              // Preserve client Accept (e.g. text/event-stream for chat streaming).
              const accept = req.headers.accept
              if (accept) proxyReq.setHeader('Accept', accept)
              else proxyReq.setHeader('Accept', 'application/json')
            })
          },
        },
        // DeepSeek (OpenAI-compatible) — key injected server-side from DEEPSEEK_API_KEY
        // Chat: /api/deepseek/chat/completions → {base}/chat/completions (usually /v1/...)
        // Responses: /api/deepseek/responses → https://api.deepseek.com/responses (no /v1)
        '/api/deepseek': {
          target: deepseekTarget,
          changeOrigin: true,
          rewrite: (path) => {
            const rest = path.replace(/^\/api\/deepseek/, '')
            if (rest === '/responses' || rest.startsWith('/responses/') || rest.startsWith('/responses?')) {
              return rest
            }
            return `${deepseekPrefix}${rest}`
          },
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq, req) => {
              if (deepseekKey) {
                proxyReq.setHeader('Authorization', `Bearer ${deepseekKey}`)
              }
              const accept = req.headers.accept
              if (accept) proxyReq.setHeader('Accept', accept)
              else proxyReq.setHeader('Accept', 'application/json')
            })
          },
        },
      },
    },
  }
})
