import { readEnv } from './proxy.js'

export type GooglePlacesProvider = 'official' | 'rapidapi'

const OFFICIAL_HOST = 'places.googleapis.com'

/** `official` talks to Google; `rapidapi` keeps the existing RapidAPI New V2 + legacy backup. */
export function getGooglePlacesProvider(): GooglePlacesProvider {
  const raw = readEnv('GOOGLE_PLACES_PROVIDER').toLowerCase()
  if (raw === 'official' || raw === 'google') return 'official'
  return 'rapidapi'
}

/** Server key for Places API (New). Do not reuse the browser Maps JS referrer-restricted key. */
export function getOfficialGooglePlacesApiKey(): string {
  return readEnv('GOOGLE_PLACES_API_KEY', 'GOOGLE_MAPS_SERVER_API_KEY')
}

export function officialPlacesUrl(rest: string, search: string): string {
  const path = rest.replace(/^\/+/, '')
  return `https://${OFFICIAL_HOST}/${path}${search}`
}

export function withPlacesProviderHeader(
  response: Response,
  provider: GooglePlacesProvider,
): Response {
  const headers = new Headers(response.headers)
  headers.set('x-paristour-places-provider', provider)
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
