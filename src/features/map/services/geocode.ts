import { fetchPlaceDetails } from './placeDetails'

export interface GeocodeResult {
  lat: number
  lng: number
  displayName: string
}

/**
 * Cached Nominatim geocoding for custom hotel addresses in France.
 * Requests share the provider-wide one-request-per-second queue.
 */
export async function geocodeParisAddress(query: string): Promise<GeocodeResult> {
  const q = query.trim()
  if (q.length < 3) {
    throw new Error('请输入更完整的酒店名称或地址')
  }

  const search = q.includes('Paris') || q.includes('巴黎') ? q : `${q}, Paris, France`
  const details = await fetchPlaceDetails(search)
  if (!details?.location) {
    throw new Error('找不到该地址，请尝试法文地址或加上门牌与区号')
  }

  return {
    lat: details.location.lat,
    lng: details.location.lng,
    displayName: details.address || details.name,
  }
}
