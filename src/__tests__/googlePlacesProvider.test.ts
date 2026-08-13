import { afterEach, describe, expect, it } from 'vitest'
import {
  getGooglePlacesProvider,
  getOfficialGooglePlacesApiKey,
  officialPlacesUrl,
} from '../../api/_lib/googlePlacesProvider'

const KEYS = [
  'GOOGLE_PLACES_PROVIDER',
  'GOOGLE_PLACES_API_KEY',
  'GOOGLE_MAPS_SERVER_API_KEY',
] as const

const original = Object.fromEntries(
  KEYS.map((key) => [key, process.env[key]]),
) as Record<(typeof KEYS)[number], string | undefined>

afterEach(() => {
  for (const key of KEYS) {
    if (original[key] == null) delete process.env[key]
    else process.env[key] = original[key]
  }
})

describe('Google Places provider switch', () => {
  it('defaults to RapidAPI so the previous implementation stays reachable', () => {
    delete process.env.GOOGLE_PLACES_PROVIDER
    expect(getGooglePlacesProvider()).toBe('rapidapi')
  })

  it('switches to the official Places API (New) with one env var', () => {
    process.env.GOOGLE_PLACES_PROVIDER = 'official'
    expect(getGooglePlacesProvider()).toBe('official')
    expect(officialPlacesUrl('v1/places:searchText', '')).toBe(
      'https://places.googleapis.com/v1/places:searchText',
    )
    expect(
      officialPlacesUrl('v1/places/ChIJ123', '?languageCode=fr&regionCode=FR'),
    ).toBe(
      'https://places.googleapis.com/v1/places/ChIJ123?languageCode=fr&regionCode=FR',
    )
  })

  it('reads the server Places key and ignores an empty value', () => {
    process.env.GOOGLE_PLACES_API_KEY = ' server-places-key '
    expect(getOfficialGooglePlacesApiKey()).toBe('server-places-key')
  })
})
