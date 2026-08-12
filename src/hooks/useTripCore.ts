/**
 * useTripCore — trip inputs that drive itinerary readiness.
 *
 * Owns:
 *   - tripDates (start/end)
 *   - flights (outbound + return)
 *   - hotel + hotelCandidates
 *   - viewingHotelDetail (HotelPicker detail popup)
 *   - readiness flags (datesReady / flightsReady / hotelReady / …)
 *   - handleFlightsChange (no-op when outbound+return are unchanged)
 *
 * Does NOT own:
 *   - Itinerary generation state (→ useItineraryGeneration)
 *   - Day-by-day mutations (→ useItineraryDays)
 *   - Cloud sync / autosave (→ useTripSync)
 *
 * Why one hook for all four: every `itineraryReady` check crosses
 * dates + flights + hotel, so consumers want them in one place.
 * viewHotelDetail is glued to hotel because the HotelPicker / trip
 * chat panel surface it together.
 */
import { useCallback, useState } from 'react'
import {
  areFlightsComplete,
  type FlightSelection,
} from '../features/flight/components/FlightPanel'
import { loadTripDates, type TripDateRange } from '../features/itinerary/services/tripDates'
import {
  hasTripDates,
  initialFlightsState,
  initialHotelState,
  isHotelSelected,
} from '../appHelpers'
import type { HotelCandidate, SelectedHotel } from '../types'

export interface UseTripCoreResult {
  tripDates: TripDateRange | null
  setTripDates: React.Dispatch<React.SetStateAction<TripDateRange | null>>
  flights: FlightSelection
  setFlights: (next: FlightSelection) => void
  hotel: SelectedHotel
  setHotel: React.Dispatch<React.SetStateAction<SelectedHotel>>
  hotelCandidates: HotelCandidate[]
  setHotelCandidates: React.Dispatch<React.SetStateAction<HotelCandidate[]>>
  viewingHotelDetail: HotelCandidate | null
  setViewingHotelDetail: React.Dispatch<React.SetStateAction<HotelCandidate | null>>
  datesReady: boolean
  outboundReady: boolean
  returnReady: boolean
  flightsReady: boolean
  hotelReady: boolean
}

export function useTripCore(): UseTripCoreResult {
  const [tripDates, setTripDates] = useState<TripDateRange | null>(() => loadTripDates())
  const [flights, setFlightsState] = useState<FlightSelection>(() => initialFlightsState())
  const initialHotels = initialHotelState()
  const [hotel, setHotel] = useState<SelectedHotel>(initialHotels.hotel)
  const [hotelCandidates, setHotelCandidates] = useState<HotelCandidate[]>(
    initialHotels.candidates,
  )
  const [viewingHotelDetail, setViewingHotelDetail] = useState<HotelCandidate | null>(null)

  // No-op when both legs match — keeps downstream effects (autosave /
  // fingerprint gate / start resolve) from firing on identity updates
  // the FlightPanel emits when only dates or hotel area change.
  const setFlights = useCallback((next: FlightSelection) => {
    setFlightsState((prev) =>
      prev.outbound === next.outbound && prev.returnFlight === next.returnFlight
        ? prev
        : next,
    )
  }, [])

  const datesReady = hasTripDates(tripDates)
  const outboundReady = Boolean(flights.outbound?.flightNumber?.trim())
  const returnReady = Boolean(flights.returnFlight?.flightNumber?.trim())
  const flightsReady = areFlightsComplete(flights)
  const hotelReady = isHotelSelected(hotel)
  return {
    tripDates,
    setTripDates,
    flights,
    setFlights,
    hotel,
    setHotel,
    hotelCandidates,
    setHotelCandidates,
    viewingHotelDetail,
    setViewingHotelDetail,
    datesReady,
    outboundReady,
    returnReady,
    flightsReady,
    hotelReady,
  }
}
