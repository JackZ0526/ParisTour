import { requireAllowlistedUser } from './_lib/auth.js'
import { methodNotAllowed, readEnv } from './_lib/proxy.js'

export const runtime = 'nodejs'
export const maxDuration = 30

type RouteProfile = 'foot-walking' | 'driving-car'

interface RoutePoint {
  lat: number
  lng: number
}

type RouteCoordinate = [number, number]

interface DirectionsPayload {
  features?: Array<{
    geometry?: { type?: unknown; coordinates?: unknown }
    properties?: { summary?: { distance?: unknown; duration?: unknown } }
  }>
  error?: { message?: unknown } | string
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

function validPoint(value: unknown): value is RoutePoint {
  if (!value || typeof value !== 'object') return false
  const point = value as Partial<RoutePoint>
  return (
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng) &&
    Math.abs(Number(point.lat)) <= 90 &&
    Math.abs(Number(point.lng)) <= 180
  )
}

function routeErrorMessage(response: Response, payload: DirectionsPayload | null) {
  return typeof payload?.error === 'string'
    ? payload.error
    : typeof payload?.error?.message === 'string'
      ? payload.error.message
      : `openrouteservice 请求失败（HTTP ${response.status}）`
}

async function requestDirections(
  apiKey: string,
  profile: RouteProfile,
  coordinates: RouteCoordinate[],
): Promise<{ response: Response; payload: DirectionsPayload | null }> {
  const response = await fetch(
    `https://api.heigit.org/openrouteservice/v2/directions/${profile}/geojson`,
    {
      method: 'POST',
      headers: {
        Authorization: apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/geo+json, application/json',
      },
      body: JSON.stringify({
        coordinates,
        instructions: false,
        preference: 'recommended',
        units: 'm',
      }),
    },
  )
  const payload = (await response.json().catch(() => null)) as
    | DirectionsPayload
    | null
  return { response, payload }
}

/** Attractions can sit inside pedestrian campuses, beyond Directions' 350 m snap limit. */
async function snapCoordinates(
  apiKey: string,
  profile: RouteProfile,
  coordinates: RouteCoordinate[],
): Promise<RouteCoordinate[] | null> {
  const response = await fetch(
    `https://api.heigit.org/openrouteservice/v2/snap/${profile}/json`,
    {
      method: 'POST',
      headers: {
        Authorization: apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ locations: coordinates, radius: 2_000 }),
    },
  )
  if (!response.ok) return null
  const payload = (await response.json().catch(() => null)) as {
    locations?: Array<{ location?: unknown } | null>
  } | null
  const snapped = payload?.locations?.map((item) => item?.location)
  if (
    !snapped ||
    snapped.length !== coordinates.length ||
    !snapped.every(
      (point): point is RouteCoordinate =>
        Array.isArray(point) &&
        point.length >= 2 &&
        Number.isFinite(point[0]) &&
        Number.isFinite(point[1]),
    )
  ) {
    return null
  }
  return snapped
}

export async function POST(req: Request): Promise<Response> {
  return handleOpenRouteService(req)
}

export async function handleOpenRouteService(req: Request): Promise<Response> {
  if (req.method !== 'POST') return methodNotAllowed(['POST'])
  const auth = await requireAllowlistedUser(req)
  if (!auth.ok) return auth.response

  const apiKey = readEnv('OPENROUTESERVICE_API_KEY')
  if (!apiKey) {
    return json(503, {
      error: '服务器尚未配置 OPENROUTESERVICE_API_KEY，地图仍可显示地点。',
    })
  }

  let body: { points?: unknown; profile?: unknown }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return json(400, { error: '路线请求不是有效 JSON。' })
  }

  const points = Array.isArray(body.points) ? body.points.filter(validPoint) : []
  if (points.length < 2 || points.length > 50) {
    return json(400, { error: '路线请求需要 2–50 个有效坐标。' })
  }
  const profile: RouteProfile =
    body.profile === 'driving-car' ? 'driving-car' : 'foot-walking'

  const routeCoordinates: RouteCoordinate[] = points.map((point) => [
    point.lng,
    point.lat,
  ])
  let { response: upstream, payload } = await requestDirections(
    apiKey,
    profile,
    routeCoordinates,
  )
  if (!upstream.ok) {
    const firstError = routeErrorMessage(upstream, payload)
    if (/routable point|within a radius/i.test(firstError)) {
      const snapped = await snapCoordinates(apiKey, profile, routeCoordinates)
      if (snapped) {
        ;({ response: upstream, payload } = await requestDirections(
          apiKey,
          profile,
          snapped,
        ))
      }
    }
  }
  if (!upstream.ok) {
    return json(upstream.status, { error: routeErrorMessage(upstream, payload) })
  }

  const feature = payload?.features?.[0]
  const coordinates = Array.isArray(feature?.geometry?.coordinates)
    ? feature.geometry.coordinates
    : []
  if (feature?.geometry?.type !== 'LineString' || coordinates.length < 2) {
    return json(502, { error: 'openrouteservice 没有返回有效路线。' })
  }

  return json(200, {
    geometry: { type: 'LineString', coordinates },
    distanceMeters: Number(feature.properties?.summary?.distance) || 0,
    durationSeconds: Number(feature.properties?.summary?.duration) || 0,
  })
}
