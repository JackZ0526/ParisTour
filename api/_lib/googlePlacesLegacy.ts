/** Map RapidAPI legacy Places (google-map-places) into Places API (New) shapes. */

const PRICE_LEVELS = [
  'PRICE_LEVEL_FREE',
  'PRICE_LEVEL_INEXPENSIVE',
  'PRICE_LEVEL_MODERATE',
  'PRICE_LEVEL_EXPENSIVE',
  'PRICE_LEVEL_VERY_EXPENSIVE',
] as const

type Json = Record<string, unknown>

function asRecord(value: unknown): Json | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Json)
    : null
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/** New V2 400s are often RapidAPI gateway/field-mask mismatches; legacy backup can still succeed. */
export function shouldFallbackFromPrimary(status: number): boolean {
  return (
    status === 400 ||
    status === 401 ||
    status === 403 ||
    status === 429 ||
    status >= 500
  )
}

export function mapLegacyStatusToHttp(status: string): number {
  switch (status.trim().toUpperCase()) {
    case 'OK':
    case 'ZERO_RESULTS':
      return 200
    case 'OVER_QUERY_LIMIT':
    case 'OVER_DAILY_LIMIT':
      return 429
    case 'INVALID_REQUEST':
      return 400
    case 'NOT_FOUND':
      return 404
    default:
      return 502
  }
}

export function mapLegacyPriceLevel(value: unknown): string | undefined {
  if (typeof value === 'number' && value >= 0 && value <= 4) return PRICE_LEVELS[value]
  if (typeof value === 'string' && value.startsWith('PRICE_LEVEL_')) return value
  return undefined
}

export function mapLegacyPlaceToNew(place: unknown): Json | null {
  const row = asRecord(place)
  if (!row) return null
  const id = text(row.place_id) || text(row.id)
  const name = text(row.name)
  if (!id && !name) return null
  const geometry = asRecord(row.geometry)
  const loc = asRecord(geometry?.location) || asRecord(row.location)
  const lat = num(loc?.lat) ?? num(loc?.latitude)
  const lng = num(loc?.lng) ?? num(loc?.longitude)
  const editorial = asRecord(row.editorial_summary)
  const editorialOverview = text(editorial?.overview)
  const hours = asRecord(row.opening_hours)
  const weekday = Array.isArray(hours?.weekday_text)
    ? hours.weekday_text.filter((item): item is string => typeof item === 'string')
    : undefined
  const reviews = Array.isArray(row.reviews)
    ? row.reviews.flatMap((item) => {
        const review = asRecord(item)
        if (!review) return []
        const body = text(review.text) || text(asRecord(review.text)?.text)
        if (!body) return []
        return [
          {
            text: { text: body },
            rating: num(review.rating),
            relativePublishTimeDescription: text(review.relative_time_description),
            authorAttribution: {
              displayName: text(review.author_name) || text(asRecord(review.authorAttribution)?.displayName),
            },
          },
        ]
      })
    : []

  return {
    id,
    displayName: name ? { text: name, languageCode: 'fr' } : undefined,
    formattedAddress: text(row.formatted_address) || undefined,
    shortFormattedAddress: text(row.vicinity) || undefined,
    location:
      lat != null && lng != null ? { latitude: lat, longitude: lng } : undefined,
    rating: num(row.rating),
    userRatingCount: num(row.user_ratings_total) ?? num(row.userRatingCount),
    nationalPhoneNumber: text(row.formatted_phone_number) || undefined,
    internationalPhoneNumber: text(row.international_phone_number) || undefined,
    websiteUri: text(row.website) || text(row.websiteUri) || undefined,
    regularOpeningHours: weekday?.length ? { weekdayDescriptions: weekday } : undefined,
    priceLevel: mapLegacyPriceLevel(row.price_level),
    editorialSummary: editorialOverview ? { text: editorialOverview } : undefined,
    reviews,
    photos: [],
  }
}

export function mapLegacySearchToNew(payload: unknown): { places: Json[] } {
  const root = asRecord(payload)
  const rows = Array.isArray(root?.results)
    ? root.results
    : Array.isArray(root?.places)
      ? root.places
      : []
  return {
    places: rows
      .map((row) => mapLegacyPlaceToNew(row))
      .filter((row): row is Json => Boolean(row)),
  }
}

export function mapLegacyDetailsToNew(payload: unknown): Json | null {
  const root = asRecord(payload)
  return mapLegacyPlaceToNew(root?.result || root)
}

export function legacyTextSearchPath(input: {
  textQuery: string
  languageCode?: string
  regionCode?: string
  location?: { latitude?: number; longitude?: number }
  radiusMeters?: number
}): string {
  const params = new URLSearchParams()
  params.set('query', input.textQuery)
  params.set('language', (input.languageCode || 'fr').slice(0, 2).toLowerCase())
  if (input.regionCode) params.set('region', input.regionCode.slice(0, 2).toLowerCase())
  if (
    input.location?.latitude != null &&
    input.location?.longitude != null &&
    Number.isFinite(input.location.latitude) &&
    Number.isFinite(input.location.longitude)
  ) {
    params.set('location', `${input.location.latitude},${input.location.longitude}`)
    params.set('radius', String(Math.round(input.radiusMeters || 10_000)))
  }
  return `maps/api/place/textsearch/json?${params.toString()}`
}

export function legacyDetailsPath(placeId: string, languageCode = 'fr'): string {
  const params = new URLSearchParams()
  params.set('place_id', placeId)
  params.set('language', languageCode.slice(0, 2).toLowerCase())
  params.set(
    'fields',
    [
      'place_id',
      'name',
      'formatted_address',
      'vicinity',
      'geometry',
      'rating',
      'user_ratings_total',
      'formatted_phone_number',
      'international_phone_number',
      'website',
      'opening_hours',
      'price_level',
      'reviews',
      'editorial_summary',
    ].join(','),
  )
  return `maps/api/place/details/json?${params.toString()}`
}
