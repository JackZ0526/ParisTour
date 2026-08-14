import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildMapRouteKey,
  buildMapRouteSegmentKey,
  buildMapRouteSegmentReactKey,
  cacheMapRoute,
  cacheMapRouteSegments,
  getCachedMapRoute,
  getCachedMapRouteSegment,
  loadMapRouteCache,
  preferredMapRouteProfile,
  sanitizeMapRouteCache,
  type MapRouteCacheEntry,
  type MapRouteSegmentEntry,
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

describe('map route cache', () => {
  it('uses the travel profile and rounded ordered coordinates as its key', () => {
    expect(
      buildMapRouteKey('foot-walking', [
        { lat: 48.8566123, lng: 2.3522219 },
        { lat: 48.860611, lng: 2.337644 },
      ]),
    ).toBe('foot-walking|48.85661,2.35222|48.86061,2.33764')
  })

  it('keys segments with profile and ordered from/to coordinates (direction preserved)', () => {
    const from = { lat: 48.8566, lng: 2.3522 }
    const to = { lat: 48.8606, lng: 2.3376 }
    expect(buildMapRouteSegmentKey('foot-walking', from, to)).toBe(
      'foot-walking|48.85660,2.35220->48.86060,2.33760',
    )
    expect(buildMapRouteSegmentKey('foot-walking', to, from)).toBe(
      'foot-walking|48.86060,2.33760->48.85660,2.35220',
    )
    expect(
      buildMapRouteSegmentKey('foot-walking', from, to),
    ).not.toBe(buildMapRouteSegmentKey('foot-walking', to, from))
  })

  it('builds a stable React key from profile and stop ids', () => {
    expect(buildMapRouteSegmentReactKey('foot-walking', 'A', 'B')).toBe(
      'foot-walking|A->B',
    )
  })

  it('uses a road profile when one transfer is longer than eight kilometres', () => {
    expect(
      preferredMapRouteProfile([
        { lat: 48.8566, lng: 2.3522 },
        { lat: 48.8606, lng: 2.3376 },
      ]),
    ).toBe('foot-walking')
    expect(
      preferredMapRouteProfile([
        { lat: 48.8566, lng: 2.3522 },
        { lat: 49.0097, lng: 2.5479 },
      ]),
    ).toBe('driving-car')
  })

  it('persists a valid route and rejects malformed cloud entries', () => {
    const route: MapRouteCacheEntry = {
      key: 'foot-walking|a|b',
      profile: 'foot-walking',
      geometry: {
        type: 'LineString',
        coordinates: [
          [2.35, 48.85],
          [2.36, 48.86],
        ],
      },
      distanceMeters: 1200,
      durationSeconds: 900,
      updatedAt: 123,
    }
    cacheMapRoute(route)
    expect(getCachedMapRoute(route.key)).toEqual(route)
    expect(loadMapRouteCache()).toEqual({ [route.key]: route })
    expect(sanitizeMapRouteCache({ broken: { geometry: null } })).toEqual({})
  })

  it('stores and retrieves segment entries with from/to identity', () => {
    const entry: MapRouteSegmentEntry = {
      key: 'foot-walking|48.85000,2.35000->48.86000,2.34000',
      profile: 'foot-walking',
      geometry: {
        type: 'LineString',
        coordinates: [
          [2.35, 48.85],
          [2.36, 48.86],
        ],
      },
      distanceMeters: 1200,
      durationSeconds: 900,
      updatedAt: 1,
      fromId: 'hotel-1',
      toId: 'museum-1',
      from: { lat: 48.85, lng: 2.35 },
      to: { lat: 48.86, lng: 2.36 },
    }
    cacheMapRouteSegments([entry])
    expect(getCachedMapRouteSegment(entry.key)).toEqual(entry)
  })
})

