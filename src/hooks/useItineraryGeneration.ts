/**
 * useItineraryGeneration — plan generation lifecycle.
 *
 * Owns:
 *   - itineraryStart + itineraryStartLoading (LLM start-date resolve)
 *   - itineraryGenerated + itineraryFingerprint (plan identity)
 *   - itineraryGenerating / itineraryGenError (full-plan status)
 *   - dayRegenerating / dayRegenError / dayRestoring (single-day status)
 *   - copyRefreshing (day-copy HUD; toggled from App.tsx effect)
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
  buildGeneratedSingleDay,
  flightContextBrief,
  getSharedItineraryCandidates,
} from '../features/itinerary/services/itineraryGenerate'
import {
  detectLocaleFromDays,
  translateItineraryText,
} from '../shared/services/llm/business/itinerary'
import {
  AREA_KEY_CN,
  ITINERARY_LOADING_ROTATE_MS,
  dateForTripDay,
  getItineraryGeneratingLines,
  hotelAreaShort,
  initialFlightsState,
  itineraryMissingLabels,
  syncDaysCopyToHotelArea,
} from '../appHelpers'
import { isRemoteQuietPeriodActive, holdTripCloudSaves, releaseTripCloudSaves } from '../features/cloud-sync/services/tripCloud'
import {
  clampIsoDate,
  itineraryDayCount,
  loadTripDates,
} from '../features/itinerary/services/tripDates'
import { clearDayNavCache } from '../features/itinerary/hooks/useDayNav'
import { placeFromHotel, SELECTED_HOTEL_PLACE_ID } from '../features/itinerary/utils/dayOrigin'
import {
  buildItineraryFingerprint,
  ensureBaselineFromGenerated,
  fingerprintTripInputsEqual,
  fingerprintsEqual,
  hasBaselineDay,
  hasMatchingBaseline,
  hasUsableGeneratedItinerary,
  emptyItinerary,
  loadItineraryState,
  resizeItineraryToLength,
  restoreDayFromBaseline,
  restoreFullFromBaseline,
  saveBaselineItinerary,
  saveItineraryState,
  wipeGeneratedItinerary,
  type ItineraryInputFingerprint,
} from '../features/itinerary/utils/itineraryState'
import { getPlace } from '../features/place/constants/places'
import {
  isLlmConfigured,
  resolveItineraryStartSync,
  type ItineraryStartResult,
} from '../shared/services/llm/llm'
import { LlmRequestError } from '../shared/services/llm/errors'
import { getOpenAIModel } from '../shared/services/llm/model-state'
import { useTranslation, type Locale } from '../shared/i18n'
import type { DayPlan, Place, SelectedHotel } from '../types'
import type { FlightSelection } from '../features/flight/services/flightSelection'
import type { TripDateRange } from '../features/itinerary/services/tripDates'
import type { RecommendationPreferences } from '../features/place/services/recommendationPreferences'

/** User-facing Chinese summary plus concrete debug detail for itinerary failures. */
function formatItineraryFailure(err: unknown, fallback: string): string {
  if (err instanceof LlmRequestError) {
    const lines = [err.message.trim() || fallback]
    const meta = [
      err.code ? `code=${err.code}` : '',
      err.status != null ? `HTTP ${err.status}` : '',
      `model=${getOpenAIModel()}`,
    ].filter(Boolean)
    const alreadyHasMeta = /code=|finish_reason=|model=|HTTP\s+\d+/.test(err.message)
    if (!alreadyHasMeta && meta.length) {
      lines.push(meta.join(' · '))
    }
    return lines.join('\n')
  }
  if (err instanceof Error && err.message.trim()) {
    return `${err.message.trim()}\nmodel=${getOpenAIModel()}`
  }
  return `${fallback}\nmodel=${getOpenAIModel()}`
}

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
  /** True while generating the multi-day plan sequentially. */
  itineraryIncrementalGenerating: boolean
  /** Highest day number (1-based) that has finished LLM generation. */
  itineraryGeneratedUpToDay: number
  itineraryGenError: string | null
  dayRegenerating: boolean
  dayRegenError: string | null
  dayRestoring: boolean
  /**
   * True when the current itinerary generation cycle was triggered
   * automatically by a locale change (vs. a manual "regenerate" click).
   * UI can show a small "auto-regenerating in <lang>" badge during the run.
   */
  autoRegenOnLocaleChange: boolean
  itineraryLoadingLine: string
  itineraryLoadingLineIndex: number
  itineraryStartDate: string | undefined
  numberOfDays: number
  currentFingerprint: ItineraryInputFingerprint | null
  itineraryReady: boolean
  missingForItinerary: string[]
  canRestoreDefault: boolean
  canRestoreDayDefault: boolean
  /** True while a given day is still waiting on LLM generation. */
  isDayGenerationPending: (dayNumber: number) => boolean
  showItineraryLoading: boolean
  showItineraryContent: boolean
  showItineraryError: boolean
  /** Day 1+ succeeded but a later day failed mid sequential generation. */
  showItineraryPartialError: boolean
  copyRefreshing: boolean
  runFullItineraryGeneration: (options?: { resume?: boolean }) => Promise<void>
  handleResetDay: (dayIndex: number) => Promise<void>
  handleRegenerateItinerary: () => void
  /**
   * Translate only the human-readable text of the existing days into the
   * target locale. Preserves day structure (places, times, pace, transport
   * / walkLevel codes, placeKey) so the user's manual place picks are
   * preserved across UI-language toggles.
   */
  handleTranslateItinerary: (targetLocale: Locale) => Promise<void>
  handleRestoreDefault: () => void
  handleRestoreDayDefault: (dayIndex: number) => void
  /** Bump in-flight full/day generation request ids so stale completions no-op. */
  cancelInFlightGeneration: () => void
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
  const { locale, t } = useTranslation()
  const generatingLines = useMemo(
    () => getItineraryGeneratingLines(locale),
    [locale],
  )
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
  const [itineraryStart, setItineraryStart] = useState<ItineraryStartResult | null>(() => {
    const dates = deps.tripDates ?? loadTripDates()
    const flights = deps.flights ?? initialFlightsState()
    if (!dates?.startDate || !flights.outbound?.flightNumber) return null
    return resolveItineraryStartSync({
      tripStartDate: dates.startDate,
      tripEndDate: dates.endDate,
      destination: deps.destination,
      hotelName: deps.hotelReady ? deps.hotel.name : null,
      outbound: {
        flightNumber: flights.outbound.flightNumber,
        airline: flights.outbound.airline,
        from: flights.outbound.from,
        to: flights.outbound.to,
        duration: flights.outbound.duration,
        status: flights.outbound.status,
        rawNote: flights.outbound.rawNote,
      },
    })
  })
  const [itineraryStartLoading, setItineraryStartLoading] = useState(false)
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
  const [itineraryIncrementalGenerating, setItineraryIncrementalGenerating] =
    useState(false)
  const [itineraryGeneratedUpToDay, setItineraryGeneratedUpToDay] = useState(0)
  const [itineraryGenError, setItineraryGenError] = useState<string | null>(null)
  const [dayRegenerating, setDayRegenerating] = useState(false)
  const [dayRegenError, setDayRegenError] = useState<string | null>(null)
  const [dayRestoring, setDayRestoring] = useState(false)
  const [copyRefreshing, setCopyRefreshing] = useState(false)
  const [itineraryLoadingLineIndex, setItineraryLoadingLineIndex] = useState(
    () => Math.floor(Math.random() * generatingLines.length),
  )
  // When the locale changes, jump to a random line in the new language so
  // the user isn't left staring at a Chinese sentence after switching to EN.
  useEffect(() => {
    setItineraryLoadingLineIndex(
      Math.floor(Math.random() * generatingLines.length),
    )
  }, [generatingLines])

  // -- Refs ------------------------------------------------------------------
  const genRequestIdRef = useRef(0)
  const dayRegenRequestIdRef = useRef(0)
  const dayRestoreTimerRef = useRef<number | null>(null)
  const fullGenAbortRef = useRef<AbortController | null>(null)
  const dayGenAbortRef = useRef<AbortController | null>(null)
  const fullGenTimeoutRef = useRef<number | null>(null)
  const dayGenTimeoutRef = useRef<number | null>(null)

  const cancelInFlightGeneration = useCallback(() => {
    genRequestIdRef.current += 1
    dayRegenRequestIdRef.current += 1
    // Abort in-flight LLM requests (so we never get stuck in "generating"
    // when the network stalls / server never closes).
    fullGenAbortRef.current?.abort('itinerary_generation_cancelled')
    dayGenAbortRef.current?.abort('itinerary_day_cancelled')
    fullGenAbortRef.current = null
    dayGenAbortRef.current = null
    if (fullGenTimeoutRef.current != null) {
      window.clearTimeout(fullGenTimeoutRef.current)
      fullGenTimeoutRef.current = null
    }
    if (dayGenTimeoutRef.current != null) {
      window.clearTimeout(dayGenTimeoutRef.current)
      dayGenTimeoutRef.current = null
    }

    // Stop background progression indicators right away.
    setItineraryGenerating(false)
    setItineraryIncrementalGenerating(false)
  }, [])

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
      fullGenAbortRef.current?.abort('itinerary_generation_unmount')
      dayGenAbortRef.current?.abort('itinerary_day_unmount')
      fullGenAbortRef.current = null
      dayGenAbortRef.current = null
      if (fullGenTimeoutRef.current != null) {
        window.clearTimeout(fullGenTimeoutRef.current)
        fullGenTimeoutRef.current = null
      }
      if (dayGenTimeoutRef.current != null) {
        window.clearTimeout(dayGenTimeoutRef.current)
        dayGenTimeoutRef.current = null
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

    const result = resolveItineraryStartSync({
      tripStartDate: tripDates.startDate,
      tripEndDate: tripDates.endDate,
      destination,
      hotelName: hotelReady ? hotel.name : null,
      outbound: {
        flightNumber: flights.outbound.flightNumber,
        airline: flights.outbound.airline,
        from: flights.outbound.from,
        to: flights.outbound.to,
        duration: flights.outbound.duration,
        status: flights.outbound.status,
        rawNote: flights.outbound.rawNote,
      },
    })
    setItineraryStart(result)
    setItineraryStartLoading(false)
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
  const runFullItineraryGeneration = useCallback(
    async (options?: { resume?: boolean }) => {
      if (!tripDates?.startDate || !tripDates?.endDate || !hotelReady) return
      if (!isLlmConfigured()) {
        setItineraryGenError('暂时无法生成行程，请稍后再试。')
        return
      }

      fullGenAbortRef.current?.abort('itinerary_generation_overridden')
      if (fullGenTimeoutRef.current != null) {
        window.clearTimeout(fullGenTimeoutRef.current)
        fullGenTimeoutRef.current = null
      }
      const abortController = new AbortController()
      fullGenAbortRef.current = abortController

      const fingerprint = buildItineraryFingerprint({
        hotelId: hotel.id,
        startDate: tripDates.startDate,
        endDate: tripDates.endDate,
        itineraryStartDate: itineraryStartDate || tripDates.startDate,
        outboundFlight: flights.outbound?.flightNumber,
        returnFlight: flights.returnFlight?.flightNumber,
      })

      const requestId = ++genRequestIdRef.current
      const dayCount = Math.max(1, numberOfDays)
      const disneyDay =
        recommendationPreferences.includeDisneyDay && dayCount >= 3
          ? dayCount - 1
          : null
      const PARALLEL_WINDOW = 2

      const canResume =
        Boolean(options?.resume) &&
        itineraryGeneratedUpToDay >= 1 &&
        days.length >= dayCount &&
        days.some((d) => d.day === 1 && d.stops.length > 0)

      const resumeFrom = canResume ? itineraryGeneratedUpToDay + 1 : 1

      setItineraryGenError(null)
      if (resumeFrom <= 1) {
        setItineraryGenerating(true)
        setItineraryIncrementalGenerating(false)
        setItineraryGeneratedUpToDay(0)
      } else {
        setItineraryGenerating(false)
        setItineraryIncrementalGenerating(true)
      }

      try {
        holdTripCloudSaves()
        const areaLabel =
          AREA_KEY_CN[hotel.areaKey] || hotelAreaShort(hotel) || hotel.areaKey

        let currentDays = canResume
          ? days.map((d) => ({ ...d, stops: [...d.stops] }))
          : emptyItinerary(dayCount)
        let currentCustomPlaces: Record<string, Place> = canResume
          ? { ...customPlaces }
          : {}

        const currentPlacesWithHotel = () => ({
          ...currentCustomPlaces,
          [SELECTED_HOTEL_PLACE_ID]: placeFromHotel(hotel),
        })

        const buildOccupied = (excludeDay?: number) =>
          currentDays
            .filter((d) => d.day !== excludeDay && d.stops.length > 0)
            .flatMap((d) =>
              d.stops
                .map((s) => {
                  try {
                    const place = getPlace(s.placeId, currentPlacesWithHotel())
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

        const applyDayPreview = (preview: {
          day: number
          title?: string
          theme?: string
        }) => {
          if (requestId !== genRequestIdRef.current) return
          setDays((prev) =>
            prev.map((d) =>
              d.day === preview.day
                ? {
                    ...d,
                    title: preview.title || d.title,
                    theme: preview.theme || d.theme,
                  }
                : d,
            ),
          )
        }

        const mergeDayResult = (
          result: Awaited<ReturnType<typeof buildGeneratedSingleDay>>,
          dayNumber: number,
        ) => {
          const synced = syncDaysCopyToHotelArea(result.days, hotel.areaKey)
          const syncedDay =
            synced.find((d) => d.day === dayNumber) || synced[0]
          currentDays = currentDays.map((d) =>
            d.day === dayNumber ? syncedDay : d,
          )
          // Union places so parallel batch results don't clobber each other.
          currentCustomPlaces = {
            ...currentCustomPlaces,
            ...result.customPlaces,
          }
          setDays(currentDays)
          setCustomPlaces(currentCustomPlaces)
          setItineraryGeneratedUpToDay((prev) => Math.max(prev, dayNumber))
        }

        if (!canResume) {
          setDays(currentDays)
          setCustomPlaces(currentCustomPlaces)
          setSelectedPlaceId(null)
          setDayIndex(0)
        }

        // Shared Google candidates once per run.
        const sharedCandidates = await getSharedItineraryCandidates(hotel)
        if (!sharedCandidates.length) {
          throw new Error(t('errors.googleNoCandidates'))
        }

        const generateDayWithRetry = async (dayNumber: number) => {
          const occupiedPlaces = buildOccupied(dayNumber)
          const calendarDate =
            dateForTripDay(itineraryStartDate, dayNumber) || undefined
          let result: Awaited<ReturnType<typeof buildGeneratedSingleDay>> | null =
            null
          let lastDayError: unknown = null
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              result = await buildGeneratedSingleDay({
                destination,
                dayCount,
                dayNumber,
                calendarDate,
                tripStartDate: tripDates.startDate!,
                tripEndDate: tripDates.endDate!,
                itineraryStartDate: itineraryStartDate || tripDates.startDate!,
                nights: Math.max(0, dayCount - 1),
                hotel,
                hotelAreaLabel: areaLabel || undefined,
                outbound: flightContextBrief(flights.outbound),
                returnFlight: flightContextBrief(flights.returnFlight),
                occupiedPlaces,
                existingDays: currentDays,
                existingCustomPlaces: currentCustomPlaces,
                recommendationPreferences,
                verifiedCandidates: sharedCandidates,
                signal: abortController.signal,
                onDayPreview: applyDayPreview,
              })
              lastDayError = null
              break
            } catch (err) {
              lastDayError = err
              if (abortController.signal.aborted) throw err
              if (attempt === 0) {
                await new Promise((r) => setTimeout(r, 400))
                continue
              }
            }
          }
          if (!result) throw lastDayError
          return result
        }

        // ---- Day 1 (serial) ------------------------------------------------
        if (resumeFrom <= 1) {
          if (requestId !== genRequestIdRef.current) return
          if (abortController.signal.aborted) return
          const dayTimeoutId = window.setTimeout(() => {
            abortController.abort('itinerary_day_timeout')
          }, 135_000)
          fullGenTimeoutRef.current = dayTimeoutId
          try {
            const result = await generateDayWithRetry(1)
            if (requestId !== genRequestIdRef.current) return
            mergeDayResult(result, 1)
          } finally {
            if (fullGenTimeoutRef.current === dayTimeoutId) {
              window.clearTimeout(dayTimeoutId)
              fullGenTimeoutRef.current = null
            }
          }
        }

        if (requestId !== genRequestIdRef.current) return
        setItineraryGenerating(false)
        setItineraryIncrementalGenerating(true)

        // ---- Remaining days: disney template + parallel mid window + return --
        const remaining: number[] = []
        for (let d = Math.max(2, resumeFrom); d <= dayCount; d++) {
          remaining.push(d)
        }

        while (remaining.length) {
          if (requestId !== genRequestIdRef.current) return
          if (abortController.signal.aborted) return

          const next = remaining[0]

          // Disney day: instant local template.
          if (disneyDay != null && next === disneyDay) {
            remaining.shift()
            const result = await buildGeneratedSingleDay({
              destination,
              dayCount,
              dayNumber: next,
              calendarDate: dateForTripDay(itineraryStartDate, next) || undefined,
              tripStartDate: tripDates.startDate!,
              tripEndDate: tripDates.endDate!,
              itineraryStartDate: itineraryStartDate || tripDates.startDate!,
              nights: Math.max(0, dayCount - 1),
              hotel,
              hotelAreaLabel: areaLabel || undefined,
              outbound: flightContextBrief(flights.outbound),
              returnFlight: flightContextBrief(flights.returnFlight),
              occupiedPlaces: buildOccupied(next),
              existingDays: currentDays,
              existingCustomPlaces: currentCustomPlaces,
              recommendationPreferences,
              verifiedCandidates: sharedCandidates,
              signal: abortController.signal,
            })
            if (requestId !== genRequestIdRef.current) return
            mergeDayResult(result, next)
            continue
          }

          // Return day: always serial.
          if (next === dayCount && dayCount > 1) {
            remaining.shift()
            const dayTimeoutId = window.setTimeout(() => {
              abortController.abort('itinerary_day_timeout')
            }, 135_000)
            fullGenTimeoutRef.current = dayTimeoutId
            try {
              const result = await generateDayWithRetry(next)
              if (requestId !== genRequestIdRef.current) return
              mergeDayResult(result, next)
            } finally {
              if (fullGenTimeoutRef.current === dayTimeoutId) {
                window.clearTimeout(dayTimeoutId)
                fullGenTimeoutRef.current = null
              }
            }
            continue
          }

          // Mid days: parallel window of 2 (shared occupied snapshot).
          const batch: number[] = []
          while (batch.length < PARALLEL_WINDOW && remaining.length) {
            const d = remaining[0]
            if (disneyDay != null && d === disneyDay) break
            if (d === dayCount && dayCount > 1) break
            batch.push(remaining.shift()!)
          }
          if (!batch.length) {
            remaining.shift()
            continue
          }

          const dayTimeoutId = window.setTimeout(() => {
            abortController.abort('itinerary_day_timeout')
          }, 135_000)
          fullGenTimeoutRef.current = dayTimeoutId
          try {
            const results = await Promise.all(
              batch.map((dayNumber) => generateDayWithRetry(dayNumber)),
            )
            if (requestId !== genRequestIdRef.current) return
            for (let i = 0; i < batch.length; i++) {
              mergeDayResult(results[i], batch[i])
            }
          } finally {
            if (fullGenTimeoutRef.current === dayTimeoutId) {
              window.clearTimeout(dayTimeoutId)
              fullGenTimeoutRef.current = null
            }
          }
        }

        if (requestId !== genRequestIdRef.current) return

        setItineraryIncrementalGenerating(false)
        setItineraryGenerated(true)
        setItineraryFingerprint(fingerprint)
        saveBaselineItinerary(currentDays, currentCustomPlaces, fingerprint)
        saveItineraryState(currentDays, currentCustomPlaces, {
          generated: true,
          fingerprint,
        })
        setDayIndex(0)
        setSelectedPlaceId(null)
        setItineraryGenError(null)
      } catch (err) {
        if (requestId !== genRequestIdRef.current) return
        if (abortController.signal.aborted) return
        setItineraryGenError(
          formatItineraryFailure(err, '行程生成失败，请再试一次。'),
        )
      } finally {
        releaseTripCloudSaves()
        if (fullGenAbortRef.current === abortController) {
          fullGenAbortRef.current = null
        }
        if (requestId === genRequestIdRef.current) {
          setItineraryGenerating(false)
          setItineraryIncrementalGenerating(false)
        }
      }
    },
    [
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
      itineraryGeneratedUpToDay,
      days,
      customPlaces,
      setDays,
      setCustomPlaces,
      setDayIndex,
      setSelectedPlaceId,
    ],
  )

  // First expand: auto-generate full itinerary if none saved.
  useEffect(() => {
    if (readOnly) return
    if (!itineraryReady) return
    if (itineraryStartLoading) return
    if (itineraryGenerating) return
    if (itineraryIncrementalGenerating) return
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
    itineraryIncrementalGenerating,
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

      // Ensure we can cancel / time out single-day regeneration too.
      dayGenAbortRef.current?.abort('itinerary_day_overridden')
      if (dayGenTimeoutRef.current != null) {
        window.clearTimeout(dayGenTimeoutRef.current)
        dayGenTimeoutRef.current = null
      }
      const abortController = new AbortController()
      dayGenAbortRef.current = abortController
      // Keep day-level timeout slightly above upstream proxy limit.
      const timeoutId = window.setTimeout(() => {
        abortController.abort('itinerary_day_timeout')
      }, 130_000)
      dayGenTimeoutRef.current = timeoutId

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
        holdTripCloudSaves()
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
          signal: abortController.signal,
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
        setDayRegenError(formatItineraryFailure(err, '当天行程重新生成失败，请再试一次。'))
      } finally {
        releaseTripCloudSaves()
        if (dayGenTimeoutRef.current === timeoutId) {
          window.clearTimeout(timeoutId)
          dayGenTimeoutRef.current = null
        }
        if (dayGenAbortRef.current === abortController) {
          dayGenAbortRef.current = null
        }
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
    cancelInFlightGeneration()
    wipeGeneratedItinerary()
    clearDayNavCache()
    setDays([])
    setCustomPlaces({})
    setItineraryGenerated(false)
    setItineraryFingerprint(null)
    setItineraryGenError(null)
    setItineraryGenerating(false)
    setItineraryIncrementalGenerating(false)
    setItineraryGeneratedUpToDay(0)
    setDayRegenerating(false)
    setDayRegenError(null)
    setSelectedPlaceId(null)
    setDayIndex(0)

    // Retry: kick off sequential day generation immediately.
    void runFullItineraryGeneration()
  }, [
    cancelInFlightGeneration,
    setDays,
    setCustomPlaces,
    setDayIndex,
    setSelectedPlaceId,
    runFullItineraryGeneration,
  ])

  /**
   * Cheap locale-change pass: keep the day structure (places, times,
   * pace, transport / walkLevel codes) verbatim and translate only the
   * user-facing text — day.title / theme / summary, metroHintFromArea
   * values, and each stop's `note` + `duration`. Replaces the older
   * "auto-regenerate everything" hook so the user's manual place picks
   * aren't lost on a UI-language toggle.
   */
  const handleTranslateItinerary = useCallback(
    async (targetLocale: Locale) => {
      if (!itineraryGenerated) return
      if (isLlmConfigured() === false) return
      const currentDays = days
      if (currentDays.length === 0) return
      const sourceLocale = detectLocaleFromDays(currentDays)
      if (sourceLocale === targetLocale) return
      setItineraryGenError(null)
      setItineraryGenerating(true)
      setAutoRegenOnLocaleChange(true)
      try {
        const { days: translatedDays } = await translateItineraryText({
          days: currentDays,
          sourceLocale,
          targetLocale,
        })
        setDays(translatedDays)
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err)
        setItineraryGenError(detail)
      } finally {
        setItineraryGenerating(false)
        setAutoRegenOnLocaleChange(false)
      }
    },
    [itineraryGenerated, days, isLlmConfigured],
  )

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
  const dayOneReady = itineraryGenerated || itineraryGeneratedUpToDay >= 1

  const isDayGenerationPending = useCallback(
    (dayNumber: number) =>
      (itineraryGenerating && dayNumber === 1) ||
      // Keep unfinished days in pending after a mid-run failure so tabs
      // don't suddenly look "ready" with empty placeholder titles.
      (!itineraryGenerated &&
        itineraryGeneratedUpToDay >= 1 &&
        dayNumber > itineraryGeneratedUpToDay &&
        (itineraryIncrementalGenerating || Boolean(itineraryGenError))),
    [
      itineraryGenerating,
      itineraryIncrementalGenerating,
      itineraryGenerated,
      itineraryGeneratedUpToDay,
      itineraryGenError,
    ],
  )

  // Full-screen loader only until Day 1 is ready; later days load in-tab.
  const showItineraryLoading =
    itineraryReady &&
    !dayOneReady &&
    (itineraryGenerating ||
      (itineraryStartLoading &&
        !itineraryGenerated &&
        !itineraryIncrementalGenerating))
  useEffect(() => {
    if (!showItineraryLoading) return
    setItineraryLoadingLineIndex(
      Math.floor(Math.random() * generatingLines.length),
    )
    const id = window.setInterval(() => {
      setItineraryLoadingLineIndex(
        (i) => (i + 1) % generatingLines.length,
      )
    }, ITINERARY_LOADING_ROTATE_MS)
    return () => window.clearInterval(id)
  }, [showItineraryLoading, generatingLines])

  const itineraryLoadingLine =
    generatingLines[itineraryLoadingLineIndex] ?? generatingLines[0]

  // -----------------------------------------------------------------------
  // Auto-translate when the user switches language.
  //
  // If a trip has already been generated, its titles/themes/summaries/etc.
  // were written in whatever locale was active at the time. When the user
  // toggles the language, call `translateItineraryText` to translate the
  // text fields in place — keeping the day structure (places, times, pace,
  // transport / walkLevel codes, placeKey) verbatim so the user's manual
  // place picks aren't lost. A 1.2s debounce prevents rapid toggling from
  // triggering a flurry of LLM calls.
  //
  // Works in BOTH directions: zh-CN → en and en → zh-CN, and any future
  // locale pair. The `lastAutoRegenLocaleRef` is updated *immediately* on
  // locale change (not inside the setTimeout) so rapid back-and-forth
  // toggles don't get swallowed by a stale ref value.
  // -----------------------------------------------------------------------
  const [autoRegenOnLocaleChange, setAutoRegenOnLocaleChange] = useState(false)
  const lastAutoRegenLocaleRef = useRef<Locale | null>(null)
  useEffect(() => {
    if (lastAutoRegenLocaleRef.current === null) {
      // First mount: seed the ref with the active locale so the very first
      // user-initiated switch can be detected.
      lastAutoRegenLocaleRef.current = locale
      return
    }
    if (lastAutoRegenLocaleRef.current === locale) return
    if (!itineraryGenerated) return
    if (itineraryGenerating || itineraryIncrementalGenerating || dayRegenerating) {
      return
    }
    // Update the ref synchronously so a quick second switch (e.g. en →
    // zh-CN → en within 1.2s) is still detected by the next effect run.
    const targetLocale = locale
    lastAutoRegenLocaleRef.current = targetLocale
    const id = window.setTimeout(() => {
      void handleTranslateItinerary(targetLocale)
    }, 1200)
    return () => window.clearTimeout(id)
  }, [
    locale,
    itineraryGenerated,
    itineraryGenerating,
    itineraryIncrementalGenerating,
    dayRegenerating,
    handleTranslateItinerary,
  ])

  // Clear the "auto-regen" badge once generation finishes so the next
  // manual regeneration doesn't show the locale-change notice.
  useEffect(() => {
    if (!itineraryGenerating && !itineraryIncrementalGenerating) {
      setAutoRegenOnLocaleChange(false)
    }
  }, [itineraryGenerating, itineraryIncrementalGenerating])

  // -- Restore gating --------------------------------------------------------
  const canRestoreDefault = hasMatchingBaseline(
    itineraryFingerprint || currentFingerprint,
  )
  const canRestoreDayDefault = hasBaselineDay(
    days[Math.min(Math.max(0, 0), days.length - 1)]?.day ?? 0,
    itineraryFingerprint || currentFingerprint,
  )

  const showItineraryContent =
    itineraryReady && days.length > 0 && dayOneReady
  const showItineraryError =
    itineraryReady &&
    !itineraryGenerating &&
    !itineraryIncrementalGenerating &&
    Boolean(itineraryGenError) &&
    !itineraryGenerated &&
    !dayOneReady
  const showItineraryPartialError =
    itineraryReady &&
    !itineraryGenerating &&
    !itineraryIncrementalGenerating &&
    Boolean(itineraryGenError) &&
    !itineraryGenerated &&
    dayOneReady

  return {
    itineraryStart,
    itineraryStartLoading,
    itineraryGenerated,
    itineraryFingerprint,
    itineraryGenerating,
    itineraryIncrementalGenerating,
    itineraryGeneratedUpToDay,
    itineraryGenError,
    dayRegenerating,
    dayRegenError,
    dayRestoring,
    autoRegenOnLocaleChange,
    itineraryLoadingLine,
    itineraryLoadingLineIndex,
    itineraryStartDate,
    numberOfDays,
    currentFingerprint,
    itineraryReady,
    missingForItinerary,
    canRestoreDefault,
    canRestoreDayDefault,
    isDayGenerationPending,
    showItineraryLoading,
    showItineraryContent,
    showItineraryError,
    showItineraryPartialError,
    copyRefreshing,
    runFullItineraryGeneration,
    handleResetDay,
    handleRegenerateItinerary,
    handleTranslateItinerary,
    handleRestoreDefault,
    handleRestoreDayDefault,
    cancelInFlightGeneration,
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
