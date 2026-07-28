import type { PersistedBaselineState, PersistedItineraryState } from '../utils/itineraryState'
import type { PersistedFlightSelection } from './flightSelection'
import type { HotelCacheState } from './hotelCache'
import type { TripDateRange } from './tripDates'
import {
  clearBaselineItinerary,
  clearItineraryState,
  loadBaselineItinerary,
  loadItineraryState,
  saveBaselineItinerary,
  saveItineraryState,
} from '../utils/itineraryState'
import {
  clearFlightSelection,
  loadFlightSelection,
  saveFlightSelection,
} from './flightSelection'
import { clearHotelCache, loadHotelCache, saveHotelCache } from './hotelCache'
import { loadDestination, saveDestination } from './destination'
import { loadTripDates, saveTripDates } from './tripDates'

export const TRIP_SNAPSHOT_VERSION = 1 as const

/** Cloud JSON blob for one trip (maps 1:1 to existing localStorage domains). */
export type TripSnapshot = {
  version: typeof TRIP_SNAPSHOT_VERSION
  dates: TripDateRange | null
  destination: string
  flights: PersistedFlightSelection | null
  hotel: HotelCacheState | null
  itinerary: PersistedItineraryState | null
  baseline: PersistedBaselineState | null
}

export function emptyTripSnapshot(): TripSnapshot {
  return {
    version: TRIP_SNAPSHOT_VERSION,
    dates: null,
    destination: '巴黎',
    flights: null,
    hotel: null,
    itinerary: null,
    baseline: null,
  }
}

/** Collect current browser localStorage trip fields into one snapshot. */
export function collectTripSnapshot(): TripSnapshot {
  const itinerary = loadItineraryState()
  const baseline = loadBaselineItinerary()
  return {
    version: TRIP_SNAPSHOT_VERSION,
    dates: loadTripDates(),
    destination: loadDestination() || '巴黎',
    flights: loadFlightSelection(),
    hotel: loadHotelCache(),
    itinerary:
      itinerary.days.length || itinerary.generated || itinerary.fingerprint
        ? itinerary
        : null,
    baseline,
  }
}

/** Write snapshot into localStorage (App remount reads from there). */
export function applyTripSnapshot(snapshot: TripSnapshot | null | undefined) {
  const snap = snapshot && typeof snapshot === 'object' ? snapshot : emptyTripSnapshot()

  saveTripDates(snap.dates ?? null)
  saveDestination((snap.destination || '巴黎').trim() || '巴黎')

  if (snap.flights && (snap.flights.outbound || snap.flights.returnFlight)) {
    saveFlightSelection({
      outbound: snap.flights.outbound ?? null,
      returnFlight: snap.flights.returnFlight ?? null,
      outboundInput: snap.flights.outboundInput ?? snap.flights.outbound?.flightNumber ?? '',
      returnInput: snap.flights.returnInput ?? snap.flights.returnFlight?.flightNumber ?? '',
    })
  } else {
    clearFlightSelection()
  }

  if (snap.hotel?.candidates?.length) {
    saveHotelCache(snap.hotel)
  } else {
    clearHotelCache()
  }

  clearItineraryState()
  if (snap.itinerary) {
    saveItineraryState(snap.itinerary.days || [], snap.itinerary.customPlaces || {}, {
      generated: snap.itinerary.generated,
      fingerprint: snap.itinerary.fingerprint ?? null,
    })
  }

  clearBaselineItinerary()
  if (snap.baseline?.days?.length) {
    saveBaselineItinerary(
      snap.baseline.days,
      snap.baseline.customPlaces || {},
      snap.baseline.fingerprint,
    )
  }
}

export function clearLocalTripStorage() {
  applyTripSnapshot(emptyTripSnapshot())
}
