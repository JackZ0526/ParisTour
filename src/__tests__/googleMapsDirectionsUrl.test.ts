import { describe, expect, it } from 'vitest'
import {
  googleMapsDirectionsUrl,
  inferGoogleMapsTravelMode,
} from '../features/map/services/googleMapsDirectionsUrl'

describe('Google Maps direction links', () => {
  it('prefills endpoints, place IDs and travel mode without an API key', () => {
    const result = new URL(
      googleMapsDirectionsUrl({
        origin: { lat: 48.85837, lng: 2.294481, placeId: 'origin-id' },
        destination: { lat: 48.8606, lng: 2.3376, placeId: 'destination-id' },
        travelMode: 'transit',
      }),
    )

    expect(result.origin).toBe('https://www.google.com')
    expect(result.pathname).toBe('/maps/dir/')
    expect(Object.fromEntries(result.searchParams)).toMatchObject({
      api: '1',
      origin: '48.85837,2.294481',
      destination: '48.8606,2.3376',
      origin_place_id: 'origin-id',
      destination_place_id: 'destination-id',
      travelmode: 'transit',
      dir_action: 'navigate',
    })
    expect(result.searchParams.has('key')).toBe(false)
  })

  it('prefers explicit transit copy over a generic walking-level hint', () => {
    expect(inferGoogleMapsTravelMode('地铁 8 号线', 'short')).toBe('transit')
    expect(inferGoogleMapsTravelMode('步行 8 分钟', 'short')).toBe('walking')
    expect(inferGoogleMapsTravelMode('出租车', 'minimal')).toBe('driving')
  })

  it('resolves generic hotel-return copy using the actual leg rather than always choosing transit', () => {
    const hotel = { lat: 48.87, lng: 2.3 }
    const nearby = { origin: { lat: 48.871, lng: 2.301 }, destination: hotel }
    const distant = { origin: { lat: 48.86, lng: 2.36 }, destination: hotel }
    for (const copy of ['地铁 / 步行回酒店', 'Metro or walk back to the hotel']) {
      expect(inferGoogleMapsTravelMode(copy, 'minimal', nearby)).toBe('walking')
      expect(inferGoogleMapsTravelMode(copy, 'minimal', distant)).toBe('transit')
    }
    expect(inferGoogleMapsTravelMode(undefined, 'short', nearby)).toBe('walking')
    expect(inferGoogleMapsTravelMode(undefined, 'minimal', distant)).toBe('transit')
  })

  it('preserves explicit travel choices and handles driving instead of treating taxis as transit', () => {
    const leg = { origin: { lat: 48.871, lng: 2.301 }, destination: { lat: 48.87, lng: 2.3 } }
    expect(inferGoogleMapsTravelMode('地铁 6 号线', 'short', leg)).toBe('transit')
    expect(inferGoogleMapsTravelMode('打车回酒店', 'minimal', leg)).toBe('driving')
    expect(inferGoogleMapsTravelMode('步行回酒店', 'short', leg)).toBe('walking')
    expect(inferGoogleMapsTravelMode(undefined, 'minimal', { ...leg, origin: { lat: 48.4, lng: 2.7 }, preferDriving: true })).toBe('driving')
    const url = new URL(googleMapsDirectionsUrl({ ...leg, travelMode: 'driving' }))
    expect(url.searchParams.get('travelmode')).toBe('driving')
  })

  it('does not infer a short walk from missing or invalid coordinates', () => {
    expect(inferGoogleMapsTravelMode(undefined, 'minimal', { origin: { lat: 0, lng: 0 }, destination: { lat: 0, lng: 0 } })).toBe('transit')
    expect(inferGoogleMapsTravelMode('地铁 / 步行', 'minimal', { origin: { lat: NaN, lng: 2 }, destination: { lat: 48, lng: 2 } })).toBe('transit')
  })

  it('uses the full hotel address to disambiguate the return destination without duplicating its city', () => {
    const destination = 'Hôtel Paris France 72 Rue de Turbigo, 75003 Paris, France'
    const url = new URL(googleMapsDirectionsUrl({ origin: { lat: 48.87, lng: 2.35 }, destination: { lat: 48.8677, lng: 2.3604, query: destination, city: 'Paris, France' }, travelMode: 'walking' }))
    expect(url.searchParams.get('destination')).toBe(destination)
  })

  it('uses Place IDs when valid and disambiguated names otherwise', () => {
    const result = new URL(
      googleMapsDirectionsUrl({
        origin: {
          lat: 48.86327,
          lng: 2.35269,
          query: 'Hôtel Georgette',
          city: 'Paris, France',
          placeId: 'ChIJhotel',
        },
        destination: {
          lat: 48.86327,
          lng: 2.35269,
          query: 'The Broken Arm',
          city: 'Paris, France',
          placeId: 'llm:cafe:123',
        },
        travelMode: 'walking',
      }),
    )

    expect(result.searchParams.get('origin')).toBe('48.86327,2.35269')
    expect(result.searchParams.get('destination')).toBe(
      'The Broken Arm, Paris, France',
    )
    expect(result.searchParams.get('origin_place_id')).toBe('ChIJhotel')
    expect(result.searchParams.has('destination_place_id')).toBe(false)
  })
})
