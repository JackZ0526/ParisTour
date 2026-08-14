/** Public API of the auth feature. */
export { AuthProvider } from './AuthProvider'
export { useAuth } from './authContext'
export { AuthGate } from './components/AuthGate'
export { LoginPage } from './components/LoginPage'
export { authApiHeaders, authFetch } from './services/authFetch'
export { DEV_TEST_EMAIL, normalizeAuthEmail } from './devTestAccount'
