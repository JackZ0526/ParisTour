import { hotelAreaKeyFromLabel, normalizeHotelAreaLabel } from '../constants/hotels'
import type { HotelCandidate, SelectedHotel } from '../../../types'
import { geocodeParisAddress } from '../../map/services/geocode'
import {
  peekBookingHotel,
  resolveBookingHotelIdentity,
  type BookingHotelRecord,
} from './bookingHotels'
import { loadTripDates } from '../../itinerary/services/tripDates'

const FALLBACK_HOTEL_IMAGE =
  'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80'

export const BOOKING_IDENTITY_VERSION = 3

export function candidateToSelected(card: HotelCandidate): SelectedHotel {
  return {
    id: card.id,
    bookingHotelId: card.bookingHotelId,
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

/** Replace every provider-owned identity field with Booking's canonical record. */
export function applyBookingHotelIdentity(
  card: HotelCandidate,
  identity: BookingHotelRecord,
): HotelCandidate {
  const name = identity.name
  const address = identity.address || card.address
  const lat = identity.location.lat
  const lng = identity.location.lng
  return {
    ...card,
    bookingHotelId: identity.id,
    bookingIdentityVersion: BOOKING_IDENTITY_VERSION,
    googlePlaceId: undefined,
    name,
    address,
    lat,
    lng,
    area: normalizeHotelAreaLabel({
      area: identity.area,
      address,
      name,
      lat,
      lng,
    }),
    image: identity.image || card.image,
    photos: identity.photos.length ? identity.photos : card.photos,
    description: identity.description || '',
    reason: undefined,
    tripFit: undefined,
    hotelAdvisorVersion: undefined,
    rating: identity.rating,
    reviewCount: identity.reviewCount,
    starRating: identity.stars,
    propertyType: identity.propertyType,
    facilities: [],
    reviewScores: undefined,
    languages: undefined,
    policies: undefined,
    paymentMethods: undefined,
    sustainability: undefined,
    districtLabel: undefined,
    distanceToCityCenterKm: undefined,
    locationDescription: undefined,
    reviews: [],
    checkIn: undefined,
    checkOut: undefined,
    bookingUrl: undefined,
    bookingDetailsLoaded: false,
    bookingDetailsVersion: undefined,
    bookingPhotosLoaded: false,
    bookingReviewsLoaded: false,
  }
}

function ratingHint(details: Pick<BookingHotelRecord, 'rating' | 'reviewCount'> | null) {
  if (details?.rating == null) return undefined
  const count = details.reviewCount != null ? `（${details.reviewCount}）` : ''
  return `Booking.com ${details.rating.toFixed(1)}/10${count}`
}

async function resolveRecord(input: {
  bookingHotelId?: string
  name: string
}): Promise<BookingHotelRecord | null> {
  const cached = peekBookingHotel(input.bookingHotelId)
  if (cached) return cached
  if (!input.bookingHotelId) {
    return resolveBookingHotelIdentity(input.name, loadTripDates()).catch(() => null)
  }
  return null
}

/** Resolve a hotel through the Booking provider, with Nominatim as coordinate fallback only. */
export async function resolveHotelCandidate(input: {
  bookingHotelId?: string
  /** Legacy saved identity; never sent to Booking. */
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
  let details = await resolveRecord(input).catch(() => null)

  let lat = details?.location.lat
  let lng = details?.location.lng
  let address = details?.address || input.address || ''

  if (lat == null || lng == null) {
    const rawGeocodeQuery = input.address || input.name
    let geo
    try {
      geo = await geocodeParisAddress(rawGeocodeQuery)
    } catch (cause) {
      const addressOnly = rawGeocodeQuery.split(',').slice(1).join(',').trim()
      if (!addressOnly) throw cause
      geo = await geocodeParisAddress(addressOnly)
    }
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
    bookingHotelId: details?.id || input.bookingHotelId,
    bookingIdentityVersion: details?.id ? BOOKING_IDENTITY_VERSION : undefined,
    googlePlaceId: input.googlePlaceId,
    name,
    area,
    address: address || `${name}, Paris`,
    description:
      input.description ||
      details?.description ||
      `${name}，适合作为巴黎行程住宿起点。`,
    priceHint: hint,
    nearestMetro: input.nearestMetro || '请确认最近地铁站',
    image: details?.image || details?.photos[0] || FALLBACK_HOTEL_IMAGE,
    photos: details?.photos,
    rating: details?.rating,
    reviewCount: details?.reviewCount,
    starRating: details?.stars,
    facilities: details?.facilities,
    reviews: details?.reviews.map((review) => ({
      text: review.text,
      negativeText: review.negativeText,
      rating: review.rating,
      author: review.author,
      relativeTime: review.completedAt
        ? new Date(review.completedAt * 1_000).toLocaleDateString('zh-CN')
        : undefined,
    })),
    checkIn: details?.checkIn,
    checkOut: details?.checkOut,
    bookingUrl: details?.sourceUrl,
    lat,
    lng,
    reason: input.reason,
    isBest: Boolean(input.isBest),
    source: input.source || 'custom',
  }
}

export async function resolveHotelCandidates(
  rows: Array<{
    bookingHotelId?: string
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
    rows.map((row) => resolveHotelCandidate({ ...row, source: 'llm' })),
  )
  return settled.flatMap((result) =>
    result.status === 'fulfilled' ? [result.value] : [],
  )
}
