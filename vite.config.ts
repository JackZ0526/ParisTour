import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const rapidApiKey = env.RAPIDAPI_KEY || env.AERODATABOX_RAPIDAPI_KEY || ''

  return {
    plugins: [react(), tailwindcss()],
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
              if (rapidApiKey) {
                proxyReq.setHeader('X-RapidAPI-Key', rapidApiKey)
              }
              proxyReq.setHeader('X-RapidAPI-Host', 'timetable-lookup.p.rapidapi.com')
              proxyReq.setHeader('Content-Type', 'application/json')
            })
          },
        },
        '/api/gemini': {
          target: 'https://generativelanguage.googleapis.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/gemini/, ''),
        },
        '/api/openai': {
          target: 'https://api.openai.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/openai/, '/v1'),
        },
      },
    },
  }
})
