import type { Coordinates } from '../../../types'

export type GoogleMapsTravelMode = 'walking' | 'transit'

export interface GoogleMapsDirectionsPoint extends Coordinates {
  placeId?: string
  /** Original-language place name used only when no Google Place ID exists. */
  query?: string
  /** Original/English city context that disambiguates text searches. */
  city?: string
}

function usableGooglePlaceId(placeId?: string): string | undefined {
  const value = placeId?.trim()
  // Internal ids such as `llm:...` and `osm:...` are not Google Place IDs.
  return value && !value.includes(':') ? value : undefined
}

function pointQuery(point: GoogleMapsDirectionsPoint): string {
  // A Google Place ID is authoritative, so pair it with coordinates. Without
  // one, original name + city resolves stale coordinates without cross-city
  // ambiguity (for example "Le Petit Marché, Paris, France").
  if (!usableGooglePlaceId(point.placeId)) {
    const name = point.query?.trim()
    const city = point.city?.trim()
    if (name && city) return `${name}, ${city}`
  }
  return `${point.lat},${point.lng}`
}

/** Map itinerary copy to one of the travel modes supported by Maps URLs. */
export function inferGoogleMapsTravelMode(
  transport?: string,
  walkLevel?: string,
): GoogleMapsTravelMode {
  const explicit = (transport || '').toLowerCase()
  if (/metro|subway|rer|train|tram|bus|transit|地铁|公交|巴士|火车|轻轨|电车/.test(explicit)) {
    return 'transit'
  }
  if (/公共交通/.test(explicit)) return 'transit'
  if (/walk|walking|步行|走路|步走/.test(explicit)) return 'walking'
  if (/walk|walking|步行|走路|步走/.test((walkLevel || '').toLowerCase())) {
    return 'walking'
  }
  return 'transit'
}

export function googleMapsTravelModeLabel(mode: GoogleMapsTravelMode): string {
  if (mode === 'walking') return '步行'
  return '公共交通'
}

/**
 * Cross-platform Maps URL: desktop opens the web route; mobile hands it to the
 * Google Maps app when installed. This URL needs no developer API key.
 */
export function googleMapsDirectionsUrl(input: {
  origin: GoogleMapsDirectionsPoint
  destination: GoogleMapsDirectionsPoint
  travelMode: GoogleMapsTravelMode
}): string {
  const params = new URLSearchParams({
    api: '1',
    origin: pointQuery(input.origin),
    destination: pointQuery(input.destination),
    travelmode: input.travelMode,
    dir_action: 'navigate',
  })
  const originPlaceId = usableGooglePlaceId(input.origin.placeId)
  const destinationPlaceId = usableGooglePlaceId(input.destination.placeId)
  if (originPlaceId) params.set('origin_place_id', originPlaceId)
  if (destinationPlaceId) {
    params.set('destination_place_id', destinationPlaceId)
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`
}
