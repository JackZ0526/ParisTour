/**
 * Attach Supabase access token to paid /api/* calls.
 * Server verifies the JWT then replaces Authorization with the provider key.
 */
import { getSupabase, isSupabaseConfigured } from '../../../shared/lib/supabase'
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

  if (!isSupabaseConfigured()) return base

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
  const kind = classifyApiRequest(input)
  const isGooglePlaces =
    kind === 'google-place-search' || kind === 'google-place-details'
  if (kind && !isGooglePlaces) recordApiRequest(kind)

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
