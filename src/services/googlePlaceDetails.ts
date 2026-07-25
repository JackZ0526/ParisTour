import type { Coordinates } from '../types'

export interface GoogleReview {
  text: string
  rating?: number
  author?: string
  relativeTime?: string
}

export interface GooglePlaceDetails {
  id?: string
  name: string
  address?: string
  rating?: number
  userRatingCount?: number
  photos: string[]
  reviews: GoogleReview[]
  summary?: string
  phone?: string
  website?: string
  openingHours?: string[]
  priceLevel?: string
  location?: { lat: number; lng: number }
  query: string
}

const detailsCache = new Map<string, GooglePlaceDetails>()
const inflight = new Map<string, Promise<GooglePlaceDetails | null>>()

function cacheKey(query: string, location?: Coordinates) {
  if (!location) return query.trim().toLowerCase()
  return `${query.trim().toLowerCase()}|${location.lat.toFixed(4)},${location.lng.toFixed(4)}`
}

function displayNameOf(value: unknown): string {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'object' && value && 'text' in value) {
    return String((value as { text?: string }).text || '')
  }
  return String(value)
}

/**
 * Load a Google Places "place page" payload for in-app display (no navigation away).
 */
export async function fetchGooglePlaceDetails(
  query: string,
  location?: Coordinates,
): Promise<GooglePlaceDetails | null> {
  const key = cacheKey(query, location)
  const hit = detailsCache.get(key)
  if (hit) return hit

  const pending = inflight.get(key)
  if (pending) return pending

  const task = (async (): Promise<GooglePlaceDetails | null> => {
    if (!window.google?.maps) return null

    const lib = (await google.maps.importLibrary('places')) as unknown as {
      Place: {
        searchByText: (req: Record<string, unknown>) => Promise<{
          places?: Array<{
            id?: string
            displayName?: unknown
            formattedAddress?: string
            rating?: number
            userRatingCount?: number
            editorialSummary?: unknown
            nationalPhoneNumber?: string
            websiteURI?: string
            priceLevel?: string
            regularOpeningHours?: { weekdayDescriptions?: string[] }
            location?: { lat: number | (() => number); lng: number | (() => number) }
            photos?: Array<{
              getURI: (opts?: { maxHeight?: number; maxWidth?: number }) => string
            }>
            reviews?: Array<{
              text?: unknown
              rating?: number
              relativePublishTimeDescription?: string
              authorAttribution?: { displayName?: string }
            }>
            fetchFields?: (req: { fields: string[] }) => Promise<unknown>
          }>
        }>
      }
    }

    function toCoords(
      loc?: { lat: number | (() => number); lng: number | (() => number) },
    ): { lat: number; lng: number } | undefined {
      if (!loc) return undefined
      const lat = typeof loc.lat === 'function' ? loc.lat() : loc.lat
      const lng = typeof loc.lng === 'function' ? loc.lng() : loc.lng
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined
      return { lat, lng }
    }

    const request: Record<string, unknown> = {
      textQuery: query,
      fields: [
        'id',
        'displayName',
        'formattedAddress',
        'location',
        'rating',
        'userRatingCount',
        'photos',
        'reviews',
        'editorialSummary',
        'nationalPhoneNumber',
        'websiteURI',
        'regularOpeningHours',
        'priceLevel',
      ],
      language: 'zh-CN',
      region: 'fr',
      maxResultCount: 1,
    }
    if (location) request.locationBias = location

    const { places } = await lib.Place.searchByText(request)
    let place = places?.[0]
    if (!place) return null

    // Ensure rich fields are loaded when search returns a thin object
    if (place.fetchFields) {
      try {
        await place.fetchFields({
          fields: [
            'displayName',
            'formattedAddress',
            'location',
            'rating',
            'userRatingCount',
            'photos',
            'reviews',
            'editorialSummary',
            'nationalPhoneNumber',
            'websiteURI',
            'regularOpeningHours',
            'priceLevel',
          ],
        })
      } catch {
        /* keep search fields */
      }
    }

    const photos = (place.photos || [])
      .slice(0, 8)
      .map((p) => p.getURI({ maxHeight: 1000, maxWidth: 1400 }))
      .filter(Boolean)

    const reviews: GoogleReview[] = (place.reviews || []).slice(0, 6).map((r) => ({
      text: displayNameOf(r.text),
      rating: r.rating,
      author: r.authorAttribution?.displayName,
      relativeTime: r.relativePublishTimeDescription,
    }))

    const details: GooglePlaceDetails = {
      id: place.id,
      name: displayNameOf(place.displayName) || query,
      address: place.formattedAddress,
      rating: place.rating,
      userRatingCount: place.userRatingCount,
      photos,
      reviews,
      summary: displayNameOf(place.editorialSummary),
      phone: place.nationalPhoneNumber,
      website: place.websiteURI,
      openingHours: place.regularOpeningHours?.weekdayDescriptions,
      priceLevel: place.priceLevel,
      location: toCoords(place.location),
      query,
    }

    detailsCache.set(key, details)
    return details
  })()

  inflight.set(key, task)
  try {
    return await task
  } finally {
    inflight.delete(key)
  }
}

export function placeDetailsQuery(name: string, nameLocal?: string): string {
  const label = nameLocal || name
  if (/paris|france|迪士尼|枫丹白露|cdg|airport/i.test(label)) return label
  return `${label} Paris`
}
