import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './features/auth/AuthProvider'
import { AuthGate } from './features/auth/components/AuthGate'
import { initTheme } from './shared/services/themeStore'
import { initLocale, subscribeLocale, getLocale, translate } from './shared/i18n'

initTheme()
initLocale()

// Keep <title> in sync with the active locale. Static strings are
// "Paris Tour" (brand) + a locale-aware tagline. We intentionally
// don't depend on a particular destination so the app stays generic.
const APP_TITLE_BY_LOCALE: Record<string, string> = {
  'zh-CN': 'Paris Tour · 行程规划',
  en: 'Paris Tour · Trip Planner',
}
function syncDocumentTitle() {
  const locale = getLocale()
  const base = APP_TITLE_BY_LOCALE[locale] ?? APP_TITLE_BY_LOCALE.en
  document.title = `${base} · ${translate('app.brandTagline', undefined, locale)}`
}
syncDocumentTitle()
subscribeLocale(syncDocumentTitle)

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

// PWA mode detection + orientation class for portrait lock.
// Triggers `body.is-pwa` and `body.orientation-landscape` when running
// inside an installed PWA, so CSS can lock the layout to portrait.
// `display-mode` is a media-query level 4 feature that Tailwind v4's
// Lightning CSS parser doesn't accept in @media queries, so we use
// `matchMedia` from JS instead.
{
  const mqlDisplay = window.matchMedia('(display-mode: standalone)')
  const mqlFullscreen = window.matchMedia('(display-mode: fullscreen)')
  const updatePwa = () => {
    const isPwa = mqlDisplay.matches || mqlFullscreen.matches
    document.body.classList.toggle('is-pwa', isPwa)
  }
  updatePwa()
  mqlDisplay.addEventListener('change', updatePwa)
  mqlFullscreen.addEventListener('change', updatePwa)

  const mqlOrient = window.matchMedia('(orientation: landscape)')
  const updateOrient = () => {
    document.body.classList.toggle(
      'orientation-landscape',
      mqlOrient.matches,
    )
  }
  updateOrient()
  mqlOrient.addEventListener('change', updateOrient)
}
