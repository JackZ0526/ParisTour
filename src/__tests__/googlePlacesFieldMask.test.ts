import { describe, expect, it } from 'vitest'
import {
  GOOGLE_PLACES_DETAILS_CORE_FIELD_MASK,
  GOOGLE_PLACES_DETAILS_FIELD_MASK,
  GOOGLE_PLACES_SEARCH_FIELD_MASK,
  googlePlacesUpstreamHeaders,
  normalizeGooglePlaceId,
} from '../../api/googlePlacesFieldMask'

describe('Google Places New V2 request shape', () => {
  it('does not send JSON Content-Type on Place Details GET', () => {
    const getHeaders = googlePlacesUpstreamHeaders('GET')
    expect(getHeaders['Content-Type']).toBeUndefined()
    expect(getHeaders['X-Goog-FieldMask']).toBe(GOOGLE_PLACES_DETAILS_CORE_FIELD_MASK)
    expect(getHeaders['X-Goog-FieldMask']).not.toContain('reviews')
    expect(getHeaders['X-Goog-FieldMask']).not.toContain('places.')

    const fullHeaders = googlePlacesUpstreamHeaders('GET', { fullDetails: true })
    expect(fullHeaders['X-Goog-FieldMask']).toBe(GOOGLE_PLACES_DETAILS_FIELD_MASK)
    expect(fullHeaders['X-Goog-FieldMask']).toContain('reviews')
  })

  it('sends JSON Content-Type and places.* mask on Text Search POST', () => {
    const postHeaders = googlePlacesUpstreamHeaders('POST')
    expect(postHeaders['Content-Type']).toBe('application/json')
    expect(postHeaders['X-Goog-FieldMask']).toBe(GOOGLE_PLACES_SEARCH_FIELD_MASK)
    expect(postHeaders['X-Goog-FieldMask']).toContain('places.websiteUri')
    expect(postHeaders['X-Goog-FieldMask']).not.toContain('places.reviews')
    expect(postHeaders['X-Goog-FieldMask']).not.toContain('places.editorialSummary')
    expect(postHeaders['X-Goog-FieldMask']).not.toContain('places.currentOpeningHours')
  })

  it('strips the places/ resource prefix from details IDs', () => {
    expect(normalizeGooglePlaceId('places/ChIJ-test-place')).toBe('ChIJ-test-place')
    expect(normalizeGooglePlaceId('ChIJ-test-place')).toBe('ChIJ-test-place')
  })
})
