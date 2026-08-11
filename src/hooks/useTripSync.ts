import { useEffect, useRef } from 'react'
import type { FlightSelection } from '../features/flight/components/FlightPanel'
import type { HotelCandidate, Place, SelectedHotel } from '../types'
import type { DayPlan } from '../types'
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

export interface UseTripSyncDeps {
  tripSyncEpoch: number
  canEdit: boolean
  notifyTripChanged: (opts?: {
    force?: boolean
    artifactsOnly?: boolean
    allowEmptyTrip?: boolean
  }) => void
}

export interface UseTripSyncState {
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
  suppressCloudSaveRef: React.MutableRefObject<boolean>
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
    notifyTripChanged,
  } = deps

  const {
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
    suppressCloudSaveRef,
  } = refs

  // Snapshot of selection/day while remote sync reads them.
  const dayIndexRef = useRef(dayIndex)
  const daysRef = useRef(days)
  const selectedPlaceIdRef = useRef(selectedPlaceId)
  dayIndexRef.current = dayIndex
  daysRef.current = days
  selectedPlaceIdRef.current = selectedPlaceId

  const cloudSaveSkipRunsRef = useRef(2)
  const cloudHydratedAtRef = useRef(Date.now())

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
    suppressCloudSaveRef.current = false

    setHotel(nextHotels.hotel)
    setHotelCandidates(nextHotels.candidates)
    setTripDates(nextDates)
    setFlights(nextFlights)
    setItineraryStart(null)
    setItineraryStartLoading(
      Boolean(nextDates?.startDate && nextFlights.outbound?.flightNumber),
    )
    setDays(nextItinerary.days)
    setCustomPlaces(nextItinerary.customPlaces)
    setItineraryGenerated(Boolean(nextItinerary.generated && nextItinerary.days.length))
    setItineraryFingerprint(nextItinerary.fingerprint || null)
    setRecommendationPreferences(nextRecommendationPreferences)
    setItineraryGenerating(false)
    setItineraryGenError(null)
    setDayRegenerating(false)
    setDayRegenError(null)
    setDayRestoring(false)
    setCopyRefreshing(false)
    setViewingHotelDetail(null)
    setSyncRenderKey((key) => key + 1)
    prevStopsKeyRef.current = null
    suppressCopyRef.current = true

    const nextDays = nextItinerary.days
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
      ? Boolean(nextItinerary.customPlaces?.[prevSelected])
      : false
    const isHotel = prevSelected === SELECTED_HOTEL_PLACE_ID
    setSelectedPlaceId(
      prevSelected && (stillOnDay || stillInCustom || isHotel) ? prevSelected : null,
    )

    cloudSaveSkipRunsRef.current = 2
    cloudHydratedAtRef.current = Date.now()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripSyncEpoch])

  useEffect(() => {
    if (cloudSaveSkipRunsRef.current > 0) {
      cloudSaveSkipRunsRef.current -= 1
      return
    }
    if (Date.now() - cloudHydratedAtRef.current < 2000) return
    if (suppressCloudSaveRef.current) {
      suppressCloudSaveRef.current = false
      return
    }
    if (!canEdit) return
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
    canEdit,
    notifyTripChanged,
  ])

  useEffect(() => {
    const flush = () => {
      void flushTripCloudSave()
    }
    window.addEventListener('beforeunload', flush)
    return () => window.removeEventListener('beforeunload', flush)
  }, [])
}

