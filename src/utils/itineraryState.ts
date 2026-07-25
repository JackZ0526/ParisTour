import { itinerary as seedItinerary } from '../data/itinerary'
import type { DayPlan, ItineraryStop, Place } from '../types'
import { SELECTED_HOTEL_PLACE_ID } from './dayOrigin'

const STORAGE_KEY = 'paris-tour-itinerary-v1'

/** Day 1: airport is origin; first stop must be hotel check-in (not CDG as a stop). */
export function ensureDay1HotelFirst(days: DayPlan[]): DayPlan[] {
  return days.map((day) => {
    if (day.day !== 1) return day

    const rest = day.stops.filter(
      (s) => s.placeId !== 'attr-cdg' && s.placeId !== SELECTED_HOTEL_PLACE_ID,
    )
    const hotelStop: ItineraryStop = {
      id: `d1-${SELECTED_HOTEL_PLACE_ID}-checkin`,
      time: '10:30',
      placeId: SELECTED_HOTEL_PLACE_ID,
      note: '从 CDG 出关后先到酒店办理入住、放下行李，稍作休息再出门。',
      transport: 'RER B / 出租车自戴高乐机场',
      walkLevel: '很少走',
      duration: '入住 30–45 分钟',
    }

    return {
      ...day,
      stops: [hotelStop, ...rest],
    }
  })
}

export function cloneSeedItinerary(): DayPlan[] {
  return ensureDay1HotelFirst(
    seedItinerary.map((day) => ({
      ...day,
      metroHintFromArea: { ...day.metroHintFromArea },
      stops: day.stops.map((stop, index) => ({
        ...stop,
        id: stop.id || `d${day.day}-${stop.placeId}-${index}`,
      })),
    })),
  )
}

export function loadItineraryState(): {
  days: DayPlan[]
  customPlaces: Record<string, Place>
} {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return { days: cloneSeedItinerary(), customPlaces: {} }
    }
    const parsed = JSON.parse(raw) as {
      days?: DayPlan[]
      customPlaces?: Record<string, Place>
    }
    if (!parsed.days?.length) {
      return { days: cloneSeedItinerary(), customPlaces: {} }
    }
    return {
      days: ensureDay1HotelFirst(
        parsed.days.map((day) => ({
          ...day,
          stops: day.stops.map((stop, index) => ({
            ...stop,
            id: stop.id || `d${day.day}-${stop.placeId}-${index}`,
          })),
        })),
      ),
      customPlaces: parsed.customPlaces || {},
    }
  } catch {
    return { days: cloneSeedItinerary(), customPlaces: {} }
  }
}

export function saveItineraryState(days: DayPlan[], customPlaces: Record<string, Place>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ days, customPlaces }))
  } catch {
    /* ignore quota */
  }
}

export function reorderStops(stops: ItineraryStop[], from: number, to: number): ItineraryStop[] {
  if (from === to || from < 0 || to < 0 || from >= stops.length || to >= stops.length) {
    return stops
  }
  const next = [...stops]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

export function makeStopId(day: number, placeId: string): string {
  return `d${day}-${placeId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/**
 * Pick the insert index that minimizes origin → … → stops [→ destination] path length
 * after inserting `newLoc` (0 = before first stop, length = after last).
 */
export function findBestInsertIndex(
  origin: { lat: number; lng: number },
  stopLocations: Array<{ lat: number; lng: number }>,
  newLoc: { lat: number; lng: number },
  destination?: { lat: number; lng: number } | null,
): number {
  if (!stopLocations.length) return 0

  let bestIdx = stopLocations.length
  let bestCost = Number.POSITIVE_INFINITY

  for (let i = 0; i <= stopLocations.length; i++) {
    const order = [...stopLocations.slice(0, i), newLoc, ...stopLocations.slice(i)]
    let cost = haversineMeters(origin, order[0])
    for (let j = 1; j < order.length; j++) {
      cost += haversineMeters(order[j - 1], order[j])
    }
    if (destination) {
      cost += haversineMeters(order[order.length - 1], destination)
    }
    if (cost < bestCost) {
      bestCost = cost
      bestIdx = i
    }
  }

  return bestIdx
}

