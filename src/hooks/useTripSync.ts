import { useEffect, useRef } from 'react'
import type { FlightSelection } from '../features/flight/services/flightSelection'
import type { DayPlan, HotelCandidate, Place, SelectedHotel } from '../types'
import type { TripDateRange } from '../features/itinerary/services/tripDates'
import type {
  ItineraryInputFingerprint,
} from '../features/itinerary/utils/itineraryState'
import type { RecommendationPreferences } from '../features/place/services/recommendationPreferences'

import {
  ensureBaselineFromGenerated,
  loadItineraryState,
  type ItineraryInputFingerprint as ItineraryInputFingerprintType,
} from '../features/itinerary/utils/itineraryState'
import { flushTripCloudSave } from '../features/cloud-sync/services/tripCloud'
import { clearDayNavCache } from '../features/itinerary/hooks/useDayNav'
import { initialFlightsState, initialHotelState } from '../appHelpers'
import { loadTripDates } from '../features/itinerary/services/tripDates'
import { loadRecommendationPreferences } from '../features/place/services/recommendationPreferences'
import { SELECTED_HOTEL_PLACE_ID } from '../features/itinerary/utils/dayOrigin'
import { resolveItineraryStartSync } from '../shared/services/llm/business/itinerary'

export interface UseTripSyncDeps {
  tripSyncEpoch: number
  canEdit: boolean
  itinerarySyncV2Enabled: boolean
  notifyTripChanged: (opts?: {
    artifactsOnly?: boolean
    allowEmptyTrip?: boolean
  }) => void
}

export interface UseTripSyncState {
  syncRenderKey: number
  tripDates: TripDateRange | null
  flights: FlightSelection
  hotel: SelectedHotel
  hotelCandidates: HotelCandidate[]
  days: DayPlan[]
  customPlaces: Record<string, Place>
  itineraryGenerated: boolean
  itineraryFingerprint: ItineraryInputFingerprint | null
  recommendationPreferences: RecommendationPreferences
  dayIndex: number
  selectedPlaceId: string | null
}

export interface UseTripSyncSetters {
  setTripDates: React.Dispatch<React.SetStateAction<TripDateRange | null>>
  setFlights: (next: FlightSelection) => void
  setHotel: React.Dispatch<React.SetStateAction<SelectedHotel>>
  setHotelCandidates: React.Dispatch<React.SetStateAction<HotelCandidate[]>>
  setViewingHotelDetail: React.Dispatch<React.SetStateAction<HotelCandidate | null>>

  setItineraryStart: React.Dispatch<React.SetStateAction<any>>
  setItineraryStartLoading: React.Dispatch<React.SetStateAction<boolean>>
  setItineraryGenerated: React.Dispatch<React.SetStateAction<boolean>>
  setItineraryFingerprint: React.Dispatch<
    React.SetStateAction<ItineraryInputFingerprintType | null>
  >
  setItineraryGenerating: React.Dispatch<React.SetStateAction<boolean>>
  setItineraryGenError: React.Dispatch<React.SetStateAction<string | null>>

  setDayRegenerating: React.Dispatch<React.SetStateAction<boolean>>
  setDayRegenError: React.Dispatch<React.SetStateAction<string | null>>
  setDayRestoring: React.Dispatch<React.SetStateAction<boolean>>

  setCopyRefreshing: React.Dispatch<React.SetStateAction<boolean>>
  setRecommendationPreferences: React.Dispatch<
    React.SetStateAction<RecommendationPreferences>
  >

  setDays: React.Dispatch<React.SetStateAction<DayPlan[]>>
  setCustomPlaces: React.Dispatch<React.SetStateAction<Record<string, Place>>>
  setDayIndex: React.Dispatch<React.SetStateAction<number>>
  setSelectedPlaceId: React.Dispatch<React.SetStateAction<string | null>>

  setSyncRenderKey: React.Dispatch<React.SetStateAction<number>>
}

export interface UseTripSyncRefs {
  prevStopsKeyRef: React.MutableRefObject<string | null>
  suppressCopyRef: React.MutableRefObject<boolean>
  copyRequestIdRef: React.MutableRefObject<number>
  tripInputsHydratedRef: React.MutableRefObject<boolean>
  remoteHydrationRenderKeyRef: React.MutableRefObject<number | null>
}

export interface UseTripSyncHandlers {
  cancelInFlightGeneration: () => void
}

/**
 * useTripSync
 */
export function useTripSync(
  deps: UseTripSyncDeps,
  state: UseTripSyncState,
  setters: UseTripSyncSetters,
  refs: UseTripSyncRefs,
  handlers: UseTripSyncHandlers,
) {
  const {
    tripSyncEpoch,
    canEdit,
    itinerarySyncV2Enabled,
    notifyTripChanged,
  } = deps

  const {
    syncRenderKey,
    tripDates,
    flights,
    hotel,
    hotelCandidates,
    days,
    customPlaces,
    itineraryGenerated,
    itineraryFingerprint,
    recommendationPreferences,
    dayIndex,
    selectedPlaceId,
  } = state

  const {
    setTripDates,
    setFlights,
    setHotel,
    setHotelCandidates,
    setViewingHotelDetail,
    setItineraryStart,
    setItineraryStartLoading,
    setItineraryGenerated,
    setItineraryFingerprint,
    setItineraryGenerating,
    setItineraryGenError,
    setDayRegenerating,
    setDayRegenError,
    setDayRestoring,
    setCopyRefreshing,
    setRecommendationPreferences,
    setDays,
    setCustomPlaces,
    setDayIndex,
    setSelectedPlaceId,
    setSyncRenderKey,
  } = setters

  const {
    prevStopsKeyRef,
    suppressCopyRef,
    copyRequestIdRef,
    tripInputsHydratedRef,
    remoteHydrationRenderKeyRef,
  } = refs

  // Snapshot of selection/day while remote sync reads them.
  const dayIndexRef = useRef(dayIndex)
  const daysRef = useRef(days)
  const customPlacesRef = useRef(customPlaces)
  const selectedPlaceIdRef = useRef(selectedPlaceId)
  dayIndexRef.current = dayIndex
  daysRef.current = days
  customPlacesRef.current = customPlaces
  selectedPlaceIdRef.current = selectedPlaceId

  useEffect(() => {
    if (tripSyncEpoch <= 0) return

    const viewingDayNum = daysRef.current[dayIndexRef.current]?.day
    const prevSelected = selectedPlaceIdRef.current

    const nextHotels = initialHotelState()
    const nextFlights = initialFlightsState()
    const nextDates = loadTripDates()
    const nextItinerary = loadItineraryState()
    const nextRecommendationPreferences = loadRecommendationPreferences()
    ensureBaselineFromGenerated(nextItinerary)

    // Cancel local work so stale completions/animation timers can't write
    // the pre-sync itinerary back into the newly hydrated React state.
    handlers.cancelInFlightGeneration()
    copyRequestIdRef.current += 1
    clearDayNavCache()

    tripInputsHydratedRef.current = true

    setHotel(nextHotels.hotel)
    setHotelCandidates(nextHotels.candidates)
    setTripDates(nextDates)
    setFlights(nextFlights)
    const resolvedStart =
      nextDates?.startDate && nextFlights.outbound?.flightNumber
        ? resolveItineraryStartSync({
            tripStartDate: nextDates.startDate,
            tripEndDate: nextDates.endDate,
            destination: '巴黎',
            hotelName: nextHotels.hotel ? nextHotels.hotel.name : null,
            outbound: nextFlights.outbound,
            returnFlight: nextFlights.returnFlight,
          })
        : null
    setItineraryStart(resolvedStart)
    setItineraryStartLoading(false)
    const nextDays = itinerarySyncV2Enabled
      ? daysRef.current
      : nextItinerary.days
    const nextCustomPlaces = itinerarySyncV2Enabled
      ? { ...(nextItinerary.customPlaces || {}), ...customPlacesRef.current }
      : nextItinerary.customPlaces || {}
    setDays(nextDays)
    setCustomPlaces(nextCustomPlaces)
    setItineraryGenerated(Boolean(nextItinerary.generated))
    setItineraryFingerprint(nextItinerary.fingerprint ?? null)
    setRecommendationPreferences(nextRecommendationPreferences)
    setItineraryGenerating(false)
    setItineraryGenError(null)
    setDayRegenerating(false)
    setDayRegenError(null)
    setDayRestoring(false)
    setCopyRefreshing(false)
    setViewingHotelDetail(null)
    setSyncRenderKey((key) => {
      const nextKey = key + 1
      remoteHydrationRenderKeyRef.current = nextKey
      return nextKey
    })
    prevStopsKeyRef.current = null
    suppressCopyRef.current = true

    let nextIndex = 0
    if (viewingDayNum != null && nextDays.length) {
      const byNum = nextDays.findIndex((d) => d.day === viewingDayNum)
      if (byNum >= 0) nextIndex = byNum
      else nextIndex = Math.min(dayIndexRef.current, nextDays.length - 1)
    }
    setDayIndex(nextIndex)

    const stillOnDay = prevSelected
      ? nextDays[nextIndex]?.stops.some((s) => s.placeId === prevSelected)
      : false
    const stillInCustom = prevSelected
      ? Boolean(nextCustomPlaces[prevSelected])
      : false
    const isHotel = prevSelected === SELECTED_HOTEL_PLACE_ID
    setSelectedPlaceId(
      prevSelected && (stillOnDay || stillInCustom || isHotel) ? prevSelected : null,
    )

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripSyncEpoch])

  useEffect(() => {
    if (itinerarySyncV2Enabled) return
    if (!canEdit) return
    // This render was produced by applying authoritative remote state. It is
    // not a local edit and must not start a save transaction. The marker is
    // cleared after all itinerary-derived effects have also skipped this render.
    if (remoteHydrationRenderKeyRef.current === syncRenderKey) return
    // The cloud writer owns no-op detection against the last reconciled snapshot.
    // Always notify it here: time-based/"skip N renders" guards can swallow a
    // genuine edit made immediately after a remote update.
    notifyTripChanged()
  }, [
    tripDates,
    flights,
    hotel,
    hotelCandidates,
    days,
    customPlaces,
    itineraryGenerated,
    itineraryFingerprint,
    recommendationPreferences,
    syncRenderKey,
    canEdit,
    notifyTripChanged,
    remoteHydrationRenderKeyRef,
    itinerarySyncV2Enabled,
  ])

  // Under protocol V2, itinerary edits are persisted as operations. Legacy
  // snapshots remain responsible for the rest of the trip without turning
  // every stop movement into a second full-document upload.
  useEffect(() => {
    if (!itinerarySyncV2Enabled || !canEdit) return
    if (remoteHydrationRenderKeyRef.current === syncRenderKey) return
    notifyTripChanged()
  }, [
    tripDates,
    flights,
    hotel,
    hotelCandidates,
    itineraryGenerated,
    itineraryFingerprint,
    recommendationPreferences,
    syncRenderKey,
    canEdit,
    itinerarySyncV2Enabled,
    notifyTripChanged,
    remoteHydrationRenderKeyRef,
  ])

  useEffect(() => {
    const flush = () => {
      void flushTripCloudSave({ urgent: true })
    }
    window.addEventListener('beforeunload', flush)
    return () => window.removeEventListener('beforeunload', flush)
  }, [])
}

