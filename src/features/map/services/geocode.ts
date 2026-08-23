import { translate } from '../../../shared/i18n'

export interface GeocodeResult {
  lat: number
  lng: number
  displayName: string
}

/**
 * Nominatim geocoding for custom hotel addresses in France.
 * Please keep usage light and include a valid User-Agent via browser default.
 */
export async function geocodeParisAddress(query: string): Promise<GeocodeResult> {
  const q = query.trim()
  if (q.length < 3) {
    throw new Error(translate('errors.geocodeIncompleteAddress'))
  }

  const params = new URLSearchParams({
    format: 'json',
    q: q.includes('Paris') || q.includes('巴黎') ? q : `${q}, Paris, France`,
    countrycodes: 'fr',
    limit: '1',
  })

  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: {
      Accept: 'application/json',
    },
  })

  if (!res.ok) {
    throw new Error(translate('errors.geocodeFailed'))
  }

  const data = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>
  const first = data[0]
  if (!first) {
    throw new Error(translate('errors.geocodeAddressNotFound'))
  }

  return {
    lat: Number(first.lat),
    lng: Number(first.lon),
    displayName: first.display_name,
  }
}
