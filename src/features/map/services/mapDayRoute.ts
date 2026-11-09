import type { DayPlan, Place, SelectedHotel } from '../../../types'
import { getPlace } from '../../place/constants/places'
import {
  getDayOrigin,
  isSamePoint,
  type DayOrigin,
} from '../../itinerary/utils/dayOrigin'
import { visibleMapStops, type VisibleMapStop } from './googleMapMarkerStops'
import {
  buildMapRouteKey,
  buildMapRouteSegmentKey,
  preferredMapRouteProfile,
  type MapRoutePoint,
  type MapRouteProfile,
} from './mapRouteCache'
import type { MapRouteSegmentRequest } from './openRouteService'

export interface DayMapRouteRequest {
  origin: DayOrigin
  stops: Place[]
  markerStops: VisibleMapStop<Place>[]
  points: MapRoutePoint[]
  profile: MapRouteProfile
  key: string
}

/** Build the exact marker/route input shared by the visible map and background prefetch. */
export function buildDayMapRouteRequest(
  day: DayPlan,
  hotel: SelectedHotel,
  customPlaces: Record<string, Place>,
): DayMapRouteRequest {
  const route = buildDayMapRouteSegments(day, hotel, customPlaces)
  const points = route.endpoints.map(endpoint => endpoint.point)
  return {
    origin: route.origin,
    stops: route.stops,
    markerStops: route.markerStops,
    points,
    profile: route.profile,
    key: buildMapRouteKey(route.profile, points),
  }
}

export interface DayMapRouteEndpoint {
  id: string
  point: MapRoutePoint
}

export interface DayMapRouteSegment {
  /** Stable React key — same segment keeps the same `key` even after coords tweak. */
  reactKey: string
  fromId: string
  toId: string
  from: MapRoutePoint
  to: MapRoutePoint
  /** Cache lookup key derived from profile + rounded coordinates. */
  cacheKey: string
}

export interface DayMapRouteSegments {
  origin: DayOrigin
  stops: Place[]
  markerStops: VisibleMapStop<Place>[]
  endpoints: DayMapRouteEndpoint[]
  segments: DayMapRouteSegment[]
  profile: MapRouteProfile
  /** Stable, ordered list of every cache key for fingerprinting. */
  fingerprint: string
}

function endpointFor(
  place: Place,
  index: number,
): DayMapRouteEndpoint {
  return { id: place.id || `stop-${index}`, point: place.location }
}

/**
 * Same data shape as `buildDayMapRouteRequest`, but exposed as a list of
 * ordered legs. The day-level `profile` decision is preserved so a long
 * airport transfer still flips the whole day to driving.
 */
export function buildDayMapRouteSegments(
  day: DayPlan,
  hotel: SelectedHotel,
  customPlaces: Record<string, Place>,
): DayMapRouteSegments {
  const origin = getDayOrigin(day.day, hotel)
  const stops: Place[] = []
  for (const stop of day.stops) {
    try {
      const place = getPlace(stop.placeId, customPlaces)
      if (
        Number.isFinite(place.location.lat) &&
        Number.isFinite(place.location.lng)
      ) {
        stops.push(place)
      }
    } catch {
      /* Ignore stale itinerary references. */
    }
  }
  const markerStops = visibleMapStops(stops, origin)
  const profilePoints: MapRoutePoint[] = [
    { lat: origin.lat, lng: origin.lng },
    ...stops.map(place => place.location),
  ]
  const profile = preferredMapRouteProfile(profilePoints)

  const endpoints: DayMapRouteEndpoint[] = [
    { id: origin.id, point: { lat: origin.lat, lng: origin.lng } },
    ...stops.map(endpointFor),
  ].filter((endpoint, index, all) => index === 0 || !isSamePoint(endpoint.point, all[index - 1].point, 1))

  const segments: DayMapRouteSegment[] = []
  const occurrences = new Map<string, number>()
  for (let index = 0; index < endpoints.length - 1; index += 1) {
    const from = endpoints[index]
    const to = endpoints[index + 1]
    // Must match the key `openRouteService` writes segment entries under, so
    // TripMap's sync cache priming hits instead of always missing. If this
    // diverges, unchanged segments lose their `seen` record between renders
    // and re-animate on every edit.
    const cacheKey = buildMapRouteSegmentKey(profile, from.point, to.point)
    const baseKey = `${profile}|${from.id}->${to.id}`
    const occurrence = (occurrences.get(baseKey) ?? 0) + 1
    occurrences.set(baseKey, occurrence)
    segments.push({
      reactKey: occurrence === 1 ? baseKey : `${baseKey}#${occurrence}`,
      fromId: from.id,
      toId: to.id,
      from: from.point,
      to: to.point,
      cacheKey,
    })
  }

  const fingerprint = segments.map((segment) => segment.cacheKey).join('||')
  return {
    origin,
    stops,
    markerStops,
    endpoints,
    segments,
    profile,
    fingerprint,
  }
}

export function dayRouteSegmentsToRequests(
  segments: readonly DayMapRouteSegment[],
): MapRouteSegmentRequest[] {
  return segments.map((segment) => ({
    fromId: segment.fromId,
    toId: segment.toId,
    from: segment.from,
    to: segment.to,
  }))
}
