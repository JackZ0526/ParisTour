import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DayPlan, Place, SelectedHotel } from '../types'
import {
  buildDayMapRouteRequest,
  buildDayMapRouteSegments,
} from '../features/map/services/mapDayRoute'
import { CDG_LOCATION } from '../features/itinerary/utils/dayOrigin'
import {
  buildMapRouteSegmentKey,
  cacheMapRouteSegments,
  getCachedMapRouteSegment,
} from '../features/map/services/mapRouteCache'

const storage = new Map<string, string>()

beforeEach(() => {
  storage.clear()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  })
})

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

describe('day map route segments', () => {
  it('splits an itinerary into per-leg segments with stable ids and a day profile', () => {
    const request = buildDayMapRouteSegments(day(2, ['first', 'second']), hotel, {
      first: place('first', 48.871, 2.301),
      second: place('second', 48.872, 2.302),
    })

    expect(request.segments).toHaveLength(2)
    expect(request.profile).toBe('foot-walking')
    expect(request.segments[0]).toMatchObject({
      fromId: hotel.id,
      toId: 'first',
    })
    expect(request.segments[1]).toMatchObject({
      fromId: 'first',
      toId: 'second',
    })
    expect(request.fingerprint.split('||')).toHaveLength(2)
    expect(request.endpoints.map((endpoint) => endpoint.id)).toEqual([
      hotel.id,
      'first',
      'second',
    ])
  })

  it('uses CDG as the first endpoint on day 1 and flips to driving', () => {
    const request = buildDayMapRouteSegments(day(1, ['near-hotel']), hotel, {
      'near-hotel': place('near-hotel', 48.871, 2.301),
    })

    expect(request.endpoints[0].point).toEqual(CDG_LOCATION)
    expect(request.profile).toBe('driving-car')
    expect(request.segments[0].fromId).toBe('attr-cdg')
  })

  it('produces a stable React key independent of rounded coordinates', () => {
    const request = buildDayMapRouteSegments(day(2, ['first']), hotel, {
      first: place('first', 48.871, 2.301),
    })
    expect(request.segments[0].reactKey).toBe('foot-walking|hotel-test->first')
  })

  it('uses the same cacheKey the segment store writes under, so TripMap priming hits', () => {
    const request = buildDayMapRouteSegments(day(2, ['first', 'second']), hotel, {
      first: place('first', 48.871, 2.301),
      second: place('second', 48.872, 2.302),
    })
    const first = request.segments[0]
    const second = request.segments[1]
    expect(first.cacheKey).toBe(
      buildMapRouteSegmentKey('foot-walking', first.from, first.to),
    )
    expect(second.cacheKey).toBe(
      buildMapRouteSegmentKey('foot-walking', second.from, second.to),
    )

    // Round-trip: cache an entry under the segment's cacheKey, then read it
    // back through the same key. This is the lookup TripMap performs during
    // its synchronous priming step.
    cacheMapRouteSegments([
      {
        key: first.cacheKey,
        profile: 'foot-walking',
        geometry: {
          type: 'LineString',
          coordinates: [
            [first.from.lng, first.from.lat],
            [first.to.lng, first.to.lat],
          ],
        },
        distanceMeters: 1,
        durationSeconds: 1,
        updatedAt: 0,
        fromId: first.fromId,
        toId: first.toId,
        from: first.from,
        to: first.to,
      },
    ])
    expect(getCachedMapRouteSegment(first.cacheKey)?.fromId).toBe(
      first.fromId,
    )
  })
})

