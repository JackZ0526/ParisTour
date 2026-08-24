import type { PersistedBaselineState, PersistedItineraryState } from '../../itinerary/utils/itineraryState'
import type { PersistedFlightSelection } from '../../flight/services/flightSelection'
import type { HotelCacheState } from '../../hotel/services/hotelCache'
import type { TripDateRange } from '../../itinerary/services/tripDates'
import type { LlmArtifactMap } from '../../../shared/services/llm/llmArtifactStore'
import type { RecommendationPreferences } from '../../place/services/recommendationPreferences'
import {
  clearBaselineItinerary,
  clearItineraryState,
  loadBaselineItinerary,
  loadItineraryState,
  saveBaselineItinerary,
  saveItineraryState,
} from '../../itinerary/utils/itineraryState'
import {
  clearFlightSelection,
  loadFlightSelection,
  saveFlightSelection,
} from '../../flight/services/flightSelection'
import { clearHotelCache, loadHotelCache, saveHotelCache } from '../../hotel/services/hotelCache'
import { loadDestination, saveDestination } from '../../destination/services/destination'
import { loadTripDates, saveTripDates } from '../../itinerary/services/tripDates'
import {
  clearLlmArtifacts,
  loadLlmArtifacts,
  mergeCloudArtifacts,
} from '../../../shared/services/llm/llmArtifactStore'
import { clearLlmMemo, seedLlmMemo } from '../../../shared/services/llm/llmMemo'
import {
  clearRecommendationPreferences,
  loadRecommendationPreferences,
  saveRecommendationPreferences,
} from '../../place/services/recommendationPreferences'
import {
  clearMapRouteCache,
  loadMapRouteCache,
  saveMapRouteCache,
  type MapRouteCacheMap,
} from '../../map/services/mapRouteCache'

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
  /** Cached openrouteservice geometries, shared across devices with the trip. */
  mapRoutes?: MapRouteCacheMap | null
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
    destination: '',
    flights: null,
    hotel: null,
    itinerary: null,
    baseline: null,
    recommendationPreferences: loadRecommendationPreferences(),
    mapRoutes: {},
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
    destination: loadDestination() || '',
    flights: loadFlightSelection(),
    hotel: loadHotelCache(),
    itinerary:
      itinerary.days.length || itinerary.generated || itinerary.fingerprint
        ? itinerary
        : null,
    baseline,
    recommendationPreferences: loadRecommendationPreferences(),
    mapRoutes: loadMapRouteCache(),
    llmArtifacts: Object.keys(llmArtifacts).length ? llmArtifacts : {},
  }
}

/** Write snapshot into localStorage (App remount reads from there). */
export function applyTripSnapshot(
  snapshot: TripSnapshot | null | undefined,
  opts?: { hydrateArtifacts?: boolean; hydrateDays?: boolean },
) {
  const snap = snapshot && typeof snapshot === 'object' ? snapshot : emptyTripSnapshot()

  saveTripDates(snap.dates ?? null)
  saveDestination((snap.destination || '').trim())

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

  const keepDays = opts?.hydrateDays === false
  const previousDays = keepDays ? loadItineraryState().days : []
  if (!keepDays) {
    clearItineraryState()
  }
  if (snap.itinerary) {
    const daysToSave = keepDays ? previousDays : snap.itinerary.days || []
    saveItineraryState(
      daysToSave,
      snap.itinerary.customPlaces || {},
      {
        generated: daysToSave.length > 0 ? true : Boolean(snap.itinerary.generated),
        fingerprint: snap.itinerary.fingerprint ?? null,
      },
    )
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

  if (snap.mapRoutes && typeof snap.mapRoutes === 'object' && Object.keys(snap.mapRoutes).length) {
    saveMapRouteCache(snap.mapRoutes)
  }

  const artifacts = snap.llmArtifacts
  if (opts?.hydrateArtifacts === false) {
    seedMemoFromArtifacts(loadLlmArtifacts())
  } else if (artifacts && typeof artifacts === 'object') {
    hydrateTripArtifacts(artifacts)
  } else {
    // Legacy snapshot without llmArtifacts — keep whatever is already local.
    seedMemoFromArtifacts(loadLlmArtifacts())
  }
}

/** Merge cloud LLM copy into local durable artifacts without wiping API caches. */
export function hydrateTripArtifacts(map: LlmArtifactMap | null | undefined) {
  mergeCloudArtifacts({
    upserts: map && typeof map === 'object' ? map : {},
    silent: true,
  })
  seedMemoFromArtifacts(loadLlmArtifacts())
}

export function clearLocalTripStorage() {
  applyTripSnapshot(emptyTripSnapshot())
  clearMapRouteCache()
  clearLlmArtifacts({ silent: true })
  clearLlmMemo()
}
