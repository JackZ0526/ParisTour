/** Text Search (New) field masks must be prefixed with `places.`. */
export const GOOGLE_PLACES_SEARCH_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.rating',
  'places.userRatingCount',
  'places.websiteUri',
  'places.priceLevel',
].join(',')

/** Core Place Details used by non-detail workflows; capped at the Enterprise SKU. */
export const GOOGLE_PLACES_DETAILS_CORE_FIELD_MASK = [
  'id',
  'displayName',
  'formattedAddress',
  'location',
  'rating',
  'userRatingCount',
  'nationalPhoneNumber',
  'internationalPhoneNumber',
  'websiteUri',
  'regularOpeningHours',
  'currentOpeningHours',
  'priceLevel',
].join(',')

/** One-shot RapidAPI detail fallback, including the album and review text. */
export const GOOGLE_PLACES_DETAILS_FIELD_MASK = [
  GOOGLE_PLACES_DETAILS_CORE_FIELD_MASK,
  'photos',
  'reviews',
].join(',')

/** Tripadvisor review fallback. Photos come from the official website instead. */
export const GOOGLE_PLACES_DETAILS_REVIEWS_FIELD_MASK = [
  GOOGLE_PLACES_DETAILS_CORE_FIELD_MASK,
  'reviews',
].join(',')

/** Minimal first request for the two-step Place Photo fallback. */
export const GOOGLE_PLACES_DETAILS_PHOTOS_FIELD_MASK = [
  'id',
  'photos',
].join(',')

export function normalizeGooglePlaceId(placeId: string): string {
  let value = placeId.trim()
  try {
    value = decodeURIComponent(value)
  } catch {
    // Keep the raw id if it is not URI-encoded.
  }
  return value.replace(/^places\//, '').trim()
}

/** RapidAPI Place Details is GET with no body. Sending JSON Content-Type makes the gateway return 400. */
export function googlePlacesUpstreamHeaders(
  method: string,
  options?: {
    fullDetails?: boolean
    reviewDetails?: boolean
    photoDetails?: boolean
  },
): Record<string, string> {
  const isPost = method.toUpperCase() === 'POST'
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Goog-FieldMask': isPost
      ? GOOGLE_PLACES_SEARCH_FIELD_MASK
      : options?.reviewDetails
        ? GOOGLE_PLACES_DETAILS_REVIEWS_FIELD_MASK
      : options?.photoDetails
        ? GOOGLE_PLACES_DETAILS_PHOTOS_FIELD_MASK
      : options?.fullDetails
        ? GOOGLE_PLACES_DETAILS_FIELD_MASK
        : GOOGLE_PLACES_DETAILS_CORE_FIELD_MASK,
  }
  if (isPost) headers['Content-Type'] = 'application/json'
  return headers
}
