import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'

const PAID_API_PREFIXES = [
  '/api/openai',
  '/api/gemini',
  '/api/aerodatabox',
  '/api/timetable-lookup',
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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Expose .env to Node middleware (share-invite uses process.env via readEnv).
  for (const [k, v] of Object.entries(env)) {
    if (process.env[k] === undefined) process.env[k] = v
  }
  const rapidApiKey = env.RAPIDAPI_KEY || env.AERODATABOX_RAPIDAPI_KEY || ''
  const openaiKey = env.OPENAI_API_KEY || ''
  const geminiKey = env.GEMINI_API_KEY || ''
  const openaiBase = (env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')
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

  return {
    plugins: [
      react(),
      tailwindcss(),
      paidApiAuthPlugin(supabaseUrl, supabaseAnon),
      shareInviteDevPlugin(),
    ],
    server: {
      // Windows often resolves localhost → 127.0.0.1; default Node may bind [::1] only
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      proxy: {
        // Avoid browser CORS when looking up flights via AviationStack
        // AviationStack free tier is HTTP-only
        '/api/aviationstack': {
          target: 'http://api.aviationstack.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/aviationstack/, '/v1'),
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
            proxy.on('proxyReq', (proxyReq) => {
              if (openaiKey) {
                proxyReq.setHeader('Authorization', `Bearer ${openaiKey}`)
              }
              proxyReq.setHeader('Accept', 'application/json')
            })
          },
        },
      },
    },
  }
})
