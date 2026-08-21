import { authFetch } from '../../auth/services/authFetch'
import {
  buildMapRouteKey,
  buildMapRouteSegmentKey,
  cacheMapRoute,
  cacheMapRouteSegments,
  getCachedMapRoute,
  getCachedMapRouteSegment,
  type MapRouteCacheEntry,
  type MapRoutePoint,
  type MapRouteProfile,
  type MapRouteSegmentEntry,
} from './mapRouteCache'

const inflightRoutes = new Map<string, Promise<MapRouteCacheEntry>>()
const inflightSegmentGroups = new Map<
  string,
  Promise<MapRouteSegmentEntry[]>
>()

let serviceDisabledUntil = 0
const CIRCUIT_BREAKER_COOLDOWN_MS = 10 * 60 * 1000 // 10 minutes

export function isOpenRouteServiceDisabled(): boolean {
  return Date.now() < serviceDisabledUntil
}

export function disableOpenRouteService(
  cooldownMs = CIRCUIT_BREAKER_COOLDOWN_MS,
): void {
  serviceDisabledUntil = Date.now() + cooldownMs
}

export function resetOpenRouteServiceCircuitBreaker(): void {
  serviceDisabledUntil = 0
}

interface RouteResponse {
  geometry?: { type?: unknown; coordinates?: unknown }
  distanceMeters?: unknown
  durationSeconds?: unknown
}

function parseRouteResponse(
  value: RouteResponse,
  key: string,
  profile: MapRouteProfile,
): MapRouteCacheEntry {
  const coordinates = Array.isArray(value.geometry?.coordinates)
    ? value.geometry?.coordinates.filter(
        (point): point is [number, number] =>
          Array.isArray(point) &&
          point.length >= 2 &&
          Number.isFinite(point[0]) &&
          Number.isFinite(point[1]),
      )
    : []
  if (value.geometry?.type !== 'LineString' || coordinates.length < 2) {
    throw new Error('道路路线服务没有返回有效路线。')
  }
  return {
    key,
    profile,
    geometry: { type: 'LineString', coordinates },
    distanceMeters: Number(value.distanceMeters) || 0,
    durationSeconds: Number(value.durationSeconds) || 0,
    updatedAt: Date.now(),
  }
}

export function buildFallbackStraightLineSegment(
  profile: MapRouteProfile,
  from: MapRoutePoint,
  to: MapRoutePoint,
  fromId: string,
  toId: string,
): MapRouteSegmentEntry {
  const distance = haversineMeters([from.lng, from.lat], [to.lng, to.lat])
  const speed = profile === 'driving-car' ? 10 : 1.2
  const duration = Math.round(distance / speed)
  return {
    key: buildMapRouteSegmentKey(profile, from, to),
    profile,
    geometry: {
      type: 'LineString',
      coordinates: [
        [from.lng, from.lat],
        [to.lng, to.lat],
      ],
    },
    distanceMeters: Math.round(distance),
    durationSeconds: duration,
    updatedAt: Date.now(),
    fromId,
    toId,
    from,
    to,
  }
}

export async function getOrFetchMapRoute(
  points: readonly MapRoutePoint[],
  profile: MapRouteProfile,
): Promise<{ route: MapRouteCacheEntry; fromCache: boolean }> {
  const key = buildMapRouteKey(profile, points)
  const cached = getCachedMapRoute(key)
  if (cached) return { route: cached, fromCache: true }

  if (isOpenRouteServiceDisabled()) {
    const coordinates = points.map((p) => [p.lng, p.lat] as [number, number])
    let totalDistance = 0
    for (let i = 0; i < points.length - 1; i += 1) {
      const p1 = points[i]
      const p2 = points[i + 1]
      if (p1 && p2) {
        totalDistance += haversineMeters([p1.lng, p1.lat], [p2.lng, p2.lat])
      }
    }
    const speed = profile === 'driving-car' ? 10 : 1.2
    const fallbackRoute: MapRouteCacheEntry = {
      key,
      profile,
      geometry: { type: 'LineString', coordinates },
      distanceMeters: Math.round(totalDistance),
      durationSeconds: Math.round(totalDistance / speed),
      updatedAt: Date.now(),
    }
    cacheMapRoute(fallbackRoute)
    return { route: fallbackRoute, fromCache: true }
  }

  const existing = inflightRoutes.get(key)
  // A StrictMode remount or a second consumer can share the same request. Treat
  // that as reused data so only the request owner schedules a cloud-cache save.
  if (existing) return { route: await existing, fromCache: true }

  const request = (async () => {
    const response = await authFetch('/api/openrouteservice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points, profile }),
    })
    const payload = (await response.json().catch(() => ({}))) as RouteResponse & {
      error?: string
    }
    if (!response.ok) {
      if (
        response.status === 503 ||
        response.status === 401 ||
        response.status === 403
      ) {
        disableOpenRouteService()
      }
      throw new Error(payload.error || `道路路线请求失败（HTTP ${response.status}）`)
    }
    const route = parseRouteResponse(payload, key, profile)
    cacheMapRoute(route)
    return route
  })()

  inflightRoutes.set(key, request)
  try {
    return { route: await request, fromCache: false }
  } finally {
    inflightRoutes.delete(key)
  }
}

export interface MapRouteSegmentRequest {
  fromId: string
  toId: string
  from: MapRoutePoint
  to: MapRoutePoint
}

export interface MapRouteSegmentsResult {
  segments: MapRouteSegmentEntry[]
  /** True if at least one segment came from a network round-trip. */
  fetchedFromNetwork: boolean
}

interface SegmentRun {
  start: number
  end: number
  inputs: MapRoutePoint[]
}

function collectRunInputs(
  segments: readonly MapRouteSegmentRequest[],
  start: number,
  end: number,
): MapRoutePoint[] {
  const slice = segments.slice(start, end)
  const inputs: MapRoutePoint[] = []
  for (let i = 0; i < slice.length; i += 1) {
    if (i === 0) inputs.push(slice[i].from)
    inputs.push(slice[i].to)
  }
  return inputs
}

function runGroupKey(profile: MapRouteProfile, runs: readonly SegmentRun[]): string {
  return runs
    .map(
      (run) =>
        `${profile}|${run.start}:${run.end}:${run.inputs
          .map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`)
          .join('|')}`,
    )
    .join(';')
}

function runGroupEntryKey(entry: MapRouteSegmentEntry): string {
  return `${entry.fromId}->${entry.toId}`
}

/**
 * Fetch and cache the per-leg routes for a day in segment form.
 *
 * Behaviour:
 * - Looks up every segment in the local cache first. Untouched edits cost
 *   zero network requests.
 * - Finds runs of consecutive missing segments and sends each run as a
 *   single ORS request, so adding X between B and C costs one request, not
 *   three.
 * - After the response arrives, splits the polyline between waypoints and
 *   stores every leg under its own key for future edits.
 * - Concurrent consumers with the same missing run share a single inflight
 *   promise via `inflightSegmentGroups`.
 */
export async function getOrFetchMapRouteSegments(
  profile: MapRouteProfile,
  segments: readonly MapRouteSegmentRequest[],
): Promise<MapRouteSegmentsResult> {
  if (segments.length === 0) {
    return { segments: [], fetchedFromNetwork: false }
  }

  const resolved: Array<MapRouteSegmentEntry | null> = new Array(segments.length).fill(null)
  const missingRuns: SegmentRun[] = []
  const missingByEntryKey = new Map<string, number>()

  let runStart = -1
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]
    const key = buildMapRouteSegmentKey(profile, segment.from, segment.to)
    const cached = getCachedMapRouteSegment(key)
    if (cached) {
      resolved[index] = cached
      if (runStart !== -1) {
        missingRuns.push({
          start: runStart,
          end: index,
          inputs: collectRunInputs(segments, runStart, index),
        })
        runStart = -1
      }
      continue
    }
    missingByEntryKey.set(`${segment.fromId}->${segment.toId}`, index)
    if (runStart === -1) runStart = index
  }
  if (runStart !== -1) {
    const end = segments.length
    missingRuns.push({
      start: runStart,
      end,
      inputs: collectRunInputs(segments, runStart, end),
    })
  }

  if (missingRuns.length === 0) {
    return { segments: resolved as MapRouteSegmentEntry[], fetchedFromNetwork: false }
  }

  // If service is disabled (e.g. 503 missing key), generate and cache straight-line fallbacks
  if (isOpenRouteServiceDisabled()) {
    const fallbackEntries: MapRouteSegmentEntry[] = []
    for (let index = 0; index < segments.length; index += 1) {
      if (resolved[index]) continue
      const target = segments[index]
      if (!target) continue
      const fallback = buildFallbackStraightLineSegment(
        profile,
        target.from,
        target.to,
        target.fromId,
        target.toId,
      )
      resolved[index] = fallback
      fallbackEntries.push(fallback)
    }
    if (fallbackEntries.length > 0) {
      cacheMapRouteSegments(fallbackEntries)
    }
    return {
      segments: resolved as MapRouteSegmentEntry[],
      fetchedFromNetwork: false,
    }
  }

  const groupKey = runGroupKey(profile, missingRuns)
  const work =
    inflightSegmentGroups.get(groupKey) ??
    startSegmentGroupWork(groupKey, profile, segments, missingRuns)

  try {
    const newSegments = await work
    for (const entry of newSegments) {
      const slot = missingByEntryKey.get(runGroupEntryKey(entry))
      if (slot !== undefined) resolved[slot] = entry
    }
    return {
      segments: resolved as MapRouteSegmentEntry[],
      fetchedFromNetwork: true,
    }
  } catch (error) {
    if (isOpenRouteServiceDisabled()) {
      const fallbackEntries: MapRouteSegmentEntry[] = []
      for (let index = 0; index < segments.length; index += 1) {
        if (resolved[index]) continue
        const target = segments[index]
        if (!target) continue
        const fallback = buildFallbackStraightLineSegment(
          profile,
          target.from,
          target.to,
          target.fromId,
          target.toId,
        )
        resolved[index] = fallback
        fallbackEntries.push(fallback)
      }
      if (fallbackEntries.length > 0) {
        cacheMapRouteSegments(fallbackEntries)
      }
      return {
        segments: resolved as MapRouteSegmentEntry[],
        fetchedFromNetwork: false,
      }
    }
    throw error
  }
}

function startSegmentGroupWork(
  groupKey: string,
  profile: MapRouteProfile,
  segments: readonly MapRouteSegmentRequest[],
  runs: readonly SegmentRun[],
): Promise<MapRouteSegmentEntry[]> {
  const work = (async () => {
    const newSegments: MapRouteSegmentEntry[] = []
    for (const run of runs) {
      const fetched = await fetchSegmentGroup(profile, run.inputs)
      const split = splitPolylineByWaypoints(
        fetched.geometry.coordinates,
        run.inputs,
      )
      const totals = splitTotalsByPolylineLength(
        fetched.distanceMeters,
        fetched.durationSeconds,
        split,
      )
      for (let i = 0; i < split.length; i += 1) {
        const targetIndex = run.start + i
        const target = segments[targetIndex]
        if (!target) continue
        newSegments.push({
          key: buildMapRouteSegmentKey(profile, target.from, target.to),
          profile,
          geometry: { type: 'LineString', coordinates: split[i] },
          distanceMeters: totals[i].distanceMeters,
          durationSeconds: totals[i].durationSeconds,
          updatedAt: Date.now(),
          fromId: target.fromId,
          toId: target.toId,
          from: target.from,
          to: target.to,
        })
      }
    }
    if (newSegments.length > 0) {
      cacheMapRouteSegments(newSegments)
    }
    return newSegments
  })()

  inflightSegmentGroups.set(groupKey, work)
  work
    .catch(() => {})
    .finally(() => {
      if (inflightSegmentGroups.get(groupKey) === work) {
        inflightSegmentGroups.delete(groupKey)
      }
    })
  return work
}

async function fetchSegmentGroup(
  profile: MapRouteProfile,
  inputs: readonly MapRoutePoint[],
): Promise<MapRouteCacheEntry> {
  const key = buildMapRouteKey(profile, inputs)
  const cached = getCachedMapRoute(key)
  if (cached) return cached

  const response = await authFetch('/api/openrouteservice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points: inputs, profile }),
  })
  const payload = (await response.json().catch(() => ({}))) as RouteResponse & {
    error?: string
  }
  if (!response.ok) {
    if (
      response.status === 503 ||
      response.status === 401 ||
      response.status === 403
    ) {
      disableOpenRouteService()
    }
    throw new Error(payload.error || `道路路线请求失败（HTTP ${response.status}）`)
  }
  return parseRouteResponse(payload, key, profile)
}

/** Great-circle distance between two [lng, lat] coordinates, in metres. */
function haversineMeters(
  first: readonly [number, number],
  second: readonly [number, number],
): number {
  const radius = 6_371_000
  const toRadians = (value: number) => (value * Math.PI) / 180
  const dLat = toRadians(second[1] - first[1])
  const dLng = toRadians(second[0] - first[0])
  const lat1 = toRadians(first[1])
  const lat2 = toRadians(second[1])
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * radius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * Split a single polyline into N-1 sub-polylines, one per waypoint pair.
 * For each waypoint we locate the closest coordinate on the polyline and
 * require the index to be monotonically non-decreasing so we never reverse
 * along a leg. Duplicate consecutive points duplicate the coordinate so
 * a sub-polyline still has at least 2 entries.
 */
export function splitPolylineByWaypoints(
  polyline: readonly (readonly [number, number])[],
  waypoints: readonly MapRoutePoint[],
): [number, number][][] {
  if (polyline.length < 2 || waypoints.length < 2) return []
  const indices: number[] = []
  let searchFrom = 0
  for (const waypoint of waypoints) {
    let bestIdx = searchFrom
    let bestDist = Number.POSITIVE_INFINITY
    for (let i = searchFrom; i < polyline.length; i += 1) {
      const dx = polyline[i][0] - waypoint.lng
      const dy = polyline[i][1] - waypoint.lat
      const d = dx * dx + dy * dy
      if (d < bestDist) {
        bestDist = d
        bestIdx = i
      }
    }
    indices.push(bestIdx)
    searchFrom = bestIdx
  }

  const segments: [number, number][][] = []
  for (let i = 0; i < indices.length - 1; i += 1) {
    let start = indices[i]
    let end = indices[i + 1]
    if (end < start) end = start
    if (start === end) {
      // Snap to the neighbour so each leg still has two coordinates.
      const dupStart = polyline[start]
      const dupEnd = polyline[Math.min(end + 1, polyline.length - 1)]
      segments.push([
        [dupStart[0], dupStart[1]],
        [dupEnd[0], dupEnd[1]],
      ])
      continue
    }
    const slice: [number, number][] = []
    for (let j = start; j <= end; j += 1) {
      const c = polyline[j]
      slice.push([c[0], c[1]])
    }
    segments.push(slice)
  }
  return segments
}

/**
 * Distribute the ORS total distance/duration across the sub-polylines by
 * their geodesic length. Walking and driving keep roughly constant speed
 * across a day, so proportional split is a much better estimate than
 * equal parts.
 */
export function splitTotalsByPolylineLength(
  totalDistance: number,
  totalDuration: number,
  segmentPolylines: readonly (readonly (readonly [number, number])[])[],
): { distanceMeters: number; durationSeconds: number }[] {
  if (segmentPolylines.length === 0) return []
  const lengths = segmentPolylines.map((polyline) => {
    let d = 0
    for (let i = 1; i < polyline.length; i += 1) {
      d += haversineMeters(polyline[i - 1], polyline[i])
    }
    return d
  })
  const sum = lengths.reduce((acc, value) => acc + value, 0)
  if (sum <= 0) {
    return segmentPolylines.map(() => ({
      distanceMeters: totalDistance / segmentPolylines.length,
      durationSeconds: totalDuration / segmentPolylines.length,
    }))
  }
  return lengths.map((length) => ({
    distanceMeters: (totalDistance * length) / sum,
    durationSeconds: (totalDuration * length) / sum,
  }))
}
