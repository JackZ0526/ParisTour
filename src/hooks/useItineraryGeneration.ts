/**
 * useItineraryGeneration — plan generation lifecycle.
 *
 * Owns:
 *   - itineraryStart + itineraryStartLoading (LLM start-date resolve)
 *   - itineraryGenerated + itineraryFingerprint (plan identity)
 *   - itineraryGenerating / itineraryGenError (full-plan status)
 *   - dayRegenerating / dayRegenError / dayRestoring (single-day status)
 *   - itineraryLoadingLineIndex
 *
 * Effects:
 *   - start resolve (LLM call)
 *   - persist days + fingerprint to localStorage
 *   - fingerprint gate (wipe stale plans when trip inputs change)
 *   - size resize (match days.length to numberOfDays)
 *   - first-expand auto-generate
 *   - loading line rotation
 *
 * Handlers:
 *   - runFullItineraryGeneration
 *   - handleResetDay
 *   - handleRegenerateItinerary
 *   - handleRestoreDefault
 *   - handleRestoreDayDefault
 *
 * Does NOT own:
 *   - days / customPlaces (passed in as deps; mutations stay in App.tsx for now)
 *   - dayIndex / selectedPlaceId (→ App.tsx for now; useItineraryDays later)
 *   - tripDates / flights / hotel (→ useTripCore)
 *   - Cloud sync / autosave (stays in App.tsx)
 *
 * Why pass deps: the fingerprint gate / save state / first expand all
 * read or write days. Passing them in keeps the hook self-contained
 * without needing module-level state for coordination.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'
import {
  buildGeneratedItinerary,
  buildGeneratedSingleDay,
  flightContextBrief,
} from '../features/itinerary/services/itineraryGenerate'
import {
  AREA_KEY_CN,
  ITINERARY_LOADING_LINES,
  ITINERARY_LOADING_ROTATE_MS,
  clampIsoDate,
  dateForTripDay,
  hotelAreaShort,
  initialFlightsState,
  itineraryMissingLabels,
  saveBaselineItinerary,
  saveItineraryState,
  syncDaysCopyToHotelArea,
  wipeGeneratedItinerary,
} from '../appHelpers'
import {
  itineraryDayCount,
  loadTripDates,
} from '../features/itinerary/services/tripDates'
import { clearDayNavCache } from '../features/itinerary/hooks/useDayNav'
import {
  buildItineraryFingerprint,
  ensureBaselineFromGenerated,
  fingerprintTripInputsEqual,
  fingerprintsEqual,
  hasBaselineDay,
  hasMatchingBaseline,
  hasUsableGeneratedItinerary,
  isRemoteQuietPeriodActive,
  loadItineraryState,
  resizeItineraryToLength,
  restoreDayFromBaseline,
  restoreFullFromBaseline,
  type ItineraryInputFingerprint,
} from '../features/itinerary/utils/itineraryState'
import { getPlace } from '../features/place/constants/places'
import {
  isLlmConfigured,
  resolveItineraryStart,
  type ItineraryStartResult,
} from '../shared/services/llm/llm'
import type { DayPlan, Place, SelectedHotel } from '../types'
import type { FlightSelection } from '../features/flight/components/FlightPanel'
import type { TripDateRange } from '../features/itinerary/services/tripDates'
import type { RecommendationPreferences } from '../features/place/services/recommendationPreferences'

export interface UseItineraryGenerationDeps {
  tripDates: TripDateRange | null
  flights: FlightSelection
  hotel: SelectedHotel
  hotelReady: boolean
  destination: string
  readOnly: boolean
  days: DayPlan[]
  customPlaces: Record<string, Place>
  /** placesWithHotel (customPlaces + hotel-as-place) for occupiedPlaces derivation in handleResetDay. */
  placesWithHotel: Record<string, Place>
  recommendationPreferences: RecommendationPreferences
}

export interface UseItineraryGenerationSetters {
  setDays: Dispatch<SetStateAction<DayPlan[]>>
  setCustomPlaces: Dispatch<SetStateAction<Record<string, Place>>>
  setDayIndex: Dispatch<SetStateAction<number>>
  setSelectedPlaceId: Dispatch<SetStateAction<string | null>>
}

export interface UseItineraryGenerationResult {
  itineraryStart: ItineraryStartResult | null
  itineraryStartLoading: boolean
  itineraryGenerated: boolean
  itineraryFingerprint: ItineraryInputFingerprint | null
  itineraryGenerating: boolean
  itineraryGenError: string | null
  dayRegenerating: boolean
  dayRegenError: string | null
  dayRestoring: boolean
  itineraryLoadingLine: string
  itineraryStartDate: string | undefined
  numberOfDays: number
  currentFingerprint: ItineraryInputFingerprint | null
  itineraryReady: boolean
  missingForItinerary: string[]
  canRestoreDefault: boolean
  canRestoreDayDefault: boolean
  showItineraryLoading: boolean
  showItineraryContent: boolean
  showItineraryError: boolean
  runFullItineraryGeneration: () => Promise<void>
  handleResetDay: (dayIndex: number) => Promise<void>
  handleRegenerateItinerary: () => void
  handleRestoreDefault: () => void
  handleRestoreDayDefault: (dayIndex: number) => void
  // External mutation hooks (for useTripSync to call after a remote
  // snapshot reconciliation; no-op wrappers around the setters so
  // App.tsx doesn't have to plumb 10 individual setX through).
  setItineraryStart: Dispatch<SetStateAction<ItineraryStartResult | null>>
  setItineraryStartLoading: Dispatch<SetStateAction<boolean>>
  setItineraryGenerated: Dispatch<SetStateAction<boolean>>
  setItineraryFingerprint: Dispatch<SetStateAction<ItineraryInputFingerprint | null>>
  setItineraryGenerating: Dispatch<SetStateAction<boolean>>
  setItineraryGenError: Dispatch<SetStateAction<string | null>>
  setDayRegenerating: Dispatch<SetStateAction<boolean>>
  setDayRegenError: Dispatch<SetStateAction<string | null>>
  setDayRestoring: Dispatch<SetStateAction<boolean>>
  setCopyRefreshing: Dispatch<SetStateAction<boolean>>
}

export function useItineraryGeneration(
  deps: UseItineraryGenerationDeps,
  setters: UseItineraryGenerationSetters,
): UseItineraryGenerationResult {
  const {
    tripDates,
    flights,
    hotel,
    hotelReady,
    destination,
    readOnly,
    days,
    customPlaces,
    placesWithHotel,
    recommendationPreferences,
  } = deps
  const { setDays, setCustomPlaces, setDayIndex, setSelectedPlaceId } = setters

  // -- State -----------------------------------------------------------------
  const [itineraryStart, setItineraryStart] = useState<ItineraryStartResult | null>(null)
  // True on first paint when outbound+dates exist so fingerprint gates wait for resolve.
  const [itineraryStartLoading, setItineraryStartLoading] = useState(() =>
    Boolean(loadTripDates()?.startDate && initialFlightsState().outbound?.flightNumber),
  )
  const [itineraryGenerated, setItineraryGenerated] = useState(() => {
    // Mirror App.tsx's pre-4.3 initial load: read generated + days from
    // localStorage so a refresh doesn't trigger hasUsableGeneratedItinerary
    // to return false and force a re-generate of the saved plan.
    const state = loadItineraryState()
    ensureBaselineFromGenerated(state)
    return Boolean(state.generated && state.days.length)
  })
  const [itineraryFingerprint, setItineraryFingerprint] =
    useState<ItineraryInputFingerprint | null>(() => {
      const state = loadItineraryState()
      return state.fingerprint || null
    })
  const [itineraryGenerating, setItineraryGenerating] = useState(false)
  const [itineraryGenError, setItineraryGenError] = useState<string | null>(null)
  const [dayRegenerating, setDayRegenerating] = useState(false)
  const [dayRegenError, setDayRegenError] = useState<string | null>(null)
  const [dayRestoring, setDayRestoring] = useState(false)
  const [itineraryLoadingLineIndex, setItineraryLoadingLineIndex] = useState(
    () => Math.floor(Math.random() * ITINERARY_LOADING_LINES.length),
  )

  // -- Refs ------------------------------------------------------------------
  const genRequestIdRef = useRef(0)
  const dayRegenRequestIdRef = useRef(0)
  const dayRestoreTimerRef = useRef<number | null>(null)

  // -- Computed --------------------------------------------------------------
  const itineraryStartDate = useMemo(() => {
    if (!tripDates?.endDate) {
      return itineraryStart?.itineraryStartDate || tripDates?.startDate || undefined
    }
    const raw =
      itineraryStart?.itineraryStartDate || tripDates.startDate || undefined
    if (!raw) return undefined
    return clampIsoDate(raw, tripDates.startDate || raw, tripDates.endDate)
  }, [
    itineraryStart?.itineraryStartDate,
    tripDates?.startDate,
    tripDates?.endDate,
  ])

  const numberOfDays = useMemo(() => {
    if (!tripDates?.startDate || !tripDates?.endDate) {
      return Math.max(1, days.length || 1)
    }
    const start = itineraryStartDate || tripDates.startDate
    return itineraryDayCount(start, tripDates.endDate)
  }, [tripDates?.startDate, tripDates?.endDate, itineraryStartDate, days.length])

  const currentFingerprint = useMemo(() => {
    if (!tripDates?.startDate || !tripDates?.endDate || !hotelReady) return null
    if (
      !flights.outbound?.flightNumber?.trim() ||
      !flights.returnFlight?.flightNumber?.trim()
    ) {
      return null
    }
    return buildItineraryFingerprint({
      hotelId: hotel.id,
      startDate: tripDates.startDate,
      endDate: tripDates.endDate,
      itineraryStartDate: itineraryStartDate || tripDates.startDate,
      outboundFlight: flights.outbound.flightNumber,
      returnFlight: flights.returnFlight.flightNumber,
    })
  }, [
    tripDates?.startDate,
    tripDates?.endDate,
    hotelReady,
    hotel.id,
    itineraryStartDate,
    flights.outbound?.flightNumber,
    flights.returnFlight?.flightNumber,
  ])

  const datesReady = Boolean(tripDates?.startDate && tripDates?.endDate)
  const outboundReady = Boolean(flights.outbound?.flightNumber?.trim())
  const returnReady = Boolean(flights.returnFlight?.flightNumber?.trim())
  const flightsReady = outboundReady && returnReady
  const itineraryReady = datesReady && flightsReady && hotelReady
  const missingForItinerary = itineraryMissingLabels({
    datesReady,
    outboundReady,
    returnReady,
    hotelReady,
  })

  // -- Effects ---------------------------------------------------------------
  // Cleanup pending day-restore timers on unmount.
  useEffect(() => {
    return () => {
      if (dayRestoreTimerRef.current != null) {
        window.clearTimeout(dayRestoreTimerRef.current)
      }
    }
  }, [])

  // Resolve Paris arrival / Day 1 calendar start from outbound flight + dates.
  useEffect(() => {
    if (!tripDates?.startDate || !flights.outbound?.flightNumber) {
      setItineraryStart(null)
      setItineraryStartLoading(false)
      return
    }

    let cancelled = false
    setItineraryStartLoading(true)
    const timer = window.setTimeout(() => {
      void resolveItineraryStart({
        tripStartDate: tripDates.startDate,
        tripEndDate: tripDates.endDate,
        destination,
        hotelName: hotelReady ? hotel.name : null,
        outbound: {
          flightNumber: flights.outbound!.flightNumber,
          airline: flights.outbound!.airline,
          from: flights.outbound!.from,
          to: flights.outbound!.to,
          duration: flights.outbound!.duration,
          status: flights.outbound!.status,
          rawNote: flights.outbound!.rawNote,
        },
      })
        .then((result) => {
          if (cancelled) return
          setItineraryStart(result)
        })
        .catch(() => {
          if (cancelled) return
          setItineraryStart(null)
        })
        .finally(() => {
          if (!cancelled) setItineraryStartLoading(false)
        })
    }, 280)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [
    tripDates?.startDate,
    tripDates?.endDate,
    flights.outbound,
    destination,
    hotelReady,
    hotel.name,
  ])

  // Persist current days + customPlaces + fingerprint.
  useEffect(() => {
    saveItineraryState(days, customPlaces, {
      generated: itineraryGenerated,
      fingerprint: itineraryFingerprint ?? undefined,
    })
  }, [days, customPlaces, itineraryGenerated, itineraryFingerprint])

  // Fingerprint gate: when hotel / dates / flights change after a plan was
  // generated, wipe so the next expand regenerates.
  useEffect(() => {
    if (!itineraryReady || itineraryStartLoading || !currentFingerprint) return
    if (isRemoteQuietPeriodActive()) return

    const wipePlan = () => {
      genRequestIdRef.current += 1
      dayRegenRequestIdRef.current += 1
      wipeGeneratedItinerary()
      clearDayNavCache()
      setDays([])
      setCustomPlaces({})
      setItineraryGenerated(false)
      setItineraryFingerprint(null)
      setItineraryGenError(null)
      setItineraryGenerating(false)
      setDayRegenerating(false)
      setDayRegenError(null)
      setSelectedPlaceId(null)
      setDayIndex(0)
    }

    if (!itineraryGenerated) return
    if (fingerprintsEqual(itineraryFingerprint, currentFingerprint)) return
    if (
      itineraryFingerprint &&
      fingerprintTripInputsEqual(itineraryFingerprint, currentFingerprint)
    ) {
      setItineraryFingerprint(currentFingerprint)
      return
    }
    wipePlan()
  }, [
    currentFingerprint,
    itineraryGenerated,
    itineraryFingerprint,
    itineraryReady,
    itineraryStartLoading,
    setDays,
    setCustomPlaces,
    setDayIndex,
    setSelectedPlaceId,
  ])

  // Keep day tabs in sync with computed itinerary length.
  useEffect(() => {
    if (!tripDates?.startDate || !tripDates?.endDate) return
    if (!itineraryGenerated) return
    setDays((prev) => {
      if (!prev.length) return prev
      const next = resizeItineraryToLength(prev, numberOfDays)
      return next === prev ? prev : next
    })
    setDayIndex((i) => {
      const max = Math.max(0, numberOfDays - 1)
      return i > max ? max : i
    })
  }, [
    numberOfDays,
    tripDates?.startDate,
    tripDates?.endDate,
    itineraryGenerated,
    setDays,
    setDayIndex,
  ])

  // -- Handlers --------------------------------------------------------------
  const runFullItineraryGeneration = useCallback(async () => {
    if (!tripDates?.startDate || !tripDates?.endDate || !hotelReady) return
    if (!isLlmConfigured()) {
      setItineraryGenError('暂时无法生成行程，请稍后再试。')
      return
    }

    const fingerprint = buildItineraryFingerprint({
      hotelId: hotel.id,
      startDate: tripDates.startDate,
      endDate: tripDates.endDate,
      itineraryStartDate: itineraryStartDate || tripDates.startDate,
      outboundFlight: flights.outbound?.flightNumber,
      returnFlight: flights.returnFlight?.flightNumber,
    })

    const requestId = ++genRequestIdRef.current
    setItineraryGenerating(true)
    setItineraryGenError(null)

    try {
      const areaLabel =
        AREA_KEY_CN[hotel.areaKey] || hotelAreaShort(hotel) || hotel.areaKey
      const result = await buildGeneratedItinerary({
        destination,
        dayCount: numberOfDays,
        tripStartDate: tripDates.startDate,
        tripEndDate: tripDates.endDate,
        itineraryStartDate: itineraryStartDate || tripDates.startDate,
        nights: Math.max(0, numberOfDays - 1),
        hotel: {
          ...hotel,
          area: areaLabel || undefined,
        },
        outbound: flightContextBrief(flights.outbound),
        returnFlight: flightContextBrief(flights.returnFlight),
        recommendationPreferences,
      })

      if (requestId !== genRequestIdRef.current) return

      const synced = syncDaysCopyToHotelArea(result.days, hotel.areaKey)
      setDays(synced)
      setCustomPlaces(result.customPlaces)
      setItineraryGenerated(true)
      setItineraryFingerprint(fingerprint)
      saveBaselineItinerary(synced, result.customPlaces, fingerprint)
      saveItineraryState(synced, result.customPlaces, {
        generated: true,
        fingerprint,
      })
      setDayIndex(0)
      setSelectedPlaceId(null)
      setItineraryGenError(null)
    } catch (err) {
      if (requestId !== genRequestIdRef.current) return
      setItineraryGenError(
        err instanceof Error ? err.message : '行程生成失败，请再试一次。',
      )
    } finally {
      if (requestId === genRequestIdRef.current) {
        setItineraryGenerating(false)
      }
    }
  }, [
    tripDates?.startDate,
    tripDates?.endDate,
    hotelReady,
    hotel,
    itineraryStartDate,
    flights.outbound,
    flights.returnFlight,
    numberOfDays,
    destination,
    recommendationPreferences,
    setDays,
    setCustomPlaces,
    setDayIndex,
    setSelectedPlaceId,
  ])

  // First expand: auto-generate full itinerary if none saved.
  useEffect(() => {
    if (readOnly) return
    if (!itineraryReady) return
    if (itineraryStartLoading) return
    if (itineraryGenerating) return
    if (itineraryGenError) return

    const usable = hasUsableGeneratedItinerary(
      {
        days,
        customPlaces,
        generated: itineraryGenerated,
        fingerprint: itineraryFingerprint || undefined,
      },
      currentFingerprint,
    )
    if (usable) return

    void runFullItineraryGeneration()
  }, [
    readOnly,
    itineraryReady,
    itineraryStartLoading,
    itineraryGenerating,
    itineraryGenError,
    days,
    customPlaces,
    itineraryGenerated,
    itineraryFingerprint,
    currentFingerprint,
    runFullItineraryGeneration,
  ])

  const handleResetDay = useCallback(
    async (dayIndex: number) => {
      if (!tripDates?.startDate || !tripDates?.endDate || !hotelReady) return
      if (!itineraryGenerated || !days.length) return
      if (dayRegenerating || itineraryGenerating) return
      if (!isLlmConfigured()) {
        setDayRegenError('暂时无法重新生成当天行程，请稍后再试。')
        return
      }

      const active = days[dayIndex]
      if (!active) return

      const requestId = ++dayRegenRequestIdRef.current
      setDayRegenerating(true)
      setDayRegenError(null)

      const occupiedPlaces = days
        .filter((d) => d.day !== active.day)
        .flatMap((d) =>
          d.stops
            .map((s) => {
              try {
                const place = getPlace(s.placeId, placesWithHotel)
                return {
                  day: d.day,
                  name: place.name,
                  placeId: s.placeId,
                  type: place.type,
                }
              } catch {
                return null
              }
            })
            .filter((row): row is NonNullable<typeof row> => Boolean(row)),
        )

      try {
        const areaLabel =
          AREA_KEY_CN[hotel.areaKey] || hotelAreaShort(hotel) || hotel.areaKey
        const calendarDate =
          dateForTripDay(itineraryStartDate, active.day) || undefined
        const result = await buildGeneratedSingleDay({
          destination,
          dayCount: numberOfDays,
          dayNumber: active.day,
          calendarDate,
          tripStartDate: tripDates.startDate,
          tripEndDate: tripDates.endDate,
          itineraryStartDate: itineraryStartDate || tripDates.startDate,
          nights: Math.max(0, numberOfDays - 1),
          hotel,
          hotelAreaLabel: areaLabel || undefined,
          outbound: flightContextBrief(flights.outbound),
          returnFlight: flightContextBrief(flights.returnFlight),
          occupiedPlaces,
          existingDays: days,
          existingCustomPlaces: customPlaces,
          recommendationPreferences,
        })

        if (requestId !== dayRegenRequestIdRef.current) return

        const synced = syncDaysCopyToHotelArea(result.days, hotel.areaKey)
        setDays(synced)
        setCustomPlaces(result.customPlaces)
        setItineraryGenerated(true)
        saveItineraryState(synced, result.customPlaces, {
          generated: true,
          fingerprint: itineraryFingerprint,
        })
        setSelectedPlaceId(null)
        setDayRegenError(null)
      } catch (err) {
        if (requestId !== dayRegenRequestIdRef.current) return
        setDayRegenError(
          err instanceof Error ? err.message : '当天行程重新生成失败，请再试一次。',
        )
      } finally {
        if (requestId === dayRegenRequestIdRef.current) {
          setDayRegenerating(false)
        }
      }
    },
    [
      tripDates?.startDate,
      tripDates?.endDate,
      hotelReady,
      itineraryGenerated,
      days,
      dayRegenerating,
      itineraryGenerating,
      hotel,
      itineraryStartDate,
      flights.outbound,
      flights.returnFlight,
      numberOfDays,
      destination,
      placesWithHotel,
      customPlaces,
      itineraryFingerprint,
      recommendationPreferences,
      setDays,
      setCustomPlaces,
      setSelectedPlaceId,
    ],
  )

  const handleRegenerateItinerary = useCallback(() => {
    genRequestIdRef.current += 1
    dayRegenRequestIdRef.current += 1
    wipeGeneratedItinerary()
    clearDayNavCache()
    setDays([])
    setCustomPlaces({})
    setItineraryGenerated(false)
    setItineraryFingerprint(null)
    setItineraryGenError(null)
    setItineraryGenerating(false)
    setDayRegenerating(false)
    setDayRegenError(null)
    setSelectedPlaceId(null)
    setDayIndex(0)
  }, [setDays, setCustomPlaces, setDayIndex, setSelectedPlaceId])

  const handleRestoreDefault = useCallback(() => {
    const restored = restoreFullFromBaseline()
    if (!restored) return
    setDays(restored.days)
    setCustomPlaces(restored.customPlaces)
    setItineraryGenerated(true)
    const fp = restored.fingerprint || itineraryFingerprint || currentFingerprint
    if (fp) setItineraryFingerprint(fp)
    saveItineraryState(restored.days, restored.customPlaces, {
      generated: true,
      fingerprint: fp,
    })
    setSelectedPlaceId(null)
    setDayIndex((i) => Math.min(i, Math.max(0, restored.days.length - 1)))
    setItineraryGenError(null)
    setDayRegenError(null)
  }, [
    itineraryFingerprint,
    currentFingerprint,
    setDays,
    setCustomPlaces,
    setDayIndex,
    setSelectedPlaceId,
  ])

  const handleRestoreDayDefault = useCallback(
    (dayIndex: number) => {
      if (dayRestoring || dayRestoreTimerRef.current != null) return
      const dayNum = days[dayIndex]?.day
      if (dayNum == null) return
      const restored = restoreDayFromBaseline(dayNum, days, customPlaces)
      if (!restored) return

      setDayRestoring(true)
      setDays(restored.days)
      setCustomPlaces(restored.customPlaces)
      saveItineraryState(restored.days, restored.customPlaces, {
        generated: true,
        fingerprint: itineraryFingerprint,
      })
      setSelectedPlaceId(null)
      setDayRegenError(null)

      dayRestoreTimerRef.current = window.setTimeout(() => {
        dayRestoreTimerRef.current = null
        setDayRestoring(false)
      }, 800)
    },
    [
      dayRestoring,
      days,
      customPlaces,
      itineraryFingerprint,
      setDays,
      setCustomPlaces,
      setSelectedPlaceId,
    ],
  )

  // -- Loading line rotation --------------------------------------------------
  const showItineraryLoading =
    itineraryReady && (itineraryGenerating || (itineraryStartLoading && !itineraryGenerated))
  useEffect(() => {
    if (!showItineraryLoading) return
    setItineraryLoadingLineIndex(
      Math.floor(Math.random() * ITINERARY_LOADING_LINES.length),
    )
    const id = window.setInterval(() => {
      setItineraryLoadingLineIndex(
        (i) => (i + 1) % ITINERARY_LOADING_LINES.length,
      )
    }, ITINERARY_LOADING_ROTATE_MS)
    return () => window.clearInterval(id)
  }, [showItineraryLoading])

  const itineraryLoadingLine =
    ITINERARY_LOADING_LINES[itineraryLoadingLineIndex] ?? ITINERARY_LOADING_LINES[0]

  // -- Restore gating --------------------------------------------------------
  const canRestoreDefault = hasMatchingBaseline(
    itineraryFingerprint || currentFingerprint,
  )
  const canRestoreDayDefault = hasBaselineDay(
    days[Math.min(Math.max(0, 0), days.length - 1)]?.day ?? 0,
    itineraryFingerprint || currentFingerprint,
  )

  const showItineraryContent =
    itineraryReady && itineraryGenerated && days.length > 0 && !itineraryGenerating
  const showItineraryError =
    itineraryReady && !itineraryGenerating && Boolean(itineraryGenError) && !itineraryGenerated

  return {
    itineraryStart,
    itineraryStartLoading,
    itineraryGenerated,
    itineraryFingerprint,
    itineraryGenerating,
    itineraryGenError,
    dayRegenerating,
    dayRegenError,
    dayRestoring,
    itineraryLoadingLine,
    itineraryStartDate,
    numberOfDays,
    currentFingerprint,
    itineraryReady,
    missingForItinerary,
    canRestoreDefault,
    canRestoreDayDefault,
    showItineraryLoading,
    showItineraryContent,
    showItineraryError,
    runFullItineraryGeneration,
    handleResetDay,
    handleRegenerateItinerary,
    handleRestoreDefault,
    handleRestoreDayDefault,
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
  }
}
