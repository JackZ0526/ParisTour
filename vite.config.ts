import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // Avoid browser CORS when looking up flights via AviationStack
      // AviationStack free tier is HTTP-only
      '/api/aviationstack': {
        target: 'http://api.aviationstack.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/aviationstack/, '/v1'),
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
})
