export type PlaceType = 'cafe' | 'attraction' | 'restaurant' | 'transport' | 'hotel'
export type Pace = 'relaxed' | 'moderate' | 'park' | 'self-drive'
export type WalkLevel = 'minimal' | 'short' | 'moderate'
export type Transport = 'transit' | 'walking' | 'driving' | 'cycling'

export interface Coordinates {
  lat: number
  lng: number
}

/** Hotel card shown in the picker (LLM recommend or custom address). */
export interface HotelCandidate {
  id: string
  bookingHotelId?: string
  /** Legacy identity retained for older saved trips. */
  googlePlaceId?: string
  name: string
  area: string
  address: string
  description: string
  /** Google rating text or rough price band */
  priceHint: string
  nearestMetro: string
  image: string
  photos?: string[]
  rating?: number
  reviewCount?: number
  starRating?: number
  facilities?: string[]
  /** Booking category, e.g. Hotel or Aparthotel. */
  propertyType?: string
  /** Booking review sub-scores such as location, staff and cleanliness. */
  reviewScores?: Array<{ label: string; score: number }>
  /** Languages spoken by the property staff. */
  languages?: string[]
  /** Important stay rules and fine print returned by Booking. */
  policies?: string[]
  /** Accepted payment methods returned by Booking. */
  paymentMethods?: string[]
  /** Sustainability tier or provider label. */
  sustainability?: string
  /** Booking district label, e.g. "3rd arr." */
  districtLabel?: string
  /** Distance to city center in kilometres from Booking detail. */
  distanceToCityCenterKm?: number
  /** Location / neighbourhood blurb from Booking description. */
  locationDescription?: string
  reviews?: Array<{
    text: string
    negativeText?: string
    rating?: number
    author?: string
    relativeTime?: string
  }>
  checkIn?: string
  checkOut?: string
  bookingUrl?: string
  /** True after the Booking detail endpoint has been resolved, including empty optional fields. */
  bookingDetailsLoaded?: boolean
  /** Local normalized detail schema; used to refresh older cached records once. */
  bookingDetailsVersion?: number
  /** True when the Booking detail response included a multi-photo gallery. */
  bookingPhotosLoaded?: boolean
  /** True after featured Booking reviews have been resolved, including an empty result. */
  bookingReviewsLoaded?: boolean
  lat: number
  lng: number
  /** Short why-this-hotel line from recommend */
  reason?: string
  /** How this stay fits the trip + user preferences */
  tripFit?: string
  /** LLM advisor reason schema version; v2 = single combined reason. */
  hotelAdvisorVersion?: number
  isBest?: boolean
  source: 'llm' | 'custom'
}

export interface Place {
  id: string
  /** Stable Google Places identity. Prefer this over text search when available. */
  googlePlaceId?: string
  /** Tripadvisor location id for attractions (photos + description). */
  tripadvisorContentId?: string
  name: string
  nameLocal?: string
  type: PlaceType
  description: string
  cuisine?: string
  /** Google rating captured during itinerary generation; detail pages never refetch it. */
  googleRating?: number
  /** Google rating count captured alongside `googleRating`. */
  googleUserRatingCount?: number
  /** Google address captured during itinerary generation. */
  googleAddress?: string
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
  pace: Pace
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
  bookingHotelId?: string
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
