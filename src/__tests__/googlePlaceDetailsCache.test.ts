import { beforeEach, describe, expect, it, vi } from 'vitest'

const { authFetch } = vi.hoisted(() => ({ authFetch: vi.fn() }))

vi.mock('../features/auth/services/authFetch', () => ({ authFetch }))

import {
  fetchGooglePlaceDetails,
  peekGooglePlaceDetails,
} from '../features/map/services/googlePlaceDetails'
import { resetGoogleRequestBudgetForTests } from '../features/map/services/googleRequestBudget'
import { resetLlmArtifactStoreForTests } from '../shared/services/llm/llmArtifactStore'

describe('RapidAPI place cache', () => {
  beforeEach(() => {
    authFetch.mockReset()
    resetGoogleRequestBudgetForTests()
    resetLlmArtifactStoreForTests()
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
    // Photo media is a second endpoint and is intentionally not followed.
    expect(first?.photos).toEqual([])
    expect(byId).toEqual(first)
    expect(fromComponentCache).toEqual(first)
  })
})
