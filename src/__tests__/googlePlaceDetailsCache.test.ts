import { beforeEach, describe, expect, it, vi } from 'vitest'

const { authFetch } = vi.hoisted(() => ({ authFetch: vi.fn() }))

vi.mock('../features/auth/services/authFetch', () => ({ authFetch }))

import {
  fetchGooglePlaceDetails,
  googlePlacePhotoMediaUrl,
  peekGooglePlaceDetails,
  resetGooglePlaceDetailsCacheForTests,
} from '../features/map/services/googlePlaceDetails'
import { resetGoogleRequestBudgetForTests } from '../features/map/services/googleRequestBudget'
import { resetLlmArtifactStoreForTests } from '../shared/services/llm/llmArtifactStore'

describe('RapidAPI place cache', () => {
  beforeEach(() => {
    authFetch.mockReset()
    resetGoogleRequestBudgetForTests()
    resetLlmArtifactStoreForTests()
    resetGooglePlaceDetailsCacheForTests()
  })

  it('reuses a complete Text Search result for later ID and component reads', async () => {
    authFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          places: [
            {
              id: 'ChIJ-test-place',
              displayName: { text: 'Tour Eiffel', languageCode: 'fr' },
              formattedAddress: 'Av. Gustave Eiffel, 75007 Paris, France',
              location: { latitude: 48.85837, longitude: 2.294481 },
              rating: 4.7,
              userRatingCount: 492536,
              nationalPhoneNumber: '01 23 45 67 89',
              websiteUri: 'https://example.test',
              regularOpeningHours: {
                weekdayDescriptions: ['lundi: 09:00–23:00'],
              },
              editorialSummary: { text: 'Monument parisien.' },
              photos: [{ name: 'places/ChIJ-test-place/photos/photo-1' }],
              reviews: [
                {
                  rating: 5,
                  originalText: { text: 'Magnifique.' },
                  authorAttribution: { displayName: 'Camille' },
                  relativePublishTimeDescription: 'il y a un mois',
                },
              ],
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )

    const first = await fetchGooglePlaceDetails('Tour Eiffel Paris', undefined)
    const byId = await fetchGooglePlaceDetails('Tour Eiffel Paris', undefined, {
      placeId: 'ChIJ-test-place',
    })
    const fromComponentCache = peekGooglePlaceDetails('Tour Eiffel')

    expect(authFetch).toHaveBeenCalledTimes(1)
    expect(authFetch).toHaveBeenCalledWith(
      '/api/google-places?rest=v1%2Fplaces%3AsearchText',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(first).toMatchObject({
      id: 'ChIJ-test-place',
      name: 'Tour Eiffel',
      rating: 4.7,
      userRatingCount: 492536,
      phone: '01 23 45 67 89',
      website: 'https://example.test',
      openingHours: ['lundi: 09:00–23:00'],
      summary: 'Monument parisien.',
      location: { lat: 48.85837, lng: 2.294481 },
    })
    expect(first?.reviews[0]).toMatchObject({
      text: 'Magnifique.',
      author: 'Camille',
    })
    // Search/Details only store photo resource names; Place Photo (New) resolves them later.
    expect(first?.photos[0]).toBe('places/ChIJ-test-place/photos/photo-1')
    expect(byId).toEqual(first)
    expect(fromComponentCache).toEqual(first)
  })

  it('turns a Place photo resource name into a media URL without a RapidAPI call', () => {
    expect(
      googlePlacePhotoMediaUrl('places/ChIJ-test-place/photos/photo-1'),
    ).toBe(
      'https://places.googleapis.com/v1/places/ChIJ-test-place/photos/photo-1/media?maxHeightPx=900&maxWidthPx=900',
    )
  })

  it('recovers a missing website once, then reuses the cache', async () => {
    authFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            places: [
              {
                id: 'ChIJ-no-website',
                displayName: { text: 'Le Maxan', languageCode: 'fr' },
                location: { latitude: 48.86, longitude: 2.3 },
                photos: [{ name: 'places/ChIJ-no-website/photos/room-1' }],
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'ChIJ-no-website',
            displayName: { text: 'Le Maxan', languageCode: 'fr' },
            location: { latitude: 48.86, longitude: 2.3 },
            websiteUri: 'https://www.rest-maxan.com/',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )

    const first = await fetchGooglePlaceDetails('Le Maxan Paris', undefined)
    expect(first?.website).toBeUndefined()
    const withWebsite = await fetchGooglePlaceDetails('Le Maxan Paris', undefined, {
      placeId: 'ChIJ-no-website',
    })
    expect(authFetch).toHaveBeenCalledTimes(2)
    expect(withWebsite?.website).toBe('https://www.rest-maxan.com/')

    const again = await fetchGooglePlaceDetails('Le Maxan Paris', undefined, {
      placeId: 'ChIJ-no-website',
    })
    expect(authFetch).toHaveBeenCalledTimes(2)
    expect(again?.website).toBe('https://www.rest-maxan.com/')
  })

  it('keeps the cached place when website recovery finds nothing', async () => {
    authFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            places: [
              {
                id: 'ChIJ-still-no-site',
                displayName: { text: 'Sogno', languageCode: 'fr' },
                location: { latitude: 48.87, longitude: 2.29 },
                rating: 4.8,
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'ChIJ-still-no-site',
            displayName: { text: 'Sogno', languageCode: 'fr' },
            location: { latitude: 48.87, longitude: 2.29 },
            rating: 4.8,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )

    const first = await fetchGooglePlaceDetails('Sogno Paris', undefined)
    expect(first?.rating).toBe(4.8)
    const recovered = await fetchGooglePlaceDetails('Sogno Paris', undefined, {
      placeId: 'ChIJ-still-no-site',
    })
    expect(recovered?.rating).toBe(4.8)
    const third = await fetchGooglePlaceDetails('Sogno Paris', undefined, {
      placeId: 'ChIJ-still-no-site',
    })
    expect(authFetch).toHaveBeenCalledTimes(2)
    expect(third?.rating).toBe(4.8)
  })

  it('does not call Place Photo (New) for a resource name', async () => {
    const { fetchGooglePlacePhotoMedia } = await import(
      '../features/map/services/googlePlaceDetails'
    )
    const uri = await fetchGooglePlacePhotoMedia(
      'places/ChIJ-test-place/photos/photo-1',
    )
    expect(uri).toBeNull()
    expect(authFetch).not.toHaveBeenCalled()
  })
})
