export type MapRouteProfile = 'foot-walking' | 'driving-car'

export interface MapRoutePoint {
  lat: number
  lng: number
}

export interface MapRouteGeometry {
  type: 'LineString'
  coordinates: [number, number][]
}

export interface MapRouteCacheEntry {
  key: string
  profile: MapRouteProfile
  geometry: MapRouteGeometry
  distanceMeters: number
  durationSeconds: number
  updatedAt: number
}

export type MapRouteCacheMap = Record<string, MapRouteCacheEntry>

/** Identity for a single leg between two consecutive stops (direction preserved). */
export interface MapRouteSegmentEndpoint {
  /** Stable stop id: place id for itinerary stops, origin id for the day origin. */
  id: string
  point: MapRoutePoint
}

export interface MapRouteSegmentEntry extends MapRouteCacheEntry {
  fromId: string
  toId: string
  from: MapRoutePoint
  to: MapRoutePoint
}

/** Stable React key for a segment: profile + ordered stop ids. */
export function buildMapRouteSegmentReactKey(
  profile: MapRouteProfile,
  fromId: string,
  toId: string,
): string {
  return `${profile}|${fromId}->${toId}`
}

const STORAGE_KEY = 'paris-tour-map-routes-v1'
const MAX_CACHE_ENTRIES = 60

function isFinitePoint(point: unknown): point is [number, number] {
  return (
    Array.isArray(point) &&
    point.length >= 2 &&
    Number.isFinite(point[0]) &&
    Number.isFinite(point[1])
  )
}

function validEntry(value: unknown): value is MapRouteCacheEntry {
  if (!value || typeof value !== 'object') return false
  const entry = value as Partial<MapRouteCacheEntry>
  return (
    typeof entry.key === 'string' &&
    (entry.profile === 'foot-walking' || entry.profile === 'driving-car') &&
    entry.geometry?.type === 'LineString' &&
    Array.isArray(entry.geometry.coordinates) &&
    entry.geometry.coordinates.length >= 2 &&
    entry.geometry.coordinates.every(isFinitePoint) &&
    Number.isFinite(entry.distanceMeters) &&
    Number.isFinite(entry.durationSeconds) &&
    Number.isFinite(entry.updatedAt)
  )
}

function validSegmentEntry(value: unknown): value is MapRouteSegmentEntry {
  if (!validEntry(value)) return false
  const entry = value as Partial<MapRouteSegmentEntry>
  return (
    typeof entry.fromId === 'string' &&
    typeof entry.toId === 'string' &&
    !!entry.from &&
    !!entry.to &&
    Number.isFinite(entry.from.lat) &&
    Number.isFinite(entry.from.lng) &&
    Number.isFinite(entry.to.lat) &&
    Number.isFinite(entry.to.lng)
  )
}

export function sanitizeMapRouteCache(value: unknown): MapRouteCacheMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const entries = Object.entries(value)
    .filter(([, entry]) => validEntry(entry))
    .sort(([, first], [, second]) => second.updatedAt - first.updatedAt)
    .slice(0, MAX_CACHE_ENTRIES)
  return Object.fromEntries(entries)
}

function isSegmentCacheEntry(value: unknown): value is MapRouteSegmentEntry {
  return validSegmentEntry(value)
}

export function loadMapRouteCache(): MapRouteCacheMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? sanitizeMapRouteCache(JSON.parse(raw)) : {}
  } catch {
    return {}
  }
}

export function saveMapRouteCache(cache: MapRouteCacheMap): void {
  const clean = sanitizeMapRouteCache(cache)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clean))
  } catch {
    /* Route display can continue from React state when storage is unavailable. */
  }
}

export function getCachedMapRoute(key: string): MapRouteCacheEntry | null {
  return loadMapRouteCache()[key] || null
}

export function cacheMapRoute(entry: MapRouteCacheEntry): void {
  saveMapRouteCache({ ...loadMapRouteCache(), [entry.key]: entry })
}

export function clearMapRouteCache(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

export function buildMapRouteKey(
  profile: MapRouteProfile,
  points: readonly MapRoutePoint[],
): string {
  return `${profile}|${points
    .map((point) => `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`)
    .join('|')}`
}

function formatSegmentPoint(point: MapRoutePoint): string {
  return `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`
}

/**
 * Cache key for a single leg between two consecutive stops. Direction is
 * preserved because the road network is directed for one-ways and turn
 * restrictions — A→B and B→A can return different geometries.
 */
export function buildMapRouteSegmentKey(
  profile: MapRouteProfile,
  from: MapRoutePoint,
  to: MapRoutePoint,
): string {
  return `${profile}|${formatSegmentPoint(from)}->${formatSegmentPoint(to)}`
}

/** A segment is "stale" when its from/to coordinates don't match the request. */
export function isSegmentEntryFresh(
  entry: MapRouteSegmentEntry,
  from: MapRoutePoint,
  to: MapRoutePoint,
): boolean {
  return (
    entry.from.lat === from.lat &&
    entry.from.lng === from.lng &&
    entry.to.lat === to.lat &&
    entry.to.lng === to.lng
  )
}

export function getCachedMapRouteSegment(
  key: string,
): MapRouteSegmentEntry | null {
  const value = loadMapRouteCache()[key]
  return value && isSegmentCacheEntry(value) ? value : null
}

export function cacheMapRouteSegments(entries: readonly MapRouteSegmentEntry[]): void {
  if (entries.length === 0) return
  const cache = loadMapRouteCache()
  for (const entry of entries) {
    cache[entry.key] = entry
  }
  saveMapRouteCache(cache)
}

function distanceMeters(first: MapRoutePoint, second: MapRoutePoint): number {
  const radius = 6_371_000
  const toRadians = (value: number) => (value * Math.PI) / 180
  const dLat = toRadians(second.lat - first.lat)
  const dLng = toRadians(second.lng - first.lng)
  const lat1 = toRadians(first.lat)
  const lat2 = toRadians(second.lat)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * radius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** Use walking for compact city days and roads suitable for cars on long transfers. */
export function preferredMapRouteProfile(
  points: readonly MapRoutePoint[],
): MapRouteProfile {
  for (let index = 1; index < points.length; index += 1) {
    if (distanceMeters(points[index - 1], points[index]) > 8_000) {
      return 'driving-car'
    }
  }
  return 'foot-walking'
}
