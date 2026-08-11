/** Public API of the auth feature. */
export { AuthProvider, useAuth } from './AuthProvider'
export { AuthGate } from './components/AuthGate'
export { LoginPage } from './components/LoginPage'
export { authApiHeaders, authFetch } from './services/authFetch'
export { DEV_TEST_EMAIL, normalizeAuthEmail } from './devTestAccount'
