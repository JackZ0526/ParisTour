import type { PersistedBaselineState, PersistedItineraryState } from '../../../utils/itineraryState'
import type { PersistedFlightSelection } from '../../flight/services/flightSelection'
import type { HotelCacheState } from '../../../services/hotelCache'
import type { TripDateRange } from '../../../services/tripDates'
import type { LlmArtifactMap } from '../../../services/llmArtifactStore'
import type { RecommendationPreferences } from '../../../services/recommendationPreferences'
import {
  clearBaselineItinerary,
  clearItineraryState,
  loadBaselineItinerary,
  loadItineraryState,
  saveBaselineItinerary,
  saveItineraryState,
} from '../../../utils/itineraryState'
import {
  clearFlightSelection,
  loadFlightSelection,
  saveFlightSelection,
} from '../../flight/services/flightSelection'
import { clearHotelCache, loadHotelCache, saveHotelCache } from '../../../services/hotelCache'
import { loadDestination, saveDestination } from '../../destination/services/destination'
import { loadTripDates, saveTripDates } from '../../../services/tripDates'
import {
  clearLlmArtifacts,
  loadLlmArtifacts,
  saveLlmArtifacts,
} from '../../../services/llmArtifactStore'
import { clearLlmMemo, seedLlmMemo } from '../../../services/llmMemo'
import {
  clearRecommendationPreferences,
  loadRecommendationPreferences,
  saveRecommendationPreferences,
} from '../../../services/recommendationPreferences'

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
  recommendationPreferences?: RecommendationPreferences | null
  /**
   * Durable generated artifacts (place narratives, recommendations,
   * translations, Google place payloads, …), kept under the legacy field name.
   */
  llmArtifacts?: LlmArtifactMap | null
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
    recommendationPreferences: loadRecommendationPreferences(),
    llmArtifacts: {},
  }
}

function seedMemoFromArtifacts(map: LlmArtifactMap) {
  clearLlmMemo()
  for (const [key, entry] of Object.entries(map)) {
    seedLlmMemo(key, entry.value)
  }
}

/** Collect current browser localStorage trip fields into one snapshot. */
export function collectTripSnapshot(): TripSnapshot {
  const itinerary = loadItineraryState()
  const baseline = loadBaselineItinerary()
  const llmArtifacts = loadLlmArtifacts()
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
    recommendationPreferences: loadRecommendationPreferences(),
    llmArtifacts: Object.keys(llmArtifacts).length ? llmArtifacts : {},
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

  if (
    snap.hotel &&
    (snap.hotel.candidates?.length || snap.hotel.selected)
  ) {
    saveHotelCache({
      candidates: snap.hotel.candidates || [],
      selected: snap.hotel.selected ?? null,
      model: snap.hotel.model ?? '',
      batch: snap.hotel.batch ?? 0,
      fetchedAt: snap.hotel.fetchedAt ?? Date.now(),
      lastPreferences: snap.hotel.lastPreferences,
      othersCollapsed: snap.hotel.othersCollapsed,
    })
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

  if (snap.recommendationPreferences) {
    saveRecommendationPreferences(snap.recommendationPreferences)
  } else {
    clearRecommendationPreferences()
  }

  const artifacts = snap.llmArtifacts
  if (artifacts && typeof artifacts === 'object') {
    // Present in snapshot (including explicit empty) — replace local durable store.
    saveLlmArtifacts(artifacts, { silent: true })
    seedMemoFromArtifacts(artifacts)
  } else {
    // Legacy snapshot without llmArtifacts — keep whatever is already local.
    seedMemoFromArtifacts(loadLlmArtifacts())
  }
}

export function clearLocalTripStorage() {
  applyTripSnapshot(emptyTripSnapshot())
  clearLlmArtifacts({ silent: true })
  clearLlmMemo()
}
