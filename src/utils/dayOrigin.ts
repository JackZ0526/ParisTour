import type { Coordinates, Place, SelectedHotel } from '../types'

/** Charles de Gaulle — day-1 route origin (not an itinerary stop). */
export const CDG_PLACE_ID = 'attr-cdg'
export const CDG_LOCATION: Coordinates = { lat: 49.0097, lng: 2.5479 }

/** Synthetic place id for the currently selected hotel (day-1 first stop). */
export const SELECTED_HOTEL_PLACE_ID = 'hotel-selected'

export function placeFromHotel(hotel: SelectedHotel): Place {
  return {
    id: SELECTED_HOTEL_PLACE_ID,
    name: hotel.name,
    type: 'hotel',
    description:
      hotel.description ||
      `办理入住、放下行李。地址：${hotel.address}`,
    ratingHint:
      hotel.ratingHint ||
      (hotel.nearestMetro ? `地铁 ${hotel.nearestMetro}` : '酒店'),
    image:
      hotel.image ||
      'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80',
    location: { lat: hotel.lat, lng: hotel.lng },
    googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      `${hotel.name} ${hotel.address}`,
    )}`,
    durationHint: '入住 30–45 分钟',
  }
}

export type DayOriginKind = 'airport' | 'hotel'

export interface DayOrigin extends Coordinates {
  kind: DayOriginKind
  id: string
  label: string
  /** Short label for timeline connectors */
  prefix: string
}

/** Day 1 starts at CDG; other days start at the selected hotel. */
export function getDayOrigin(dayNumber: number, hotel: SelectedHotel): DayOrigin {
  if (dayNumber === 1) {
    return {
      ...CDG_LOCATION,
      kind: 'airport',
      id: CDG_PLACE_ID,
      label: '戴高乐机场 CDG',
      prefix: '从机场出发',
    }
  }

  return {
    lat: hotel.lat,
    lng: hotel.lng,
    kind: 'hotel',
    id: hotel.id,
    label: hotel.name,
    prefix: '从酒店出发',
  }
}

export function isSamePoint(
  a: Coordinates,
  b: Coordinates,
  withinMeters = 500,
): boolean {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h)) <= withinMeters
}
