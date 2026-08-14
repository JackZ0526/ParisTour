import { describe, expect, it } from 'vitest'
import type { DayPlan, Place, SelectedHotel } from '../types'
import { buildDayMapRouteRequest } from '../features/map/services/mapDayRoute'
import { CDG_LOCATION } from '../features/itinerary/utils/dayOrigin'

const hotel: SelectedHotel = {
  id: 'hotel-test',
  name: 'Test Hôtel',
  address: 'Paris',
  lat: 48.87,
  lng: 2.3,
  nearestMetro: '',
  areaKey: 'custom',
  source: 'custom',
}

function day(dayNumber: number, placeIds: string[]): DayPlan {
  return {
    day: dayNumber,
    title: 'Test day',
    theme: '',
    pace: '轻松',
    summary: '',
    metroHintFromArea: {},
    stops: placeIds.map((placeId, index) => ({
      id: `stop-${index}`,
      time: '10:00',
      placeId,
      note: '',
    })),
  }
}

function place(id: string, lat: number, lng: number): Place {
  return {
    id,
    name: id,
    type: 'attraction',
    description: '',
    ratingHint: '',
    image: '',
    location: { lat, lng },
    googleMapsUrl: '',
  }
}

describe('day map route request', () => {
  it('uses CDG as day-one origin and chooses driving for the long transfer', () => {
    const request = buildDayMapRouteRequest(day(1, ['near-hotel']), hotel, {
      'near-hotel': place('near-hotel', 48.871, 2.301),
    })

    expect(request.points[0]).toEqual(CDG_LOCATION)
    expect(request.profile).toBe('driving-car')
    expect(request.key).toContain('driving-car|49.00970,2.54790')
  })

  it('uses the hotel as later-day origin and preserves itinerary order', () => {
    const request = buildDayMapRouteRequest(day(2, ['first', 'second']), hotel, {
      first: place('first', 48.871, 2.301),
      second: place('second', 48.872, 2.302),
    })

    expect(request.points).toEqual([
      { lat: hotel.lat, lng: hotel.lng },
      { lat: 48.871, lng: 2.301 },
      { lat: 48.872, lng: 2.302 },
    ])
    expect(request.profile).toBe('foot-walking')
  })
})
