import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react'
import type { FlightSelection } from '../features/flight/services/flightSelection'
import type { DayNavPlan } from '../features/map/services/googleNav'
import type { DayPlan, ItineraryStop, Place, SelectedHotel } from '../types'
import {
  AREA_KEY_CN,
  AREA_KEY_EN,
  EMPTY_DAY_FALLBACK,
  ensureStopId,
  hotelAreaShort,
  isHotelSelected,
  syncDaysCopyToHotelArea,
} from '../appHelpers'
import { getLocale } from '../shared/i18n'
import { dateForTripDay } from '../features/itinerary/services/tripDates'
import {
  SELECTED_HOTEL_PLACE_ID,
  getDayOrigin,
  placeFromHotel,
} from '../features/itinerary/utils/dayOrigin'
import {
  applyDay1HotelArrivalTimes,
  computeDay1HotelArrivalHm,
  recomputeDayStopTimes,
} from '../shared/utils/stopTimes'
import { getPlace } from '../features/place/constants/places'
import { generateDayCopy } from '../shared/services/llm/llm'
import {
  isPinnedHotelStop,
  keepFixedHotelPositions,
  makeStopId,
  reorderStops,
} from '../features/itinerary/utils/itineraryState'
import { findBestInsertIndex } from '../features/itinerary/utils/itineraryState'
import {
  holdTripCloudSaves,
  releaseTripCloudSaves,
} from '../features/cloud-sync/services/tripCloud'

const REORDER_SAVE_SETTLE_MS = 1000
const REORDER_SAVE_FALLBACK_MS = 30_000

type ReorderSaveTransaction = {
  copyDone: boolean
  fallbackTimer: ReturnType<typeof setTimeout> | null
  settleTimer: ReturnType<typeof setTimeout> | null
}

export interface ItineraryDaysInitialState {
  days: DayPlan[]
  customPlaces: Record<string, Place>
}

export type AddOnDayOptions = {
  mode?: 'best' | 'end'
  insertAt?: number
  select?: boolean
}

export interface UseItineraryDaysRefsForHandlers {
  /** Needed for “pinned overnight hotel” rules; provided via ref because it’s
   * only known after `useItineraryGeneration` runs in App. */
  numberOfDaysRef: MutableRefObject<number>
}

export interface UseItineraryDaysResult {
  days: DayPlan[]
  setDays: Dispatch<SetStateAction<DayPlan[]>>
  customPlaces: Record<string, Place>
  setCustomPlaces: Dispatch<SetStateAction<Record<string, Place>>>
  dayIndex: number
  setDayIndex: Dispatch<SetStateAction<number>>
  selectedPlaceId: string | null
  setSelectedPlaceId: Dispatch<SetStateAction<string | null>>

  placesWithHotel: Record<string, Place>
  safeDayIndex: number
  day: DayPlan

  // ---- 10 day mutation handlers (Stage 4.4) ----
  handleReorder: (from: number, to: number) => void
  handleReorderOnDay: (dayNum: number, from: number, to: number) => void
  handleDelete: (stopId: string) => void
  handleDeleteOnDay: (dayNum: number, stopId: string) => void
  handleAddCustom: (place: Place, mode: 'best' | 'end') => void
  handleGoogleIdentityResolved: (
    placeId: string,
    googlePlaceId: string,
    nameOriginal?: string,
    googleAddress?: string,
  ) => void
  handleAddOnDay: (
    dayNum: number,
    place: Place,
    options?: AddOnDayOptions,
  ) => void
  handleSwitchDay: (dayNum: number) => void
  handleReplaceOnDay: (
    dayNum: number,
    stopId: string,
    place: Place,
    options?: { select?: boolean },
  ) => void
  completeReorderSaveTransaction: () => void
}

/**
 * useItineraryDays — day tab selection + editable day plan state.
 *
 * Stage 4.4 also adds:
 *   - 10 day mutation handlers
 * (copy regen + stop clocks + hotel-area sync live in `useItineraryDaysEffects`,
 *  because App needs to compute `navPlan` and itinerary status first.)
 */
export function useItineraryDays(
  hotel: SelectedHotel,
  initial: ItineraryDaysInitialState,
  { numberOfDaysRef }: UseItineraryDaysRefsForHandlers,
): UseItineraryDaysResult {
  const [days, setDays] = useState<DayPlan[]>(() => initial.days)
  const [customPlaces, setCustomPlaces] = useState<
    Record<string, Place>
  >(() => initial.customPlaces)
  const [dayIndex, setDayIndex] = useState(0)
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null)
  const reorderSaveTransactionRef = useRef<ReorderSaveTransaction | null>(null)

  const finishReorderSaveTransaction = useCallback(() => {
    const transaction = reorderSaveTransactionRef.current
    if (!transaction) return
    if (transaction.fallbackTimer) clearTimeout(transaction.fallbackTimer)
    if (transaction.settleTimer) clearTimeout(transaction.settleTimer)
    reorderSaveTransactionRef.current = null
    releaseTripCloudSaves()
  }, [])

  const scheduleReorderSaveRelease = useCallback(() => {
    const transaction = reorderSaveTransactionRef.current
    if (!transaction?.copyDone) return
    if (transaction.settleTimer) clearTimeout(transaction.settleTimer)
    transaction.settleTimer = setTimeout(
      finishReorderSaveTransaction,
      REORDER_SAVE_SETTLE_MS,
    )
  }, [finishReorderSaveTransaction])

  const beginReorderSaveTransaction = useCallback(() => {
    let transaction = reorderSaveTransactionRef.current
    if (!transaction) {
      holdTripCloudSaves()
      transaction = {
        copyDone: false,
        fallbackTimer: null,
        settleTimer: null,
      }
      reorderSaveTransactionRef.current = transaction
    } else {
      transaction.copyDone = false
      if (transaction.settleTimer) {
        clearTimeout(transaction.settleTimer)
        transaction.settleTimer = null
      }
      if (transaction.fallbackTimer) clearTimeout(transaction.fallbackTimer)
    }
    transaction.fallbackTimer = setTimeout(
      finishReorderSaveTransaction,
      REORDER_SAVE_FALLBACK_MS,
    )
  }, [finishReorderSaveTransaction])

  const completeReorderSaveTransaction = useCallback(() => {
    const transaction = reorderSaveTransactionRef.current
    if (!transaction) return
    transaction.copyDone = true
    scheduleReorderSaveRelease()
  }, [scheduleReorderSaveRelease])

  useEffect(() => {
    scheduleReorderSaveRelease()
  }, [days, scheduleReorderSaveRelease])

  useEffect(
    () => () => finishReorderSaveTransaction(),
    [finishReorderSaveTransaction],
  )

  const placesWithHotel = useMemo(
    () => ({
      ...customPlaces,
      [SELECTED_HOTEL_PLACE_ID]: placeFromHotel(hotel),
    }),
    [customPlaces, hotel],
  )

  const safeDayIndex = Math.min(dayIndex, Math.max(0, days.length - 1))
  const day = days[safeDayIndex] ?? EMPTY_DAY_FALLBACK

  const lastDayNum =
    numberOfDaysRef.current > 0 ? numberOfDaysRef.current : days.length

  const updateDayStops = useCallback(
    (updater: (stops: ItineraryStop[]) => ItineraryStop[]) => {
      setDays((prev) =>
        prev.map((d, i) =>
          i === dayIndex ? { ...d, stops: updater(d.stops) } : d,
        ),
      )
    },
    [dayIndex, setDays],
  )

  const handleReorder = useCallback(
    (from: number, to: number) => {
      const reordered = keepFixedHotelPositions(
        day.day,
        reorderStops(day.stops, from, to),
        lastDayNum,
      )
      const changed = reordered.some((stop, index) => stop !== day.stops[index])
      if (!changed) return
      beginReorderSaveTransaction()
      updateDayStops((stops) =>
        keepFixedHotelPositions(day.day, reorderStops(stops, from, to), lastDayNum),
      )
    },
    [beginReorderSaveTransaction, day.day, day.stops, lastDayNum, updateDayStops],
  )

  const handleReorderOnDay = useCallback(
    (dayNum: number, from: number, to: number) => {
      setDays((prev) =>
        prev.map((d) =>
          d.day === dayNum
            ? {
                ...d,
                stops: keepFixedHotelPositions(
                  d.day,
                  reorderStops(d.stops, from, to),
                  lastDayNum,
                ),
              }
            : d,
        ),
      )
    },
    [lastDayNum, setDays],
  )

  const handleDelete = useCallback(
    (stopId: string) => {
      updateDayStops((stops) => {
        const removedIdx = stops.findIndex(
          (s, i) => ensureStopId(day.day, s, i) === stopId,
        )
        if (removedIdx < 0) return stops
        if (isPinnedHotelStop(day.day, stops, removedIdx, lastDayNum)) {
          return stops
        }
        const removed = stops[removedIdx]
        const next = stops.filter((_, i) => i !== removedIdx)
        if (removed && selectedPlaceId === removed.placeId) {
          setSelectedPlaceId(null)
        }
        return next
      })
    },
    [day.day, lastDayNum, selectedPlaceId, updateDayStops],
  )

  const handleDeleteOnDay = useCallback(
    (dayNum: number, stopId: string) => {
      setDays((prev) =>
        prev.map((d) => {
          if (d.day !== dayNum) return d
          const removedIdx = d.stops.findIndex(
            (s, i) => ensureStopId(d.day, s, i) === stopId,
          )
          if (removedIdx < 0) return d
          if (isPinnedHotelStop(d.day, d.stops, removedIdx, lastDayNum)) {
            return d
          }
          const removed = d.stops[removedIdx]
          const next = d.stops.filter((_, i) => i !== removedIdx)
          if (removed && selectedPlaceId === removed.placeId) {
            setSelectedPlaceId(null)
          }
          return { ...d, stops: next }
        }),
      )
    },
    [lastDayNum, selectedPlaceId, setDays],
  )

  const handleGoogleIdentityResolved = useCallback(
    (
      placeId: string,
      googlePlaceId: string,
      nameOriginal?: string,
      googleAddress?: string,
    ) => {
      setCustomPlaces((prev) => {
        const current = prev[placeId]
        if (!current) return prev
        const nextNameLocal = nameOriginal || current.nameLocal
        const nextGoogleAddress = googleAddress || current.googleAddress
        if (
          current.googlePlaceId === googlePlaceId &&
          current.nameLocal === nextNameLocal &&
          current.googleAddress === nextGoogleAddress
        ) {
          return prev
        }
        const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          nextNameLocal || current.name,
        )}&query_place_id=${encodeURIComponent(googlePlaceId)}`
        return {
          ...prev,
          [placeId]: {
            ...current,
            googlePlaceId,
            nameLocal: nextNameLocal,
            googleAddress: nextGoogleAddress,
            googleMapsUrl,
          },
        }
      })
    },
    [setCustomPlaces],
  )

  const handleAddOnDay = useCallback(
    (dayNum: number, place: Place, options?: AddOnDayOptions) => {
      const mode = options?.mode || 'best'
      setCustomPlaces((prev) => ({ ...prev, [place.id]: place }))

      const newStop: ItineraryStop = {
        id: makeStopId(dayNum, place.id),
        time: '12:00',
        placeId: place.id,
        note: place.description,
        walkLevel: 'short',
        duration: place.durationHint || '60 分钟',
      }

      setDays((prev) =>
        prev.map((d) => {
          if (d.day !== dayNum) return d

          const next = [...d.stops]
          const endsWithOvernight =
            d.day !== lastDayNum &&
            d.stops[d.stops.length - 1]?.placeId ===
              SELECTED_HOTEL_PLACE_ID

          if (typeof options?.insertAt === 'number') {
            let at = Math.max(0, Math.min(options.insertAt, next.length))
            if (
              d.day === 1 &&
              d.stops[0]?.placeId === SELECTED_HOTEL_PLACE_ID
            ) {
              at = Math.max(1, at)
            }
            if (endsWithOvernight) {
              at = Math.min(at, d.stops.length - 1)
            }
            next.splice(at, 0, newStop)
            return {
              ...d,
              stops: keepFixedHotelPositions(d.day, next, lastDayNum),
            }
          }

          if (mode === 'end') {
            // Insert before pinned overnight hotel when present.
            if (endsWithOvernight) {
              const at = Math.max(0, d.stops.length - 1)
              next.splice(at, 0, newStop)
              return { ...d, stops: next }
            }
            return { ...d, stops: [...d.stops, newStop] }
          }

          // Default / best: insert where day-origin → stops path is shortest.
          if (!d.stops.length) {
            return { ...d, stops: [newStop] }
          }

          const origin = getDayOrigin(d.day, hotel)
          const placesLookup = {
            ...placesWithHotel,
            [place.id]: place,
          }
          const stopLocations = d.stops.map((s) => {
            try {
              return getPlace(s.placeId, placesLookup).location
            } catch {
              return { lat: origin.lat, lng: origin.lng }
            }
          })
          let insertAt = findBestInsertIndex(
            { lat: origin.lat, lng: origin.lng },
            stopLocations,
            place.location,
          )

          // Keep day-1 hotel check-in as the first stop.
          if (
            d.day === 1 &&
            d.stops[0]?.placeId === SELECTED_HOTEL_PLACE_ID
          ) {
            insertAt = Math.max(1, insertAt)
          }
          // Keep overnight hotel as the last stop on non-last days.
          if (endsWithOvernight) {
            insertAt = Math.min(insertAt, d.stops.length - 1)
          }
          next.splice(insertAt, 0, newStop)
          return {
            ...d,
            stops: keepFixedHotelPositions(d.day, next, lastDayNum),
          }
        }),
      )

      const targetIndex = days.findIndex((d) => d.day === dayNum)
      if (targetIndex >= 0) setDayIndex(targetIndex)
      if (options?.select !== false) setSelectedPlaceId(place.id)
    },
    [
      days,
      hotel,
      lastDayNum,
      placesWithHotel,
      setCustomPlaces,
      setDays,
      setDayIndex,
      setSelectedPlaceId,
    ],
  )

  const handleAddCustom = useCallback(
    (place: Place, mode: 'best' | 'end') => {
      // Don't auto-open PlacePanel / GooglePlacePage after add-from-dialog.
      handleAddOnDay(day.day, place, { mode, select: false })
    },
    [day.day, handleAddOnDay],
  )

  const handleSwitchDay = useCallback(
    (dayNum: number) => {
      const idx = days.findIndex((d) => d.day === dayNum)
      if (idx >= 0) {
        setDayIndex(idx)
        setSelectedPlaceId(null)
      }
    },
    [days],
  )

  const handleReplaceOnDay = useCallback(
    (
      dayNum: number,
      stopId: string,
      place: Place,
      options?: { select?: boolean },
    ) => {
      setCustomPlaces((prev) => ({ ...prev, [place.id]: place }))

      const dayPlan = days.find((d) => d.day === dayNum)
      const oldIdx =
        dayPlan?.stops.findIndex(
          (s, i) => ensureStopId(dayNum, s, i) === stopId,
        ) ?? -1

      const replacedPlaceId =
        dayPlan && oldIdx >= 0 && !isPinnedHotelStop(dayNum, dayPlan.stops, oldIdx, lastDayNum)
          ? dayPlan.stops[oldIdx]?.placeId ?? null
          : null

      setDays((prev) =>
        prev.map((d) => {
          if (d.day !== dayNum) return d
          const idx = d.stops.findIndex(
            (s, i) => ensureStopId(d.day, s, i) === stopId,
          )
          if (idx < 0) return d

          const old = d.stops[idx]
          if (isPinnedHotelStop(d.day, d.stops, idx, lastDayNum)) return d

          const newStop: ItineraryStop = {
            id: makeStopId(dayNum, place.id),
            time: old.time || '12:00',
            placeId: place.id,
            note: place.description,
            walkLevel: old.walkLevel || 'short',
            duration: place.durationHint || old.duration || '60 分钟',
            transport: old.transport,
          }
          const next = [...d.stops]
          next[idx] = newStop
          return { ...d, stops: next }
        }),
      )

      const targetIndex = days.findIndex((d) => d.day === dayNum)
      if (targetIndex >= 0) setDayIndex(targetIndex)

      if (options?.select !== false) {
        setSelectedPlaceId(place.id)
      } else if (replacedPlaceId && selectedPlaceId === replacedPlaceId) {
        setSelectedPlaceId(null)
      }
    },
    [days, lastDayNum, selectedPlaceId, setDays, setSelectedPlaceId],
  )

  return {
    days,
    setDays,
    customPlaces,
    setCustomPlaces,
    dayIndex,
    setDayIndex,
    selectedPlaceId,
    setSelectedPlaceId,
    placesWithHotel,
    safeDayIndex,
    day,

    handleReorder,
    handleReorderOnDay,
    handleDelete,
    handleDeleteOnDay,
    handleAddCustom,
    handleGoogleIdentityResolved,
    handleAddOnDay,
    handleSwitchDay,
    handleReplaceOnDay,
    completeReorderSaveTransaction,
  }
}

// ---- Effects moved from App.tsx (Stage 4.4) ----

export interface UseItineraryDaysEffectsRefs {
  prevStopsKeyRef: MutableRefObject<string | null>
  suppressCopyRef: MutableRefObject<boolean>
  copyRequestIdRef: MutableRefObject<number>
  navTimesAppliedKeyRef: MutableRefObject<string>
  day1TransitSecondsRef: MutableRefObject<number | null>
  remoteHydrationRenderKeyRef: MutableRefObject<number | null>
}

export function useItineraryDaysEffects(
  params: {
    hotel: SelectedHotel
    flights: FlightSelection
    navPlan: DayNavPlan
    navLoading: boolean
    itineraryReady: boolean
    itineraryGenerated: boolean
    itineraryGenerating: boolean
    days: DayPlan[]
    setDays: Dispatch<SetStateAction<DayPlan[]>>
    placesWithHotel: Record<string, Place>
    day: DayPlan
    dayIndex: number
    itineraryStartDate: string | undefined
    numberOfDays: number
    setCopyRefreshing: Dispatch<SetStateAction<boolean>>
    completeReorderSaveTransaction: () => void
    syncRenderKey: number
  },
  refs: UseItineraryDaysEffectsRefs,
) {
  const {
    hotel,
    flights,
    navPlan,
    navLoading,
    itineraryReady,
    itineraryGenerated,
    itineraryGenerating,
    days,
    setDays,
    placesWithHotel,
    day,
    dayIndex,
    itineraryStartDate,
    numberOfDays,
    setCopyRefreshing,
    completeReorderSaveTransaction,
    syncRenderKey,
  } = params

  const isRemoteHydrationRender =
    refs.remoteHydrationRenderKeyRef.current === syncRenderKey

  const dayPlacesKey = useMemo(
    () => day.stops.map((s) => s.placeId).join(','),
    [day.stops],
  )

  const dayCalendarDate = dateForTripDay(itineraryStartDate, day.day)

  // Keep stale day title/summary district mentions aligned with hotel-areaKey.
  useEffect(() => {
    if (isRemoteHydrationRender) return
    const hotelSelectedForCopySync = isHotelSelected(hotel)
    const hotelAreaKeyForCopySync = hotel.areaKey
    if (!hotelSelectedForCopySync) return
    if (!itineraryGenerated || !days.length) return
    const areaKey = hotelAreaKeyForCopySync
    if (!AREA_KEY_CN[areaKey]) return
    setDays((prev) => {
      const next = syncDaysCopyToHotelArea(prev, areaKey)
      return next === prev ? prev : next
    })
  }, [hotel, days.length, itineraryGenerated, isRemoteHydrationRender, setDays])

  // Day 1 transit seed for stop-clock recomputes.
  useEffect(() => {
    if (day.day === 1 && navPlan.hotelToFirst?.durationSeconds) {
      refs.day1TransitSecondsRef.current = navPlan.hotelToFirst.durationSeconds
    }
  }, [day.day, navPlan.hotelToFirst?.durationSeconds, refs.day1TransitSecondsRef])

  // Live stop clocks: cascade from Day-1 hotel arrival using google leg durations.
  useEffect(() => {
    if (isRemoteHydrationRender) return
    if (!itineraryReady || !itineraryGenerated || itineraryGenerating) return
    if (navLoading) return
    if (!day.stops.length) return
    if (!navPlan.stopsKey?.startsWith(`${day.day}|`)) return

    const transitSeconds =
      day.day === 1
        ? navPlan.hotelToFirst?.durationSeconds
        : refs.day1TransitSecondsRef.current ?? undefined

    const day1HotelHm =
      day.day === 1
        ? computeDay1HotelArrivalHm(flights.outbound, transitSeconds)
        : null

    const applyKey = `${navPlan.stopsKey}::${day1HotelHm || ''}`
    if (refs.navTimesAppliedKeyRef.current === applyKey) return

    setDays((prev) => {
      const idx = prev.findIndex((d) => d.day === day.day)
      if (idx < 0) return prev
      let nextDay = prev[idx]

      if (day.day === 1 && day1HotelHm) {
        nextDay = applyDay1HotelArrivalTimes(nextDay, day1HotelHm)
      }

      const recomputed = recomputeDayStopTimes(nextDay, {
        betweenStops: navPlan.betweenStops,
        firstStopHm: day.day === 1 && day1HotelHm ? day1HotelHm : null,
        defaultFirstHm: '10:00',
        placeTypeAt: (placeId) => {
          try {
            return getPlace(placeId, placesWithHotel).type
          } catch {
            return null
          }
        },
      })

      refs.navTimesAppliedKeyRef.current = applyKey

      if (
        recomputed.stops.length === prev[idx].stops.length &&
        recomputed.stops.every((s, i) => s.time === prev[idx].stops[i]?.time)
      ) {
        return prev
      }

      const next = [...prev]
      next[idx] = recomputed
      return next
    })
  }, [
    itineraryReady,
    itineraryGenerated,
    itineraryGenerating,
    isRemoteHydrationRender,
    navLoading,
    navPlan.stopsKey,
    navPlan.betweenStops,
    navPlan.hotelToFirst?.durationSeconds,
    day.day,
    day.stops.length,
    flights.outbound,
    placesWithHotel,
    refs.day1TransitSecondsRef,
    refs.navTimesAppliedKeyRef,
    setDays,
  ])

  // When viewing another day, still refresh Day 1 hotel check-in if flight/transit changes.
  useEffect(() => {
    if (isRemoteHydrationRender) return
    if (day.day === 1) return
    const transitSeconds = refs.day1TransitSecondsRef.current
    const hotelHm = computeDay1HotelArrivalHm(flights.outbound, transitSeconds)
    if (!hotelHm) return
    setDays((prev) => {
      const idx = prev.findIndex((d) => d.day === 1)
      if (idx < 0) {
        return prev
      }
      const nextDay = applyDay1HotelArrivalTimes(prev[idx], hotelHm)
      if (nextDay === prev[idx]) {
        return prev
      }
      const next = [...prev]
      next[idx] = nextDay
      return next
    })
  }, [
    flights.outbound,
    day.day,
    isRemoteHydrationRender,
    refs.day1TransitSecondsRef,
    setDays,
  ])

  // Auto-generate day title / theme / summary after itinerary edits.
  const placesWithHotelRef = useRef(placesWithHotel)
  placesWithHotelRef.current = placesWithHotel
  const hotelRef = useRef(hotel)
  hotelRef.current = hotel
  const dayStopsRef = useRef(day.stops)
  dayStopsRef.current = day.stops
  const dayIndexForCopyRef = useRef(dayIndex)
  dayIndexForCopyRef.current = dayIndex
  const { copyRequestIdRef, prevStopsKeyRef, suppressCopyRef } = refs
  const isCurrentCopyRequest = useCallback(
    (requestId: number) => copyRequestIdRef.current === requestId,
    [copyRequestIdRef],
  )

  useEffect(() => {
    if (!itineraryReady || !itineraryGenerated || itineraryGenerating) {
      setCopyRefreshing(false)
      completeReorderSaveTransaction()
      return
    }

    const hotelAreaKey = hotel.areaKey
    const key = `${day.day}:${dayPlacesKey}:${dayCalendarDate || ''}:${day.pace}:${hotelAreaKey}`

    if (prevStopsKeyRef.current === null) {
      prevStopsKeyRef.current = key
      // Initializing the remote baseline already suppresses copy generation;
      // do not let the marker leak into the user's next real edit.
      suppressCopyRef.current = false
      completeReorderSaveTransaction()
      return
    }
    if (prevStopsKeyRef.current === key) return

    const prevDay = Number(prevStopsKeyRef.current.split(':')[0])
    prevStopsKeyRef.current = key

    if (suppressCopyRef.current) {
      suppressCopyRef.current = false
      setCopyRefreshing(false)
      completeReorderSaveTransaction()
      return
    }

    // Switching day tabs should not rewrite copy.
    if (prevDay !== day.day) {
      setCopyRefreshing(false)
      completeReorderSaveTransaction()
      return
    }

    let cancelled = false
    const requestId = ++copyRequestIdRef.current
    const dayNum = day.day
    const pace = day.pace
    const calendarDate = dayCalendarDate || undefined
    const totalDays = numberOfDays

    const timer = window.setTimeout(() => {
      if (cancelled) return

      const locale = getLocale()
      const places = placesWithHotelRef.current
      const hotelNow = hotelRef.current
      const areaKey = hotelNow.areaKey
      const areaLabel =
        hotelAreaShort(hotelNow, locale) ||
        (locale === 'en' ? AREA_KEY_EN[areaKey] : AREA_KEY_CN[areaKey]) ||
        undefined

      const names = dayStopsRef.current.map((s) => {
        try {
          return getPlace(s.placeId, places).name
        } catch {
          return s.placeId
        }
      })

      setCopyRefreshing(true)
      const dayIdx = dayIndexForCopyRef.current
      const prevTitle = day.title
      const prevTheme = day.theme
      const prevSummary = day.summary

      // Clear current copy so header immediately enters shimmer loading state
      setDays((prev) =>
        prev.map((d, i) =>
          i === dayIdx ? { ...d, title: '', theme: '', summary: '' } : d,
        ),
      )

      void generateDayCopy({
        day: dayNum,
        pace,
        placeNames: names,
        hotelArea: areaKey,
        hotelAreaLabel: areaLabel,
        calendarDate,
        totalDays,
        locale,
        onProgress: (partial) => {
          if (cancelled || !isCurrentCopyRequest(requestId)) return
          setDays((prev) =>
            prev.map((d, i) => {
              if (i !== dayIdx) return d
              return {
                ...d,
                title: partial.title ?? d.title,
                theme: partial.theme ?? d.theme,
                summary: partial.summary ?? d.summary,
              }
            }),
          )
        },
      })
        .then((copy) => {
          if (
            cancelled ||
            !isCurrentCopyRequest(requestId) ||
            !copy
          )
            return

          setDays((prev) =>
            prev.map((d, i) => {
              if (i !== dayIdx) return d
              const next = {
                ...d,
                title: copy.title,
                theme: copy.theme,
                summary: copy.summary,
              }
              // Guard against LLM still naming a stale hotel district.
              return syncDaysCopyToHotelArea([next], areaKey)[0] || next
            }),
          )
        })
        .catch(() => {
          if (cancelled || !isCurrentCopyRequest(requestId)) return
          // Rollback on failure
          setDays((prev) =>
            prev.map((d, i) =>
              i === dayIdx
                ? { ...d, title: prevTitle, theme: prevTheme, summary: prevSummary }
                : d,
            ),
          )
        })
        .finally(() => {
          if (!cancelled && isCurrentCopyRequest(requestId)) {
            setCopyRefreshing(false)
            completeReorderSaveTransaction()
          }
        })
    }, 400)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
      if (isCurrentCopyRequest(requestId)) {
        setCopyRefreshing(false)
      }
    }
  }, [
    dayPlacesKey,
    day.day,
    day.pace,
    dayCalendarDate,
    hotel.areaKey,
    itineraryReady,
    itineraryGenerated,
    itineraryGenerating,
    isCurrentCopyRequest,
    numberOfDays,
    setCopyRefreshing,
    setDays,
    completeReorderSaveTransaction,
    copyRequestIdRef,
    prevStopsKeyRef,
    suppressCopyRef,
  ])

  // All derived effects above have now observed the authoritative remote
  // render. Clear the one-render marker so the next real user edit behaves
  // exactly like any other local change.
  useEffect(() => {
    if (refs.remoteHydrationRenderKeyRef.current === syncRenderKey) {
      refs.remoteHydrationRenderKeyRef.current = null
    }
  }, [refs.remoteHydrationRenderKeyRef, syncRenderKey])
}

