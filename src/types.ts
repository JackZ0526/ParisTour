export type PlaceType = 'cafe' | 'attraction' | 'restaurant' | 'transport' | 'hotel'

export type WalkLevel = '很少走' | '短步行' | '中等步行'

export interface Coordinates {
  lat: number
  lng: number
}

/** Hotel card shown in the picker (LLM recommend or custom address). */
export interface HotelCandidate {
  id: string
  /** @deprecated Compatibility field; stores a provider-neutral OSM identity. */
  googlePlaceId?: string
  name: string
  area: string
  address: string
  description: string
  /** Google rating text or rough price band */
  priceHint: string
  nearestMetro: string
  image: string
  lat: number
  lng: number
  /** Short why-this-hotel line from recommend */
  reason?: string
  /** How this stay fits the trip + user preferences */
  tripFit?: string
  isBest?: boolean
  source: 'llm' | 'custom'
}

export interface Place {
  id: string
  /** @deprecated Compatibility field; new values use `osm:<type>:<id>`. */
  googlePlaceId?: string
  name: string
  nameLocal?: string
  type: PlaceType
  description: string
  cuisine?: string
  ratingHint: string
  priceHint?: string
  image: string
  location: Coordinates
  /** True when the model selected the place but precise coordinates still need validation. */
  locationPending?: boolean
  /** @deprecated Compatibility field; now stores an OpenStreetMap URL. */
  googleMapsUrl: string
  durationHint?: string
}

export interface ItineraryStop {
  /** Stable id for drag-and-drop / edit (assigned when itinerary becomes editable) */
  id?: string
  time: string
  placeId: string
  note: string
  transport?: string
  walkLevel?: WalkLevel
  duration?: string
}

export interface DayPlan {
  day: number
  title: string
  theme: string
  pace: '轻松' | '适中' | '乐园日' | '自驾日'
  summary: string
  metroHintFromArea: Record<string, string>
  stops: ItineraryStop[]
}

export interface FlightLegTemplate {
  id: string
  label: string
  direction: 'outbound' | 'return'
  airline: string
  flightNumber: string
  from: { code: string; city: string }
  to: { code: string; city: string }
  departLocal: string
  arriveLocal: string
  duration: string
  aircraft: string
  notes: string
}

/** Airport endpoint on a flight card / lookup result. */
export interface FlightEndpoint {
  code?: string
  name?: string
  city?: string
  terminal?: string
  /** Raw airport-local string, e.g. `2026-11-09 14:35-08:00` — format at display. */
  scheduled?: string
  actual?: string
  /** IANA zone when known, e.g. `America/Vancouver` (optional; caches without it still format). */
  timeZone?: string
}

export interface FlightInfo {
  flightNumber: string
  airline?: string
  status?: string
  from?: FlightEndpoint
  to?: FlightEndpoint
  duration?: string
  aircraft?: string
  source: 'recommended' | 'live' | 'llm' | 'timetable' | 'aerodatabox' | 'manual'
  rawNote?: string
}

export interface SelectedHotel {
  id: string
  /** @deprecated Compatibility field; stores a provider-neutral OSM identity. */
  googlePlaceId?: string
  name: string
  address: string
  lat: number
  lng: number
  nearestMetro: string
  areaKey: string
  source: 'recommended' | 'custom'
  description?: string
  image?: string
  ratingHint?: string
}
