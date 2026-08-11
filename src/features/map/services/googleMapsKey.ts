/** Google Maps Platform browser key — must be client-side; lock down with HTTP referrers. */
export function getGoogleMapsApiKey(): string {
  // Clear any older locally saved key so it cannot override env
  try {
    localStorage.removeItem('paris-tour-google-maps-key')
  } catch {
    /* ignore */
  }

  return (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined)?.trim() || ''
}

/** @deprecated No-op; key comes from VITE_GOOGLE_MAPS_API_KEY only. */
export function setGoogleMapsApiKey(_key: string) {
  try {
    localStorage.removeItem('paris-tour-google-maps-key')
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

/**
 * Places photo media URLs need the browser API key, and must send a Referer
 * (do not use referrerPolicy=no-referrer) when the key is HTTP-referrer restricted.
 */
export function withGoogleMapsPhotoKey(url: string): string {
  const key = getGoogleMapsApiKey()
  if (!url || !key) return url
  if (!url.includes('places.googleapis.com')) return url
  try {
    const u = new URL(url)
    if (!u.searchParams.get('key')) {
      u.searchParams.set('key', key)
    }
    return u.toString()
  } catch {
    return url
  }
}

/** Keep browser credentials out of durable/cloud snapshots; re-add on read. */
export function withoutGoogleMapsPhotoKey(url: string): string {
  if (!url || !url.includes('places.googleapis.com')) return url
  try {
    const u = new URL(url)
    u.searchParams.delete('key')
    return u.toString()
  } catch {
    return url
  }
}
