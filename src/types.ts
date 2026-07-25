export type PlaceType = 'cafe' | 'attraction' | 'restaurant' | 'transport' | 'hotel'

export type WalkLevel = '很少走' | '短步行' | '中等步行'

export interface Coordinates {
  lat: number
  lng: number
}

/** Hotel card shown in the picker (LLM recommend or custom address). */
export interface HotelCandidate {
  id: string
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
  /** How this stay fits the 7-day trip + user preferences */
  tripFit?: string
  isBest?: boolean
  source: 'llm' | 'custom'
}

export interface Place {
  id: string
  name: string
  nameLocal?: string
  type: PlaceType
  description: string
  cuisine?: string
  ratingHint: string
  priceHint?: string
  image: string
  location: Coordinates
  /** Opens Google Maps place search / photos & reviews */
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

export interface FlightInfo {
  flightNumber: string
  airline?: string
  status?: string
  from?: { code?: string; name?: string; city?: string; terminal?: string; scheduled?: string; actual?: string }
  to?: { code?: string; name?: string; city?: string; terminal?: string; scheduled?: string; actual?: string }
  duration?: string
  aircraft?: string
  source: 'recommended' | 'live' | 'llm' | 'manual'
  rawNote?: string
}

export interface SelectedHotel {
  id: string
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
