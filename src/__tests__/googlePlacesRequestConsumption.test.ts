import { beforeEach, describe, expect, it, vi } from 'vitest'

const { authFetch } = vi.hoisted(() => ({ authFetch: vi.fn() }))

vi.mock('../features/auth/services/authFetch', () => ({ authFetch }))

import {
  fetchGooglePlaceDetails,
  fetchGooglePlacePhotoMedia,
  resetGooglePlaceDetailsCacheForTests,
  searchNearbyGooglePlaceCandidates,
} from '../features/map/services/googlePlaceDetails'
import {
  getGoogleRequestBudgetSnapshot,
  resetGoogleRequestBudgetForTests,
} from '../features/map/services/googleRequestBudget'
import { resetLlmArtifactStoreForTests } from '../shared/services/llm/llmArtifactStore'

const HOTEL = { lat: 48.86, lng: 2.3 }

function searchResponse(id: string, name: string, website?: string) {
  return new Response(
    JSON.stringify({
      places: [
        {
          id,
          displayName: { text: name, languageCode: 'fr' },
          formattedAddress: 'Paris, France',
          location: { latitude: 48.86, longitude: 2.3 },
          rating: 4.5,
          userRatingCount: 100,
          websiteUri: website,
        },
      ],
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}

function detailsResponse(id: string, name: string, website?: string) {
  return new Response(
    JSON.stringify({
      id,
      displayName: { text: name, languageCode: 'fr' },
      formattedAddress: 'Paris, France',
      location: { latitude: 48.86, longitude: 2.3 },
      rating: 4.5,
      websiteUri: website,
      reviews: [{ text: { text: 'Bon.' }, rating: 5 }],
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}

describe('current Places request consumption', () => {
  beforeEach(() => {
    authFetch.mockReset()
    resetGoogleRequestBudgetForTests()
    resetLlmArtifactStoreForTests()
    resetGooglePlaceDetailsCacheForTests()
  })

  it('uses 1 Text Search for a name lookup, then 0 to reopen the same place', async () => {
    authFetch.mockResolvedValue(searchResponse('ChIJ-cafe', 'Café de Flore', 'https://flore.test'))

    await fetchGooglePlaceDetails('Café de Flore Paris', undefined)
    await fetchGooglePlaceDetails('Café de Flore Paris', undefined, {
      placeId: 'ChIJ-cafe',
    })
    await fetchGooglePlaceDetails('Café de Flore Paris', undefined)

    expect(authFetch).toHaveBeenCalledTimes(1)
    expect(getGoogleRequestBudgetSnapshot().byKind).toEqual({ 'place-search': 1 })
  })

  it('uses 1 Place Details when opening an uncached place by id that already has a website', async () => {
    authFetch.mockImplementation(() =>
      detailsResponse('ChIJ-id', 'Le Comptoir', 'https://comptoir.test'),
    )

    await fetchGooglePlaceDetails('Le Comptoir Paris', undefined, {
      placeId: 'ChIJ-id',
    })
    await fetchGooglePlaceDetails('Le Comptoir Paris', undefined, {
      placeId: 'ChIJ-id',
    })

    expect(authFetch).toHaveBeenCalledTimes(1)
    expect(authFetch.mock.calls[0][0]).toContain('v1%2Fplaces%2FChIJ-id')
    expect(getGoogleRequestBudgetSnapshot().byKind).toEqual({ 'place-details': 1 })
  })

  it('uses 1 extra Place Details once to recover a missing website, then stops', async () => {
    authFetch
      .mockResolvedValueOnce(searchResponse('ChIJ-no-site', 'Sogno'))
      .mockResolvedValueOnce(detailsResponse('ChIJ-no-site', 'Sogno'))

    await fetchGooglePlaceDetails('Sogno Paris', undefined)
    await fetchGooglePlaceDetails('Sogno Paris', undefined, { placeId: 'ChIJ-no-site' })
    await fetchGooglePlaceDetails('Sogno Paris', undefined, { placeId: 'ChIJ-no-site' })

    expect(authFetch).toHaveBeenCalledTimes(2)
    expect(getGoogleRequestBudgetSnapshot().byKind).toEqual({
      'place-search': 1,
      'place-details': 1,
    })
  })

  it('upgrades a cached search result once when the detail page requests reviews', async () => {
    authFetch
      .mockResolvedValueOnce(
        searchResponse('ChIJ-full', 'Le Full', 'https://full.test'),
      )
      .mockResolvedValueOnce(
        detailsResponse('ChIJ-full', 'Le Full', 'https://full.test'),
      )

    await fetchGooglePlaceDetails('Le Full Paris', undefined)
    const full = await fetchGooglePlaceDetails('Le Full Paris', undefined, {
      placeId: 'ChIJ-full',
      requireFullDetails: true,
    })
    await fetchGooglePlaceDetails('Le Full Paris', undefined, {
      placeId: 'ChIJ-full',
      requireFullDetails: true,
    })

    expect(full?.reviews[0]?.text).toBe('Bon.')
    expect(full?.fullDetails).toBe(true)
    expect(authFetch).toHaveBeenCalledTimes(2)
    expect(authFetch.mock.calls[1][0]).toContain('detailsMode=full')
    expect(getGoogleRequestBudgetSnapshot().byKind).toEqual({
      'place-search': 1,
      'place-details': 1,
    })
  })

  it('uses 1 Text Search per nearby candidate query (cafe + restaurant = 2)', async () => {
    authFetch.mockImplementation(() =>
      searchResponse('ChIJ-near', 'Nearby Cafe', 'https://near.test'),
    )

    await searchNearbyGooglePlaceCandidates({
      textQuery: 'specialty coffee bakery brunch Paris',
      location: HOTEL,
      maxDistanceMeters: 12_000,
      limit: 20,
    })
    await searchNearbyGooglePlaceCandidates({
      textQuery: 'restaurant Paris',
      location: HOTEL,
      maxDistanceMeters: 12_000,
      limit: 20,
    })
    await searchNearbyGooglePlaceCandidates({
      textQuery: 'specialty coffee bakery brunch Paris',
      location: HOTEL,
      maxDistanceMeters: 12_000,
      limit: 20,
    })

    expect(authFetch).toHaveBeenCalledTimes(2)
    expect(getGoogleRequestBudgetSnapshot().byKind).toEqual({ 'place-search': 2 })
  })

  it('never spends a Place Photo request', async () => {
    await fetchGooglePlacePhotoMedia('places/ChIJ-test/photos/photo-1')
    expect(authFetch).not.toHaveBeenCalled()
    expect(getGoogleRequestBudgetSnapshot().used).toBe(0)
  })
})
