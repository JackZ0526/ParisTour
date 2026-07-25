/** Your Google Maps Platform API key */
export const GOOGLE_MAPS_API_KEY = 'AIzaSyCBJlMRB8sXi9oUIOrfgF8LWTQPDtTVBsw'

const LEGACY_STORAGE_KEY = 'paris-tour-google-maps-key'

/** Always use the project Google Maps API key (env override allowed). */
export function getGoogleMapsApiKey(): string {
  // Clear any older locally saved key so it cannot override yours
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY)
  } catch {
    /* ignore */
  }

  return (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || GOOGLE_MAPS_API_KEY).trim()
}

/** @deprecated Kept for compatibility; key is fixed to GOOGLE_MAPS_API_KEY. */
export function setGoogleMapsApiKey(_key: string) {
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

/** Official Maps Embed API URL. */
export function googleMapsEmbedApiUrl(query: string, apiKey: string): string {
  const params = new URLSearchParams({
    key: apiKey,
    q: query,
    language: 'zh-CN',
    zoom: '16',
  })
  return `https://www.google.com/maps/embed/v1/place?${params}`
}
