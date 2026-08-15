import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './features/auth/AuthProvider'
import { AuthGate } from './features/auth/components/AuthGate'

// vite-plugin-pwa: register the service worker. With `autoUpdate` in
// vite.config.ts, the new SW activates in the background; we just log
// state transitions so the user can see what's happening in DevTools.
if ('serviceWorker' in navigator) {
  import('virtual:pwa-register')
    .then(({ registerSW }) => {
      registerSW({
        immediate: true,
        onRegisteredSW(swUrl) {
          console.info('[pwa] service worker registered:', swUrl)
        },
        onOfflineReady() {
          console.info('[pwa] offline-ready; cached assets available.')
        },
        onNeedRefresh() {
          // autoUpdate activates the new SW without a reload prompt. We log
          // so a future UI can surface a "new version available" toast.
          console.info('[pwa] new version available; will activate on next load.')
        },
        onRegisterError(error) {
          console.warn('[pwa] SW registration failed:', error)
        },
      })
    })
    .catch(() => {
      /* dev mode without plugin or unsupported env: silent no-op */
    })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <AuthGate>
        <App />
      </AuthGate>
    </AuthProvider>
  </StrictMode>,
)
