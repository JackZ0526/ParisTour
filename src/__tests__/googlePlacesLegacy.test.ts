import { describe, expect, it } from 'vitest'
import {
  legacyDetailsPath,
  legacyTextSearchPath,
  mapLegacyDetailsToNew,
  mapLegacyPriceLevel,
  mapLegacySearchToNew,
  mapLegacyStatusToHttp,
  shouldFallbackFromPrimary,
} from '../../api/_lib/googlePlacesLegacy'

describe('legacy Google Places backup mapper', () => {
  it('falls back on quota, gateway 400s, and upstream failures', () => {
    expect(shouldFallbackFromPrimary(429)).toBe(true)
    expect(shouldFallbackFromPrimary(503)).toBe(true)
    expect(shouldFallbackFromPrimary(401)).toBe(true)
    expect(shouldFallbackFromPrimary(400)).toBe(true)
    expect(shouldFallbackFromPrimary(404)).toBe(false)
    expect(shouldFallbackFromPrimary(200)).toBe(false)
  })

  it('maps a Text Search payload into Places API (New) shape', () => {
    const mapped = mapLegacySearchToNew({
      status: 'OK',
      results: [
        {
          place_id: 'ChIJ-test-place',
          name: 'Tour Eiffel',
          formatted_address: 'Av. Gustave Eiffel, 75007 Paris, France',
          geometry: { location: { lat: 48.85837, lng: 2.294481 } },
          rating: 4.7,
          user_ratings_total: 492536,
          price_level: 2,
        },
      ],
    })

    expect(mapped.places).toHaveLength(1)
    expect(mapped.places[0]).toMatchObject({
      id: 'ChIJ-test-place',
      displayName: { text: 'Tour Eiffel', languageCode: 'fr' },
      formattedAddress: 'Av. Gustave Eiffel, 75007 Paris, France',
      location: { latitude: 48.85837, longitude: 2.294481 },
      rating: 4.7,
      userRatingCount: 492536,
      priceLevel: 'PRICE_LEVEL_MODERATE',
      photos: [],
    })
  })

  it('maps Place Details reviews, hours, and website without photo references', () => {
    const place = mapLegacyDetailsToNew({
      status: 'OK',
      result: {
        place_id: 'ChIJ-test-place',
        name: 'Café de Flore',
        formatted_address: '172 Bd Saint-Germain, 75006 Paris',
        formatted_phone_number: '01 45 48 55 26',
        website: 'https://cafedeflore.fr/',
        opening_hours: { weekday_text: ['lundi: 07:30–01:30'] },
        editorial_summary: { overview: 'Café historique.' },
        reviews: [
          {
            text: 'Magnifique.',
            rating: 5,
            author_name: 'Camille',
            relative_time_description: 'il y a un mois',
          },
        ],
        photos: [{ photo_reference: 'should-not-be-used' }],
      },
    })

    expect(place).toMatchObject({
      id: 'ChIJ-test-place',
      websiteUri: 'https://cafedeflore.fr/',
      nationalPhoneNumber: '01 45 48 55 26',
      regularOpeningHours: { weekdayDescriptions: ['lundi: 07:30–01:30'] },
      editorialSummary: { text: 'Café historique.' },
      photos: [],
    })
    expect(place?.reviews).toEqual([
      {
        text: { text: 'Magnifique.' },
        rating: 5,
        relativePublishTimeDescription: 'il y a un mois',
        authorAttribution: { displayName: 'Camille' },
      },
    ])
  })

  it('builds legacy RapidAPI paths and maps Google status codes', () => {
    expect(
      legacyTextSearchPath({
        textQuery: 'Tour Eiffel Paris',
        languageCode: 'fr',
        regionCode: 'FR',
        location: { latitude: 48.85, longitude: 2.29 },
        radiusMeters: 8000,
      }),
    ).toBe(
      'maps/api/place/textsearch/json?query=Tour+Eiffel+Paris&language=fr&region=fr&location=48.85%2C2.29&radius=8000',
    )
    expect(legacyDetailsPath('ChIJ123', 'fr')).toContain('place_id=ChIJ123')
    expect(legacyDetailsPath('ChIJ123', 'fr')).not.toContain('photo')
    expect(mapLegacyStatusToHttp('ZERO_RESULTS')).toBe(200)
    expect(mapLegacyStatusToHttp('OVER_QUERY_LIMIT')).toBe(429)
    expect(mapLegacyPriceLevel(1)).toBe('PRICE_LEVEL_INEXPENSIVE')
  })
})
