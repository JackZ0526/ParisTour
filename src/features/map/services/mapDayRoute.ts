import type { DayPlan, Place, SelectedHotel } from '../../../types'
import { getPlace } from '../../place/constants/places'
import {
  getDayOrigin,
  type DayOrigin,
} from '../../itinerary/utils/dayOrigin'
import { visibleMapStops, type VisibleMapStop } from './googleMapMarkerStops'
import {
  buildMapRouteKey,
  preferredMapRouteProfile,
  type MapRoutePoint,
  type MapRouteProfile,
} from './mapRouteCache'

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
  const points: MapRoutePoint[] = [
    { lat: origin.lat, lng: origin.lng },
    ...markerStops.map(({ place }) => place.location),
  ]
  const profile = preferredMapRouteProfile(points)
  return {
    origin,
    stops,
    markerStops,
    points,
    profile,
    key: buildMapRouteKey(profile, points),
  }
}
