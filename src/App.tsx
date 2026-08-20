import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Archive, CalendarDays, History, Luggage, Share2, Sparkles, User } from 'lucide-react'
import { useAuth } from './features/auth/authContext'
import { useTripCore } from './hooks/useTripCore'
import { useItineraryGeneration } from './hooks/useItineraryGeneration'
import { useItineraryDays, useItineraryDaysEffects } from './hooks/useItineraryDays'
import { useMobilePane } from './hooks/useMobilePane'
import { useTripDialogs } from './hooks/useTripDialogs'
import { useTripSync } from './hooks/useTripSync'
import { DayTimeline } from './features/itinerary/components/DayTimeline'
import { DayTabButton } from './features/itinerary/components/DayTabButton'
import { FlightPanel } from './features/flight/components/FlightPanel'
import { HotelPicker } from './features/hotel/components/HotelPicker'
import { LoadingIndicator } from './shared/components/LoadingIndicator'
import { CloudSaveIndicator } from './features/cloud-sync/components/CloudSaveIndicator'
import { ApiRequestMeter } from './shared/components/ApiRequestMeter'
import { BackupDialog } from './features/cloud-sync/components/BackupDialog'
import {
  RecommendationPreferencesDialog,
} from './features/place/components/RecommendationPreferencesDialog'
import { PlacePanel } from './features/place/components/PlacePanel'
import { ShareDialog } from './features/cloud-sync/components/ShareDialog'
import { TripChatPanelLazy as TripChatPanel } from './features/chat/components/TripChatPanel.lazy'
import type { TripChatViewingTarget } from './features/chat/services/tripChat'
import { TripDatesPanel } from './features/itinerary/components/TripDatesPanel'
import { BottomNavBar } from './features/navigation/components/BottomNavBar'
import { TopNavSegment } from './features/navigation/components/TopNavSegment'
import { ProfileTab } from './features/navigation/components/ProfileTab'
import type { AppTab } from './features/navigation/types'
const TripMap = React.lazy(() =>
  import('./features/map/components/TripMap').then((m) => ({ default: m.TripMap })),
)
import {
  buildDayMapRouteSegments,
  dayRouteSegmentsToRequests,
} from './features/map/services/mapDayRoute'
import { getOrFetchMapRouteSegments } from './features/map/services/openRouteService'
import { MapErrorBoundary } from './features/map/components/MapErrorBoundary'
import { PENDING_HOTEL } from './features/hotel/constants/hotels'
import { getPlace } from './features/place/constants/places'
import { SELECTED_HOTEL_PLACE_ID } from './features/itinerary/utils/dayOrigin'
import { clearDayNavCache, useDayNav } from './features/itinerary/hooks/useDayNav'
import { clearAllFlightCache } from './features/flight/services/flightCache'
import { clearFlightSelection } from './features/flight/services/flightSelection'
import { clearHotelCache } from './features/hotel/services/hotelCache'
import { clearLlmMemo } from './shared/services/llm/llmMemo'
import { clearLlmArtifacts } from './shared/services/llm/llmArtifactStore'
import { clearAllRecommendCache } from './features/place/services/recommendCache'
import {
  dateForTripDay,
  formatTripDayLabel,
  formatDayNightLabel,
  saveTripDates,
} from './features/itinerary/services/tripDates'
import {
  clearItineraryState,
  ensureBaselineFromGenerated,
  loadItineraryState,
} from './features/itinerary/utils/itineraryState'
import {
  recommendationPreferencesPrompt,
  saveRecommendationPreferences,
} from './features/place/services/recommendationPreferences'
import {
  buildHeroCopy,
  chineseDayCount,
} from './appHelpers'

const timelineContainerVariants = {
  enter: (_direction: number) => ({
    transition: {
      staggerChildren: 0.034,
      delayChildren: 0,
    },
  }),
  center: (_direction: number) => ({
    transition: {
      staggerChildren: 0.034,
      delayChildren: 0,
    },
  }),
  exit: (_direction: number) => ({
    opacity: 0,
    transition: {
      duration: 0.06,
      ease: 'easeIn' as const,
    },
  }),
}

export default function App() {
  const {
    email,
    canEdit,
    role,
    trips,
    activeTrip,
    switchTrip,
    signOut,
    notifyTripChanged,
    refreshTrips,
    tripSyncEpoch,
  } = useAuth()
  const readOnly = !canEdit
  const {
    shareOpen,
    setShareOpen,
    backupOpen,
    setBackupOpen,
    recommendationPreferencesOpen,
    setRecommendationPreferencesOpen,
    recommendationPreferences,
    setRecommendationPreferences,
  } = useTripDialogs()
  const { mobileItineraryPane, setMobileItineraryPane } = useMobilePane()
  const initialItinerary = useMemo(() => {
    const state = loadItineraryState()
    ensureBaselineFromGenerated(state)
    return state
  }, [])
  const {
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
    hotelReady,
  } = useTripCore()
  // Destination UI temporarily hidden — lock trip to Paris.
  const destination = '巴黎'
  const numberOfDaysRef = useRef(0)
  const {
    dayIndex,
    setDayIndex,
    selectedPlaceId,
    setSelectedPlaceId,
    days,
    setDays,
    customPlaces,
    setCustomPlaces,
    placesWithHotel,
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
    day,
  } = useItineraryDays(
    hotel,
    {
      days: initialItinerary.days,
      customPlaces: initialItinerary.customPlaces,
    },
    { numberOfDaysRef },
  )
  const [daySlideDirection, setDaySlideDirection] = useState<1 | -1>(1)

  const [openHotelDetailToken, setOpenHotelDetailToken] = useState(0)
  const handleSelectPlace = useCallback(
    (id: string) => {
      if (id === SELECTED_HOTEL_PLACE_ID) {
        setSelectedPlaceId(null)
        setOpenHotelDetailToken((n) => n + 1)
        return
      }
      setSelectedPlaceId(id)
    },
    [setSelectedPlaceId],
  )
  const handleRouteCacheChanged = useCallback(() => {
    notifyTripChanged()
  }, [notifyTripChanged])
  const {
    itineraryStart,
    setItineraryStart,
    itineraryStartLoading,
    setItineraryStartLoading,
    itineraryGenerated,
    setItineraryGenerated,
    itineraryFingerprint,
    setItineraryFingerprint,
    itineraryGenerating,
    setItineraryGenerating,
    itineraryIncrementalGenerating,
    itineraryGenError,
    setItineraryGenError,
    dayRegenerating,
    setDayRegenerating,
    dayRegenError,
    setDayRegenError,
    dayRestoring,
    setDayRestoring,
    itineraryLoadingLine,
    itineraryStartDate,
    numberOfDays,
    itineraryReady,
    missingForItinerary,
    canRestoreDefault,
    canRestoreDayDefault,
    isDayGenerationPending,
    showItineraryLoading,
    showItineraryContent,
    showItineraryError,
    showItineraryPartialError,
    runFullItineraryGeneration,
    handleResetDay,
    handleRegenerateItinerary,
    handleRestoreDefault,
    handleRestoreDayDefault,
    copyRefreshing,
    setCopyRefreshing,
    cancelInFlightGeneration,
    itineraryLoadingLineIndex,
  } = useItineraryGeneration(
    {
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
    },
    { setDays, setCustomPlaces, setDayIndex, setSelectedPlaceId },
  )
  const handleSelectDay = useCallback(
    (nextDayIndex: number) => {
      if (nextDayIndex === dayIndex) return
      setDaySlideDirection(nextDayIndex > dayIndex ? 1 : -1)
      setDayIndex(nextDayIndex)
      setSelectedPlaceId(null)
      setDayRegenError(null)
    },
    [dayIndex, setDayIndex, setSelectedPlaceId, setDayRegenError],
  )
  numberOfDaysRef.current = numberOfDays
  const [activeTab, setActiveTab] = useState<AppTab>('itinerary')
  const routePrefetchPlan = useMemo(
    () =>
      days
        .map((plan) => buildDayMapRouteSegments(plan, hotel, placesWithHotel))
        .filter((request) => request.segments.length > 0),
    [days, hotel, placesWithHotel],
  )
  const routePrefetchFingerprint = useMemo(
    () => routePrefetchPlan.map((request) => request.fingerprint).join('||'),
    [routePrefetchPlan],
  )
  const routePrefetchPlanRef = useRef(routePrefetchPlan)
  routePrefetchPlanRef.current = routePrefetchPlan

  useEffect(() => {
    if (
      !showItineraryContent ||
      itineraryGenerating ||
      itineraryIncrementalGenerating ||
      dayRegenerating ||
      dayRestoring ||
      !routePrefetchFingerprint
    ) {
      return
    }

    let active = true
    void (async () => {
      const requests = routePrefetchPlanRef.current
      let nextIndex = 0
      let fetchedAny = false
      const worker = async () => {
        while (active) {
          const index = nextIndex
          nextIndex += 1
          const request = requests[index]
          if (!request) return
          for (let attempt = 0; attempt < 2 && active; attempt += 1) {
            try {
              const result = await getOrFetchMapRouteSegments(
                request.profile,
                dayRouteSegmentsToRequests(request.segments),
              )
              if (result.fetchedFromNetwork) fetchedAny = true
              break
            } catch {
              if (attempt === 0) {
                await new Promise((resolve) => window.setTimeout(resolve, 900))
              }
              // Keep prefetch silent; TripMap surfaces the final error if opened.
            }
          }
        }
      }
      await Promise.all(
        Array.from(
          { length: Math.min(2, requests.length) },
          () => worker(),
        ),
      )
      if (active && fetchedAny && !readOnly) notifyTripChanged()
    })()

    return () => {
      active = false
    }
  }, [
    dayRegenerating,
    dayRestoring,
    itineraryGenerating,
    itineraryIncrementalGenerating,
    notifyTripChanged,
    readOnly,
    routePrefetchFingerprint,
    showItineraryContent,
  ])
  const [panelResetKey, setPanelResetKey] = useState(0)
  /**
   * Remount input panels / chat after a remote snapshot is reconciled.
   * Do NOT put this on DayTimeline — it owns gommage / swap / enter / FLIP
   * state; remounting on every soft-sync kills in-flight and future anims.
   */
  const [syncRenderKey, setSyncRenderKey] = useState(0)
  const prevStopsKeyRef = useRef<string | null>(null)
  const suppressCopyRef = useRef(false)
  /** Bumps on each day-copy request so cancelled runs can't leave the HUD stuck. */
  const copyRequestIdRef = useRef(0)
  /** False until hotel+flights+dates(+start resolve) have produced a stable fingerprint once. */
  const tripInputsHydratedRef = useRef(false)
  /** Nav distance/time recomputes mutate stop clocks — not user content edits. */
  const suppressCloudSaveRef = useRef(false)
  useTripSync(
    {
      tripSyncEpoch,
      canEdit,
      notifyTripChanged,
    },
    {
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
    },
    {
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
    },
    {
      prevStopsKeyRef,
      suppressCopyRef,
      copyRequestIdRef,
      tripInputsHydratedRef,
      suppressCloudSaveRef,
    },
    {
      cancelInFlightGeneration,
    },
  )

  // (itineraryReady + missingForItinerary are now provided by useItineraryGeneration.)

  const hero = useMemo(
    () => buildHeroCopy(destination, tripDates, hotel, days),
    [destination, tripDates, hotel, days],
  )
  /** Detail overlay for trip chat: PlacePanel selection wins over hotel popup. */
  const tripChatViewing = useMemo((): TripChatViewingTarget | null => {
    if (selectedPlaceId && selectedPlaceId !== SELECTED_HOTEL_PLACE_ID) {
      try {
        const place = getPlace(selectedPlaceId, placesWithHotel)
        const stop = day.stops.find((s) => s.placeId === selectedPlaceId)
        return {
          type: 'place',
          id: place.id,
          name: place.name,
          nameLocal: place.nameLocal || null,
          placeType: place.type,
          description: place.description || null,
          cuisine: place.cuisine || null,
          priceHint: place.priceHint || null,
          ratingHint: place.ratingHint || null,
          day: day.day,
          note: stop?.note || null,
        }
      } catch {
        /* fall through to hotel */
      }
    }
    if (viewingHotelDetail) {
      return {
        type: 'hotel',
        id: viewingHotelDetail.id,
        name: viewingHotelDetail.name,
        address: viewingHotelDetail.address || null,
        area: viewingHotelDetail.area || null,
        description: viewingHotelDetail.description || null,
        priceHint: viewingHotelDetail.priceHint || null,
        nearestMetro: viewingHotelDetail.nearestMetro || null,
        reason: viewingHotelDetail.reason || null,
        tripFit: viewingHotelDetail.tripFit || null,
      }
    }
    return null
  }, [selectedPlaceId, placesWithHotel, day.stops, day.day, viewingHotelDetail])
  const tripPlaceNames = useMemo(() => {
    const names: string[] = []
    for (const d of days) {
      for (const s of d.stops) {
        try {
          names.push(getPlace(s.placeId, placesWithHotel).name)
        } catch {
          /* skip */
        }
      }
    }
    return names
  }, [days, placesWithHotel])

  const dayPending = isDayGenerationPending(day.day)

  const { plan: navPlan, loading: navLoading } = useDayNav(
    day,
    hotel,
    placesWithHotel,
    itineraryReady &&
      (itineraryGenerated || itineraryIncrementalGenerating) &&
      !dayPending &&
      days.length > 0 &&
      day.stops.length > 0,
  )

  /** Last known CDG→hotel transit (Day 1), so flight updates can recompute off other days. */
  const day1TransitSecondsRef = useRef<number | null>(null)
  /** Skip re-applying clocks when switching back to a day whose nav+times already ran. */
  const navTimesAppliedKeyRef = useRef('')
  useItineraryDaysEffects(
    {
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
    },
    {
      prevStopsKeyRef,
      suppressCopyRef,
      copyRequestIdRef,
      navTimesAppliedKeyRef,
      day1TransitSecondsRef,
      suppressCloudSaveRef,
    },
  )

  const lastDayNum = numberOfDays
  const dayNightLabel = formatDayNightLabel(numberOfDays)

  function handleResetAll() {
    handleRegenerateItinerary()
  }

  /** Wipe dates / flights / hotel / itinerary (+ caches) back to a blank trip. */
  function handleClearAllTripState() {
    if (readOnly) return
    const ok = window.confirm(
      '清空日期、航班、酒店与行程，回到初始空状态？此操作不可撤销。',
    )
    if (!ok) return

    suppressCopyRef.current = true
    cancelInFlightGeneration()
    tripInputsHydratedRef.current = false

    clearItineraryState()
    clearFlightSelection()
    clearHotelCache()
    saveTripDates(null)
    clearAllFlightCache()
    clearAllRecommendCache()
    clearLlmMemo()
    clearLlmArtifacts()
    clearDayNavCache()
    navTimesAppliedKeyRef.current = ''
    try {
      // Legacy keys from older clients (now stored in llmArtifacts).
      sessionStorage.removeItem('paris-tour-popular-destinations-v1')
      localStorage.removeItem('paris-tour-popular-destinations-v1')
      sessionStorage.removeItem('paris-tour-review-translations-v1')
      localStorage.removeItem('paris-tour-rec-cache-v1')
    } catch {
      /* ignore */
    }

    setTripDates(null)
    setFlights({ outbound: null, returnFlight: null })
    setHotel(PENDING_HOTEL)
    setHotelCandidates([])
    setItineraryStart(null)
    setItineraryStartLoading(false)
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
    setCopyRefreshing(false)
    prevStopsKeyRef.current = null
    setPanelResetKey((k) => k + 1)
    notifyTripChanged({ force: true, allowEmptyTrip: true })
  }

  return (
    <div className="mx-auto min-h-[100svh] max-w-7xl px-3 pb-[max(6rem,calc(env(safe-area-inset-bottom)+5rem))] pt-[max(4.75rem,calc(env(safe-area-inset-top)+1.25rem))] sm:min-h-screen sm:px-6 sm:pb-16 sm:pt-6 lg:px-8">
      <CloudSaveIndicator />
      <ApiRequestMeter />
      <div className="mb-4 flex items-center justify-between gap-3">
        {/* Left: Brand Title & Trip Selector */}
        <div className="flex items-center gap-3 lg:min-w-[260px]">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[var(--copper)]/15 text-lg shadow-inner">
            🇫🇷
          </span>
          <div className="min-w-0">
            <h1 className="font-display text-base font-semibold leading-tight text-[var(--ink)] sm:text-lg">
              Paris Tour
            </h1>
            <div className="flex items-center gap-1.5 text-[11px] text-[var(--stone)]">
              <span>{chineseDayCount(numberOfDays)}行程规划</span>
              {trips.length > 1 && (
                <>
                  <span>·</span>
                  <select
                    className="max-w-[130px] truncate rounded border border-[var(--stone)]/20 bg-transparent text-[11px] text-[var(--ink)] outline-none hover:border-[var(--copper)]"
                    value={activeTrip?.id || ''}
                    onChange={(e) => {
                      void switchTrip(e.target.value).catch((err) => {
                        window.alert(err instanceof Error ? err.message : '切换失败')
                      })
                    }}
                  >
                    {trips.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Center: Desktop Navigation Tabs */}
        <div className="hidden lg:flex items-center justify-center">
          <TopNavSegment
            activeTab={activeTab}
            onSelectTab={setActiveTab}
            itineraryReady={itineraryReady}
          />
        </div>

        {/* Right: Desktop User Profile & Quick Actions */}
        <div className="flex items-center justify-end gap-2 lg:min-w-[260px]">
          {/* Quick Action: Backup (Desktop) */}
          {activeTrip && (
            <button
              type="button"
              onClick={() => setBackupOpen(true)}
              aria-label="存档备份"
              title="存档备份"
              className="hidden h-8 w-8 items-center justify-center rounded-full border border-black/5 bg-white/70 text-zinc-500 shadow-sm backdrop-blur-md transition-all hover:bg-white hover:text-zinc-800 hover:shadow active:scale-95 lg:inline-flex"
            >
              <Archive size={15} strokeWidth={1.9} />
            </button>
          )}

          {/* Quick Action: Share (Desktop) */}
          {role === 'owner' && activeTrip && (
            <button
              type="button"
              onClick={() => {
                setShareOpen(true)
                void refreshTrips().catch(() => undefined)
              }}
              aria-label="邀请协作分享"
              title="邀请协作分享"
              className="hidden h-8 w-8 items-center justify-center rounded-full border border-black/5 bg-white/70 text-zinc-500 shadow-sm backdrop-blur-md transition-all hover:bg-white hover:text-zinc-800 hover:shadow active:scale-95 lg:inline-flex"
            >
              <Share2 size={15} strokeWidth={1.9} />
            </button>
          )}

          {/* User Account Capsule Button */}
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className={`flex items-center gap-2 rounded-full border p-1 pl-1.5 pr-3 shadow-sm backdrop-blur-md transition-all hover:shadow active:scale-95 ${
              activeTab === 'profile'
                ? 'border-[var(--copper)]/40 bg-white'
                : 'border-black/5 bg-white/70 hover:bg-white'
            }`}
            title="查看个人中心与偏好"
          >
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--copper)]/15 text-xs font-bold text-[var(--copper)]">
              {email ? email.charAt(0).toUpperCase() : <User size={13} />}
            </div>
            <span className="hidden max-w-[130px] truncate text-xs font-medium text-[var(--ink)] sm:inline-block">
              {email}
            </span>
            {role && (
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  role === 'owner'
                    ? 'bg-[var(--copper)]/10 text-[var(--copper)]'
                    : role === 'editor'
                      ? 'bg-[var(--sage)]/15 text-[var(--sage)]'
                      : 'bg-[var(--mist)] text-[var(--stone)]'
                }`}
              >
                {role === 'owner' ? '拥有者' : role === 'editor' ? '协作' : '只读'}
              </span>
            )}
          </button>
        </div>
      </div>

      {role === 'owner' && activeTrip && (
        <ShareDialog
          tripId={activeTrip.id}
          open={shareOpen}
          onClose={() => setShareOpen(false)}
        />
      )}

      {activeTrip && (
        <BackupDialog
          tripId={activeTrip.id}
          open={backupOpen}
          onClose={() => setBackupOpen(false)}
          onRestored={() => {
            setBackupOpen(false)
            window.location.reload()
          }}
        />
      )}

      <main className="mt-4 space-y-6 sm:mt-6 sm:space-y-8">
        <AnimatePresence mode="wait">
          {activeTab === 'itinerary' && (
            <motion.div
              key="tab-itinerary"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="space-y-4"
            >
              {/* Top Quick Itinerary Summary Strip */}
              {itineraryReady && (
                <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-white/80 bg-white/70 px-4 py-3 shadow-[0_4px_20px_rgba(0,0,0,0.04)] backdrop-blur-xl transition-colors">
                  <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
                    <span className="font-semibold text-[var(--copper)]">
                      {chineseDayCount(numberOfDays)}行程
                    </span>
                    {datesReady && (
                      <span className="text-[var(--stone)]">
                        · {dayNightLabel}
                        {tripDates?.endDate && itineraryStartDate ? (
                          <span>
                            {' '}({formatTripDayLabel(itineraryStartDate)} → {formatTripDayLabel(tripDates.endDate)})
                          </span>
                        ) : null}
                      </span>
                    )}
                    {hotel?.name && (
                      <span className="rounded-full bg-black/[0.04] px-2.5 py-0.5 text-xs text-[var(--ink)] font-medium">
                        🏨 {hotel.name}
                      </span>
                    )}
                    {itineraryStartLoading && !itineraryStart ? (
                      <span className="text-[var(--stone)] text-xs">（正在核对抵达时间…）</span>
                    ) : itineraryStart?.reasonZh ? (
                      <span className="text-[var(--stone)] text-xs">· {itineraryStart.reasonZh}</span>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-1.5">
                    {!readOnly &&
                      itineraryReady &&
                      (itineraryGenerated || itineraryIncrementalGenerating) && (
                        <>
                          {canRestoreDefault && (
                            <button
                              type="button"
                              onClick={handleRestoreDefault}
                              aria-label="恢复默认推荐"
                              title="恢复默认推荐"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-black/5 bg-white/80 text-zinc-600 shadow-sm backdrop-blur-md transition-all hover:bg-white hover:text-zinc-900 active:scale-95"
                            >
                              <History size={15} strokeWidth={1.8} aria-hidden />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={handleResetAll}
                            aria-label="重新生成全部"
                            title="重新生成全部"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-black/5 bg-white/80 text-zinc-600 shadow-sm backdrop-blur-md transition-all hover:bg-white hover:text-zinc-900 active:scale-95"
                          >
                            <Sparkles size={15} strokeWidth={1.8} aria-hidden />
                          </button>
                        </>
                      )}
                  </div>
                </div>
              )}

              {itineraryReady ? (
                <section className="space-y-4">
                  {showItineraryLoading && (
                    <div className="rounded-2xl border border-[var(--sage)]/25 bg-[var(--card)] px-4 py-8">
                      <LoadingIndicator
                        variant="block"
                        mode="thinking"
                        task="itineraryGenerate"
                        label={
                          <span
                            key={itineraryLoadingLineIndex}
                            className="animate-fade-up inline-block max-w-md text-center"
                          >
                            {itineraryLoadingLine}
                          </span>
                        }
                        showDots
                        size="md"
                      />
                      <p className="mt-2 text-center text-xs text-[var(--stone)]">
                        根据日期、航班与酒店生成完整多日行程，首次可能需要一小会儿。
                      </p>
                    </div>
                  )}

                  {showItineraryError && (
                    <div className="rounded-2xl border border-dashed border-[var(--copper)]/40 bg-[var(--card)] px-4 py-6 text-center">
                      <p className="font-medium text-[var(--ink)]">行程生成失败</p>
                      <p className="mt-1 whitespace-pre-line break-words text-left text-sm text-[var(--stone)] sm:text-center">
                        {itineraryGenError}
                      </p>
                      {!readOnly && (
                        <button
                          type="button"
                          onClick={() => {
                            setItineraryGenError(null)
                            void runFullItineraryGeneration()
                          }}
                          className="mt-4 rounded-full bg-[var(--ink)] px-4 py-2 text-sm text-[var(--paper)] hover:opacity-90"
                        >
                          再试一次
                        </button>
                      )}
                    </div>
                  )}

                  {showItineraryPartialError && (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-[var(--copper)]/40 bg-[var(--card)] px-4 py-3">
                      <div className="min-w-0 text-left">
                        <p className="text-sm font-medium text-[var(--ink)]">
                          后续天数生成中断
                        </p>
                        <p className="mt-0.5 whitespace-pre-line break-words text-xs text-[var(--stone)]">
                          {itineraryGenError}
                        </p>
                      </div>
                      {!readOnly && (
                        <button
                          type="button"
                          onClick={() => {
                            setItineraryGenError(null)
                            void runFullItineraryGeneration({ resume: true })
                          }}
                          className="shrink-0 rounded-full bg-[var(--ink)] px-3 py-1.5 text-sm text-[var(--paper)] hover:opacity-90"
                        >
                          继续生成
                        </button>
                      )}
                    </div>
                  )}

                  {showItineraryContent && (
                    <>
                      <div className="space-y-2">
                        <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1 [touch-action:pan-x] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                          {days.map((d, i) => {
                            const cal = dateForTripDay(itineraryStartDate, d.day)
                            return (
                              <DayTabButton
                                key={d.day}
                                dayNumber={d.day}
                                dateLabel={
                                  cal ? formatTripDayLabel(cal) : undefined
                                }
                                title={d.title}
                                pending={isDayGenerationPending(d.day)}
                                active={i === dayIndex}
                                onSelect={() => handleSelectDay(i)}
                              />
                            )
                          })}
                        </div>

                        <div
                          className="relative flex gap-1 rounded-full border border-white/80 bg-white/70 p-1 shadow-sm backdrop-blur-xl lg:hidden"
                          role="tablist"
                          aria-label="行程视图"
                        >
                          <button
                            type="button"
                            role="tab"
                            aria-selected={mobileItineraryPane === 'timeline'}
                            onClick={() => setMobileItineraryPane('timeline')}
                            className="relative isolate flex-1 rounded-full px-3 py-2 text-sm transition-colors outline-none"
                          >
                            {mobileItineraryPane === 'timeline' && (
                              <motion.span
                                layoutId="itinerary-pane-pill"
                                className="absolute inset-0 z-0 rounded-full border border-black/[0.04] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
                                animate={{
                                  scaleX: [1, 1.15, 0.95, 1],
                                  scaleY: [1, 0.88, 1.04, 1],
                                }}
                                transition={{
                                  layout: { type: 'spring', stiffness: 420, damping: 28, mass: 0.8 },
                                  scaleX: { duration: 0.32, ease: [0.22, 1, 0.36, 1] },
                                  scaleY: { duration: 0.32, ease: [0.22, 1, 0.36, 1] },
                                }}
                              />
                            )}
                            <span className={`relative z-10 font-medium transition-colors duration-200 ${mobileItineraryPane === 'timeline' ? 'font-semibold text-[var(--copper)]' : 'text-zinc-500'}`}>
                              时间线
                            </span>
                          </button>
                          <button
                            type="button"
                            role="tab"
                            aria-selected={mobileItineraryPane === 'map'}
                            onClick={() => setMobileItineraryPane('map')}
                            className="relative isolate flex-1 rounded-full px-3 py-2 text-sm transition-colors outline-none"
                          >
                            {mobileItineraryPane === 'map' && (
                              <motion.span
                                layoutId="itinerary-pane-pill"
                                className="absolute inset-0 z-0 rounded-full border border-black/[0.04] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
                                animate={{
                                  scaleX: [1, 1.15, 0.95, 1],
                                  scaleY: [1, 0.88, 1.04, 1],
                                }}
                                transition={{
                                  layout: { type: 'spring', stiffness: 420, damping: 28, mass: 0.8 },
                                  scaleX: { duration: 0.32, ease: [0.22, 1, 0.36, 1] },
                                  scaleY: { duration: 0.32, ease: [0.22, 1, 0.36, 1] },
                                }}
                              />
                            )}
                            <span className={`relative z-10 font-medium transition-colors duration-200 ${mobileItineraryPane === 'map' ? 'font-semibold text-[var(--copper)]' : 'text-zinc-500'}`}>
                              地图
                            </span>
                          </button>
                        </div>
                      </div>

                      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                        <div
                          className={
                            mobileItineraryPane === 'timeline'
                              ? 'block w-full min-w-0 max-w-full'
                              : 'hidden lg:block lg:w-full lg:min-w-0 lg:max-w-full'
                          }
                        >
                          <AnimatePresence mode="wait" custom={daySlideDirection} initial={false}>
                            <motion.div
                              key={`timeline-${day.day}-${hotel.id}`}
                              custom={daySlideDirection}
                              variants={timelineContainerVariants}
                              initial="enter"
                              animate="center"
                              exit="exit"
                              className="w-full min-w-0 max-w-full"
                            >
                              <DayTimeline
                                day={day}
                                hotel={hotel}
                                direction={daySlideDirection}
                                customPlaces={placesWithHotel}
                                selectedPlaceId={selectedPlaceId}
                                navPlan={navPlan}
                                copyRefreshing={copyRefreshing}
                                dayRegenerating={dayRegenerating}
                                dayRegenError={dayRegenError}
                                dayRestoring={dayRestoring}
                                dayPending={dayPending}
                                isLastDay={day.day === lastDayNum}
                                onSelectPlace={handleSelectPlace}
                                onReorder={handleReorder}
                                onDelete={handleDelete}
                                onAddCustom={handleAddCustom}
                                onResetDay={() => {
                                  void handleResetDay(dayIndex)
                                }}
                                canRestoreDayDefault={canRestoreDayDefault}
                                onRestoreDayDefault={() => {
                                  handleRestoreDayDefault(dayIndex)
                                }}
                                tripPlaceNames={tripPlaceNames}
                                readOnly={readOnly}
                                recommendationPreferences={recommendationPreferences}
                              />
                            </motion.div>
                          </AnimatePresence>
                        </div>
                        <div
                          className={`space-y-4 ${
                            mobileItineraryPane === 'map'
                              ? 'block'
                              : 'hidden lg:block'
                          }`}
                        >
                          <MapErrorBoundary>
                            <React.Suspense fallback={<div className="flex h-[min(60vh,440px)] w-full items-center justify-center bg-[var(--mist)] text-sm text-[var(--stone)] md:h-[560px]">地图加载中…</div>}>
                              <TripMap
                                hotel={hotel}
                                day={day}
                                customPlaces={placesWithHotel}
                                selectedPlaceId={selectedPlaceId}
                                onSelectPlace={handleSelectPlace}
                                onRouteCacheChanged={handleRouteCacheChanged}
                              />
                            </React.Suspense>
                          </MapErrorBoundary>
                          <PlacePanel
                            key={`place-panel-${day.day}-${hotel.id}`}
                            placeId={selectedPlaceId}
                            customPlaces={placesWithHotel}
                            day={day}
                            hotel={hotel}
                            days={days}
                            onGoogleIdentityResolved={handleGoogleIdentityResolved}
                            onClose={() => setSelectedPlaceId(null)}
                          />
                        </div>
                      </div>
                    </>
                  )}
                </section>
              ) : (
                <div className="rounded-2xl border border-dashed border-[var(--copper)]/35 bg-[var(--card)] px-6 py-12 text-center space-y-4 shadow-sm">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--copper)]/10 text-[var(--copper)]">
                    <Luggage size={28} />
                  </div>
                  <h3 className="font-display text-xl sm:text-2xl text-[var(--ink)]">
                    还差几项才能查看完整多日行程
                  </h3>
                  <p className="max-w-md mx-auto text-sm text-[var(--stone)]">
                    请先完成：{missingForItinerary.join(' · ')}。在「出行」Tab 中配置出发与结束日期并选定入住酒店，AI 即可为您量身规划巴黎深度游玩路线。
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('logistics')}
                    className="inline-flex items-center gap-2 rounded-full bg-[var(--ink)] px-6 py-2.5 text-sm font-medium text-[var(--paper)] shadow-md transition-all hover:opacity-90 active:scale-95"
                  >
                    <Luggage size={16} />
                    <span>前往「出行」配置</span>
                  </button>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'logistics' && (
            <motion.div
              key="tab-logistics"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="space-y-8 sm:space-y-10"
            >
              <header className="relative overflow-hidden rounded-2xl border border-white/60 bg-[linear-gradient(135deg,rgba(28,36,32,0.92),rgba(74,99,86,0.88))] px-5 py-7 text-[var(--paper)] shadow-[var(--shadow)] sm:rounded-[28px] sm:px-10 sm:py-14">
                <div
                  className="pointer-events-none absolute inset-0 opacity-35"
                  style={{
                    backgroundImage:
                      'url(https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=1600&q=60)',
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    mixBlendMode: 'luminosity',
                  }}
                />
                <div className="relative max-w-2xl animate-fade-up">
                  <p className="text-[10px] uppercase tracking-[0.28em] text-[var(--gold)] sm:text-xs">
                    {hero.eyebrow}
                  </p>
                  <h1 className="font-display mt-2 text-[2rem] leading-[1.05] sm:text-5xl sm:leading-none md:text-6xl lg:text-7xl">
                    {hero.title}
                  </h1>
                  <p className="mt-3 max-w-lg text-sm text-[var(--paper)]/85 sm:mt-4 sm:text-base md:text-lg">
                    {hero.blurb}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs sm:mt-6 sm:text-sm">
                    {hero.tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-white/10 px-3 py-1 backdrop-blur">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </header>

              <TripDatesPanel
                key={`dates-${panelResetKey}-${syncRenderKey}`}
                value={tripDates}
                onChange={setTripDates}
                readOnly={readOnly}
              />
              <FlightPanel
                key={`flights-${panelResetKey}-${syncRenderKey}`}
                tripDates={tripDates}
                destination={destination}
                onFlightsChange={setFlights}
                readOnly={readOnly}
              />
              <HotelPicker
                key={`hotel-${panelResetKey}-${syncRenderKey}`}
                selected={hotel}
                candidates={hotelCandidates}
                days={days}
                onSelect={setHotel}
                onCandidatesChange={setHotelCandidates}
                readOnly={readOnly}
                onDetailChange={setViewingHotelDetail}
                openSelectedDetailToken={openHotelDetailToken}
              />

              {itineraryReady && (
                <div className="flex justify-center pt-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab('itinerary')}
                    className="inline-flex items-center gap-2 rounded-full bg-[var(--ink)] px-8 py-3 text-sm font-medium text-[var(--paper)] shadow-lg hover:opacity-90 active:scale-95"
                  >
                    <CalendarDays size={16} />
                    <span>查看已生成的每日行程 →</span>
                  </button>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'profile' && (
            <ProfileTab
              email={email}
              role={role}
              onSignOut={() => void signOut()}
              onOpenShare={
                role === 'owner' && Boolean(activeTrip)
                  ? () => {
                      setShareOpen(true)
                      void refreshTrips().catch(() => undefined)
                    }
                  : undefined
              }
              onOpenBackup={() => setBackupOpen(true)}
              onOpenPreferences={() => setRecommendationPreferencesOpen(true)}
              onClearAll={!readOnly ? handleClearAllTripState : undefined}
              trips={trips}
              activeTripId={activeTrip?.id}
              onSwitchTrip={(tripId) => {
                void switchTrip(tripId).catch((err) => {
                  window.alert(err instanceof Error ? err.message : '切换失败')
                })
              }}
              readOnly={readOnly}
              recommendationPreferences={recommendationPreferences}
            />
          )}
        </AnimatePresence>

        <footer className="rounded-3xl border border-white/80 bg-white/60 px-5 py-4 text-xs text-zinc-500 shadow-sm backdrop-blur-xl transition-colors">
          <p>
            航班与营业信息会变动；详情页显示生成时缓存的 Google 评分及 Tripadvisor 详情。自驾日请确认低排放区（Crit’Air）与租车保险。
          </p>
        </footer>
      </main>

      {/* Mobile Native Bottom Navigation Bar */}
      <BottomNavBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        itineraryReady={itineraryReady}
      />

      {!readOnly && (
        <TripChatPanel
          key={`chat-${panelResetKey}-${syncRenderKey}`}
          hotel={hotel}
          hotelCandidates={hotelCandidates}
          days={days}
          currentDay={day.day}
          customPlaces={placesWithHotel}
          destination={destination}
          tripStartDate={tripDates?.startDate}
          tripEndDate={tripDates?.endDate}
          itineraryStartDate={itineraryStartDate}
          outbound={flights.outbound}
          returnFlight={flights.returnFlight}
          viewing={tripChatViewing}
          preferences={recommendationPreferencesPrompt(
            recommendationPreferences,
          ).join('；')}
          handlers={{
            switchDay: handleSwitchDay,
            selectPlace: handleSelectPlace,
            removeStop: handleDeleteOnDay,
            addPlace: handleAddOnDay,
            replaceStop: handleReplaceOnDay,
            reorderStop: handleReorderOnDay,
            setHotel,
            setHotelCandidates,
          }}
        />
      )}

      <RecommendationPreferencesDialog
        open={recommendationPreferencesOpen}
        value={recommendationPreferences}
        onSave={(next) => {
          const saved = saveRecommendationPreferences(next)
          setRecommendationPreferences(saved)
        }}
        onClose={() => setRecommendationPreferencesOpen(false)}
      />
    </div>
  )
}
