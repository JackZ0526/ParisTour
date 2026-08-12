import type { Coordinates } from '../../../types'

/** Public OpenStreetMap page for a place; coordinates avoid ambiguous name matches. */
export function openStreetMapPlaceUrl(
  query: string,
  location?: Coordinates | null,
): string {
  if (
    location &&
    Number.isFinite(location.lat) &&
    Number.isFinite(location.lng)
  ) {
    const lat = location.lat.toFixed(6)
    const lng = location.lng.toFixed(6)
    return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`
  }

  return `https://www.openstreetmap.org/search?query=${encodeURIComponent(query.trim())}`
}
