import { authFetch } from '../../auth/services/authFetch'
import {
  buildMapRouteKey,
  cacheMapRoute,
  getCachedMapRoute,
  type MapRouteCacheEntry,
  type MapRoutePoint,
  type MapRouteProfile,
} from './mapRouteCache'

const inflightRoutes = new Map<string, Promise<MapRouteCacheEntry>>()

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
    ? value.geometry.coordinates.filter(
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

export async function getOrFetchMapRoute(
  points: readonly MapRoutePoint[],
  profile: MapRouteProfile,
): Promise<{ route: MapRouteCacheEntry; fromCache: boolean }> {
  const key = buildMapRouteKey(profile, points)
  const cached = getCachedMapRoute(key)
  if (cached) return { route: cached, fromCache: true }

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
