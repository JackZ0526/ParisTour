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
    expect(inferGoogleMapsTravelMode('出租车', 'minimal')).toBe('transit')
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
