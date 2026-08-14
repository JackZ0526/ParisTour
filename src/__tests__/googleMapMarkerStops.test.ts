import { describe, expect, it } from 'vitest'
import { visibleMapStops } from '../features/map/services/googleMapMarkerStops'
import type { DayOrigin } from '../features/itinerary/utils/dayOrigin'

const airportOrigin: DayOrigin = {
  id: 'airport-origin',
  kind: 'airport',
  label: 'Airport',
  lat: 49.0097,
  lng: 2.5479,
}

const hotelOrigin: DayOrigin = {
  id: 'hotel-origin',
  kind: 'hotel',
  label: 'Hotel',
  lat: 48.8687,
  lng: 2.2979,
}

const hotelStop = {
  id: 'hotel-selected',
  type: 'hotel' as const,
  name: 'Hotel',
  location: { lat: 48.8687, lng: 2.2979 },
}

describe('visibleMapStops', () => {
  it('renders one marker for repeated hotel stops on arrival day', () => {
    const result = visibleMapStops(
      [hotelStop, { ...hotelStop, id: 'hotel-return' }],
      airportOrigin,
    )

    expect(result.map(({ index }) => index)).toEqual([0])
  })

  it('does not stack a hotel stop on a hotel origin marker', () => {
    expect(visibleMapStops([hotelStop], hotelOrigin)).toEqual([])
  })

  it('preserves ordinary stops and their original indexes', () => {
    const coffee = {
      id: 'coffee',
      type: 'cafe' as const,
      name: 'Coffee',
      location: { lat: 48.8672, lng: 2.3027 },
    }

    expect(visibleMapStops([hotelStop, coffee, hotelStop], airportOrigin)).toEqual([
      { place: hotelStop, index: 0 },
      { place: coffee, index: 1 },
    ])
  })
})
