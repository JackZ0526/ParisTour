import type { Place } from '../../../types'
import {
  isAirportPlace,
  isHotelPlace,
  isSamePoint,
  type DayOrigin,
} from '../../itinerary/utils/dayOrigin'

type MarkerPlace = Pick<Place, 'id' | 'type' | 'name' | 'location'>

export interface VisibleMapStop<T extends MarkerPlace> {
  place: T
  index: number
}

/** Keep itinerary order while avoiding stacked hotel/airport map markers. */
export function visibleMapStops<T extends MarkerPlace>(
  stops: readonly T[],
  origin: DayOrigin,
): VisibleMapStop<T>[] {
  const seenSpecialStops: Array<{
    kind: DayOrigin['kind']
    location: T['location']
  }> = []

  return stops.flatMap((place, index) => {
    const kind = isHotelPlace(place)
      ? 'hotel'
      : isAirportPlace(place)
        ? 'airport'
        : null
    if (!kind) return [{ place, index }]

    if (kind === origin.kind && isSamePoint(place.location, origin, 10)) {
      return []
    }
    if (
      seenSpecialStops.some(
        (seen) =>
          seen.kind === kind && isSamePoint(place.location, seen.location, 10),
      )
    ) {
      return []
    }

    seenSpecialStops.push({ kind, location: place.location })
    return [{ place, index }]
  })
}
