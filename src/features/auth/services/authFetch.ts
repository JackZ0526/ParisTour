/**
 * Attach Supabase access token to paid /api/* calls.
 * Server verifies the JWT then replaces Authorization with the provider key.
 * Local-only localhost mode has no session — skip JWT so we don't 401 the
 * Vite paid-API gate or refresh a cloud token just to call DeepSeek.
 */
import {
  getSupabase,
  isCloudSyncEnabled,
  isSupabaseConfigured,
} from '../../../shared/lib/supabase'
import {
  classifyApiRequest,
  recordApiRequest,
} from '../../../shared/services/apiRequestMeter'

export async function authApiHeaders(
  extra?: HeadersInit,
): Promise<Record<string, string>> {
  const base: Record<string, string> = {}
  if (extra) {
    const h = new Headers(extra)
    h.forEach((v, k) => {
      base[k] = v
    })
  }

  if (!isSupabaseConfigured() || !isCloudSyncEnabled()) return base

  try {
    const sb = getSupabase()
    const { data } = await sb.auth.getSession()
    const token = data.session?.access_token
    if (token) {
      base.Authorization = `Bearer ${token}`
    }
  } catch {
    /* ignore */
  }
  return base
}

export async function authFetch(input: string, init?: RequestInit): Promise<Response> {
  const headers = await authApiHeaders(init?.headers)
  const isGooglePlaces = isGooglePlacesPath(input)
  if (!isGooglePlaces) {
    const kind = classifyApiRequest(input)
    if (kind) recordApiRequest(kind)
  }

  const response = await fetch(input, { ...init, headers })
  if (isGooglePlaces) {
    const rawProvider = response.headers.get('x-paristour-places-provider')
    const provider =
      rawProvider === 'official' || rawProvider === 'rapidapi'
        ? rawProvider
        : null
    const resolvedKind = classifyApiRequest(input, provider)
    if (resolvedKind) recordApiRequest(resolvedKind)
  }
  return response
}

function isGooglePlacesPath(input: string): boolean {
  try {
    const url = new URL(input, 'http://local.invalid')
    return url.pathname === '/api/google-places' || url.pathname.startsWith('/api/google-places/')
  } catch {
    return false
  }
}
