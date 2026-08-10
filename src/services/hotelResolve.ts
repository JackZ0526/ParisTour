import { hotelAreaKeyFromLabel, normalizeHotelAreaLabel } from '../data/hotels'
import type { HotelCandidate, SelectedHotel } from '../types'
import { geocodeParisAddress } from './geocode'
import { fetchGooglePlaceDetails } from './googlePlaceDetails'

const FALLBACK_HOTEL_IMAGE =
  'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80'

export function candidateToSelected(card: HotelCandidate): SelectedHotel {
  return {
    id: card.id,
    googlePlaceId: card.googlePlaceId,
    name: card.name,
    address: card.address,
    lat: card.lat,
    lng: card.lng,
    nearestMetro: card.nearestMetro,
    areaKey: hotelAreaKeyFromLabel(card.area),
    source: card.source === 'custom' ? 'custom' : 'recommended',
    description: card.description,
    image: card.image,
    ratingHint: card.priceHint,
  }
}

function ratingHint(details: {
  rating?: number
  userRatingCount?: number
} | null): string | undefined {
  if (details?.rating == null) return undefined
  const count =
    details.userRatingCount != null ? `（${details.userRatingCount}）` : ''
  return `Google ★ ${details.rating.toFixed(1)}${count}`
}

/** Resolve a hotel name/address into a candidate card via Google Places (+ Nominatim fallback). */
export async function resolveHotelCandidate(input: {
  googlePlaceId?: string
  name: string
  address?: string
  area?: string
  description?: string
  nearestMetro?: string
  priceHint?: string
  reason?: string
  isBest?: boolean
  source?: 'llm' | 'custom'
}): Promise<HotelCandidate> {
  const query = [input.name, input.address, 'Paris'].filter(Boolean).join(' ')
  const details = await fetchGooglePlaceDetails(query, undefined, {
    placeId: input.googlePlaceId,
  }).catch(() => null)

  let lat = details?.location?.lat
  let lng = details?.location?.lng
  let address = details?.address || input.address || ''

  if (lat == null || lng == null) {
    const geo = await geocodeParisAddress(input.address || input.name)
    lat = geo.lat
    lng = geo.lng
    if (!address) address = geo.displayName
  }

  const name = details?.name || input.name
  const hint = ratingHint(details) || input.priceHint || '巴黎酒店'
  const area = normalizeHotelAreaLabel({
    area: input.area,
    address,
    name,
    lat,
    lng,
  })

  return {
    id: `hotel-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    googlePlaceId: details?.id || input.googlePlaceId,
    name,
    area,
    address: address || `${name}, Paris`,
    description:
      input.description ||
      details?.summary ||
      `${name}，适合作为巴黎行程住宿起点。`,
    priceHint: hint,
    nearestMetro: input.nearestMetro || '请确认最近地铁站',
    image: details?.photos?.[0] || FALLBACK_HOTEL_IMAGE,
    lat,
    lng,
    reason: input.reason,
    isBest: Boolean(input.isBest),
    source: input.source || 'custom',
  }
}

export async function resolveHotelCandidates(
  rows: Array<{
    googlePlaceId?: string
    name: string
    address?: string
    area?: string
    description?: string
    nearestMetro?: string
    priceHint?: string
    reason?: string
    isBest?: boolean
  }>,
): Promise<HotelCandidate[]> {
  const settled = await Promise.allSettled(
    rows.map((row) =>
      resolveHotelCandidate({
        ...row,
        source: 'llm',
      }),
    ),
  )

  const out: HotelCandidate[] = []
  for (const result of settled) {
    if (result.status === 'fulfilled') out.push(result.value)
  }
  return out
}
