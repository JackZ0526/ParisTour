import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildMapRouteSegmentKey,
  cacheMapRouteSegments,
  clearMapRouteCache,
  getCachedMapRouteSegment,
  type MapRoutePoint,
  type MapRouteSegmentEntry,
} from '../features/map/services/mapRouteCache'
import {
  getOrFetchMapRouteSegments,
  splitPolylineByWaypoints,
  splitTotalsByPolylineLength,
  type MapRouteSegmentRequest,
} from '../features/map/services/openRouteService'

const storage = new Map<string, string>()

beforeEach(() => {
  storage.clear()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  })
  clearMapRouteCache()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function makeResponse(
  payload: unknown,
  status = 200,
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('splitPolylineByWaypoints', () => {
  it('returns one sub-polyline per waypoint pair, ordered by index', () => {
    const polyline: [number, number][] = [
      [2.3, 48.8],
      [2.32, 48.81],
      [2.35, 48.82],
      [2.4, 48.83],
    ]
    const split = splitPolylineByWaypoints(polyline, [
      { lat: 48.8, lng: 2.3 },
      { lat: 48.81, lng: 2.32 },
      { lat: 48.83, lng: 2.4 },
    ])
    expect(split).toHaveLength(2)
    expect(split[0][0]).toEqual([2.3, 48.8])
    expect(split[0][split[0].length - 1]).toEqual([2.32, 48.81])
    expect(split[1][0]).toEqual([2.32, 48.81])
    expect(split[1][split[1].length - 1]).toEqual([2.4, 48.83])
  })

  it('avoids reverse-searching the polyline by walking forward only', () => {
    const polyline: [number, number][] = [
      [2.3, 48.8],
      [2.31, 48.81],
      [2.32, 48.82],
      [2.33, 48.83],
    ]
    const split = splitPolylineByWaypoints(polyline, [
      { lat: 48.82, lng: 2.32 },
      { lat: 48.8, lng: 2.3 },
    ])
    expect(split[0][0]).toEqual([2.32, 48.82])
    expect(split[0][split[0].length - 1]).toEqual([2.33, 48.83])
  })

  it('returns at least two coordinates per leg when waypoints collapse onto one point', () => {
    const polyline: [number, number][] = [
      [2.3, 48.8],
      [2.31, 48.81],
    ]
    const split = splitPolylineByWaypoints(polyline, [
      { lat: 48.8, lng: 2.3 },
      { lat: 48.8, lng: 2.3 },
    ])
    expect(split).toHaveLength(1)
    expect(split[0]).toHaveLength(2)
  })
})

describe('splitTotalsByPolylineLength', () => {
  it('distributes totals proportionally to the geodesic length of each leg', () => {
    const totals = splitTotalsByPolylineLength(
      1500,
      1800,
      [
        [
          [2.3, 48.8],
          [2.31, 48.81],
        ],
        [
          [2.31, 48.81],
          [2.32, 48.82],
          [2.33, 48.83],
        ],
      ],
    )
    expect(totals).toHaveLength(2)
    expect(totals[0].distanceMeters + totals[1].distanceMeters).toBeCloseTo(
      1500,
      5,
    )
    expect(totals[0].durationSeconds + totals[1].durationSeconds).toBeCloseTo(
      1800,
      5,
    )
    expect(totals[1].distanceMeters).toBeGreaterThan(totals[0].distanceMeters)
  })

  it('falls back to an even split when every leg is zero length', () => {
    const totals = splitTotalsByPolylineLength(
      1000,
      500,
      [
        [
          [2.3, 48.8],
          [2.3, 48.8],
        ],
        [
          [2.4, 48.9],
          [2.4, 48.9],
        ],
      ],
    )
    expect(totals[0].distanceMeters).toBe(500)
    expect(totals[1].distanceMeters).toBe(500)
  })
})

describe('getOrFetchMapRouteSegments', () => {
  const profile = 'foot-walking' as const
  const a: MapRoutePoint = { lat: 48.85, lng: 2.35 }
  const b: MapRoutePoint = { lat: 48.86, lng: 2.36 }
  const c: MapRoutePoint = { lat: 48.87, lng: 2.37 }

  function segments(): MapRouteSegmentRequest[] {
    return [
      { fromId: 'A', toId: 'B', from: a, to: b },
      { fromId: 'B', toId: 'C', from: b, to: c },
    ]
  }

  it('returns zero network calls when every segment is already cached', async () => {
    const cached: MapRouteSegmentEntry[] = [
      {
        key: buildMapRouteSegmentKey(profile, a, b),
        profile,
        geometry: {
          type: 'LineString',
          coordinates: [[2.35, 48.85], [2.36, 48.86]],
        },
        distanceMeters: 1000,
        durationSeconds: 800,
        updatedAt: 1,
        fromId: 'A',
        toId: 'B',
        from: a,
        to: b,
      },
      {
        key: buildMapRouteSegmentKey(profile, b, c),
        profile,
        geometry: {
          type: 'LineString',
          coordinates: [[2.36, 48.86], [2.37, 48.87]],
        },
        distanceMeters: 1500,
        durationSeconds: 1200,
        updatedAt: 1,
        fromId: 'B',
        toId: 'C',
        from: b,
        to: c,
      },
    ]
    cacheMapRouteSegments(cached)
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const result = await getOrFetchMapRouteSegments(profile, segments())

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(result.fetchedFromNetwork).toBe(false)
    expect(result.segments).toHaveLength(2)
    expect(result.segments[0]?.fromId).toBe('A')
    expect(result.segments[1]?.toId).toBe('C')
  })

  it('batches consecutive missing segments into a single ORS request', async () => {
    const fetchSpy = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        makeResponse({
          geometry: {
            type: 'LineString',
            coordinates: [
              [2.35, 48.85],
              [2.355, 48.855],
              [2.36, 48.86],
              [2.365, 48.865],
              [2.37, 48.87],
            ],
          },
          distanceMeters: 3000,
          durationSeconds: 2400,
        }),
      )
    vi.stubGlobal('fetch', fetchSpy)

    const result = await getOrFetchMapRouteSegments(profile, segments())

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(result.fetchedFromNetwork).toBe(true)
    expect(result.segments).toHaveLength(2)
    // Both legs should be cached after a single batched request.
    expect(
      getCachedMapRouteSegment(buildMapRouteSegmentKey(profile, a, b))?.fromId,
    ).toBe('A')
    expect(
      getCachedMapRouteSegment(buildMapRouteSegmentKey(profile, b, c))?.toId,
    ).toBe('C')
    // Totals should sum back to the response.
    const totalDistance = result.segments.reduce(
      (sum, entry) => sum + (entry?.distanceMeters ?? 0),
      0,
    )
    expect(totalDistance).toBeCloseTo(3000, 5)
  })

  it('sends one request per disconnected missing run (e.g. A→B missing, B→C cached)', async () => {
    // Cache only the middle leg so A→B needs fetching, B→C comes from cache.
    cacheMapRouteSegments([
      {
        key: buildMapRouteSegmentKey(profile, b, c),
        profile,
        geometry: {
          type: 'LineString',
          coordinates: [[2.36, 48.86], [2.37, 48.87]],
        },
        distanceMeters: 1500,
        durationSeconds: 1200,
        updatedAt: 1,
        fromId: 'B',
        toId: 'C',
        from: b,
        to: c,
      },
    ])
    const fetchSpy = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        makeResponse({
          geometry: {
            type: 'LineString',
            coordinates: [[2.35, 48.85], [2.36, 48.86]],
          },
          distanceMeters: 1200,
          durationSeconds: 960,
        }),
      )
    vi.stubGlobal('fetch', fetchSpy)

    const result = await getOrFetchMapRouteSegments(profile, segments())

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(result.fetchedFromNetwork).toBe(true)
    expect(result.segments[0]?.fromId).toBe('A')
    expect(result.segments[1]?.toId).toBe('C')
  })

  it('batches each disconnected missing run into its own request', async () => {
    // Four-segment day A→B→C→D with the middle pair already cached, so we
    // need two runs: A→B and C→D.
    const d: MapRoutePoint = { lat: 48.88, lng: 2.38 }
    cacheMapRouteSegments([
      {
        key: buildMapRouteSegmentKey(profile, b, c),
        profile,
        geometry: {
          type: 'LineString',
          coordinates: [[2.36, 48.86], [2.37, 48.87]],
        },
        distanceMeters: 1500,
        durationSeconds: 1200,
        updatedAt: 1,
        fromId: 'B',
        toId: 'C',
        from: b,
        to: c,
      },
    ])
    const fetchSpy = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        makeResponse({
          geometry: {
            type: 'LineString',
            coordinates: [[2.35, 48.85], [2.36, 48.86]],
          },
          distanceMeters: 1200,
          durationSeconds: 960,
        }),
      )
      .mockResolvedValueOnce(
        makeResponse({
          geometry: {
            type: 'LineString',
            coordinates: [[2.37, 48.87], [2.38, 48.88]],
          },
          distanceMeters: 1300,
          durationSeconds: 1040,
        }),
      )
    vi.stubGlobal('fetch', fetchSpy)

    const result = await getOrFetchMapRouteSegments(profile, [
      { fromId: 'A', toId: 'B', from: a, to: b },
      { fromId: 'B', toId: 'C', from: b, to: c },
      { fromId: 'C', toId: 'D', from: c, to: d },
    ])

    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(result.segments.map((s) => `${s?.fromId}->${s?.toId}`)).toEqual([
      'A->B',
      'B->C',
      'C->D',
    ])
  })
})
