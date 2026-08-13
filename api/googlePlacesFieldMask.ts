/** Text Search (New) field masks must be prefixed with `places.`. */
export const GOOGLE_PLACES_SEARCH_FIELD_MASK = [
  'places.id',
  'places.name',
  'places.displayName',
  'places.formattedAddress',
  'places.shortFormattedAddress',
  'places.location',
  'places.rating',
  'places.userRatingCount',
  'places.photos',
  'places.editorialSummary',
  'places.nationalPhoneNumber',
  'places.internationalPhoneNumber',
  'places.websiteUri',
  'places.regularOpeningHours',
  'places.currentOpeningHours',
  'places.priceLevel',
].join(',')

/** Place Details (New) field masks are unprefixed. Reviews stay here, not on Text Search. */
export const GOOGLE_PLACES_DETAILS_FIELD_MASK = [
  'id',
  'name',
  'displayName',
  'formattedAddress',
  'shortFormattedAddress',
  'location',
  'rating',
  'userRatingCount',
  'photos',
  'reviews',
  'editorialSummary',
  'nationalPhoneNumber',
  'internationalPhoneNumber',
  'websiteUri',
  'regularOpeningHours',
  'currentOpeningHours',
  'priceLevel',
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
export function googlePlacesUpstreamHeaders(method: string): Record<string, string> {
  const isPost = method.toUpperCase() === 'POST'
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Goog-FieldMask': isPost
      ? GOOGLE_PLACES_SEARCH_FIELD_MASK
      : GOOGLE_PLACES_DETAILS_FIELD_MASK,
  }
  if (isPost) headers['Content-Type'] = 'application/json'
  return headers
}
