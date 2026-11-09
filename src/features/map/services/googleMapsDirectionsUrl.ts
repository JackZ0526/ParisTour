import { localizedCopy } from '../../../shared/i18n/copy/googleMapsDirectionsUrl-8851ad'
import type { Coordinates } from '../../../types'
import { getLocale, translate, type Locale } from '../../../shared/i18n'

export type GoogleMapsTravelMode = 'walking' | 'transit' | 'driving'

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
    if (name && city) return name.toLowerCase().includes(city.toLowerCase()) ? name : `${name}, ${city}`
  }
  return `${point.lat},${point.lng}`
}

/** Map itinerary copy to one of the travel modes supported by Maps URLs. */
export function inferGoogleMapsTravelMode(
  transport?: string,
  walkLevel?: string,
  leg?: { origin: Coordinates; destination: Coordinates; preferDriving?: boolean },
): GoogleMapsTravelMode {
  const explicit = (transport || '').toLowerCase()
  const transit = /metro|subway|rer|train|tram|bus|transit|地铁|公交|公共交通|巴士|火车|轻轨|电车/.test(explicit)
  const walking = /walk|步行|走路|步走/.test(explicit)
  const driving = /taxi|cab|uber|driv|出租车|打车|驾车|自驾|开车|租车/.test(explicit)
  // Honor a single explicit mode. Mixed fallback copy ("Metro or walk back")
  // is not a transit decision; resolve it against the actual leg instead.
  if (Number(transit) + Number(walking) + Number(driving) === 1) {
    return transit ? 'transit' : driving ? 'driving' : 'walking'
  }
  if (leg && [leg.origin, leg.destination].every(point => Number.isFinite(point.lat) && Number.isFinite(point.lng) && Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180 && (point.lat !== 0 || point.lng !== 0))) {
    const rad = (n: number) => n * Math.PI / 180
    const a = Math.sin(rad(leg.destination.lat - leg.origin.lat) / 2) ** 2 + Math.cos(rad(leg.origin.lat)) * Math.cos(rad(leg.destination.lat)) * Math.sin(rad(leg.destination.lng - leg.origin.lng) / 2) ** 2
    const meters = 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(a)))
    // A conservative straight-line threshold, not an advertised walking ETA.
    if (meters <= 1000 && (!driving || walking)) return 'walking'
    if (transit) return 'transit'
    if (driving || leg.preferDriving) return 'driving'
  }
  if (transit) return 'transit'
  if (driving) return 'driving'
  if (/walk|步行|走路|步走/.test((walkLevel || '').toLowerCase())) return 'walking'
  return 'transit'
}

export function googleMapsTravelModeLabel(
  mode: GoogleMapsTravelMode,
  locale: Locale = getLocale(),
): string {
  if (mode === 'driving') return translate('transport.driving', undefined, locale)
  if (mode === 'walking') {
    return (
      translate('transport.walking' as never, undefined, locale) ||
      (locale === 'en' ? localizedCopy('mc11731f120', undefined, 'en') : localizedCopy('mc11731f120', undefined, 'zh-CN'))
    )
  }
  return (
    translate('transport.transit' as never, undefined, locale) ||
    (locale === 'en' ? localizedCopy('me081344bb6', undefined, 'en') : localizedCopy('me081344bb6', undefined, 'zh-CN'))
  )
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
