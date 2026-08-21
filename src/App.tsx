import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Archive,
  CalendarDays,
  Check,
  ChevronRight,
  History,
  Hotel as HotelIcon,
  Luggage,
  MapPin,
  Moon,
  Plane,
  Share2,
  Sparkles,
} from 'lucide-react'
import { useAuth } from './features/auth/authContext'
import { useTripCore } from './hooks/useTripCore'
import { useItineraryGeneration } from './hooks/useItineraryGeneration'
import { useItineraryDays, useItineraryDaysEffects } from './hooks/useItineraryDays'
import { useMobilePane } from './hooks/useMobilePane'
import { useTripDialogs } from './hooks/useTripDialogs'
import { useTripSync } from './hooks/useTripSync'
import { DayTimeline } from './features/itinerary/components/DayTimeline'
import { DayTabButton } from './features/itinerary/components/DayTabButton'
import { LogisticsTravelSection } from './features/flight/components/LogisticsTravelSection'
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
import { TripSelectorCapsule } from './features/cloud-sync/components/TripSelectorCapsule'
import { TripChatPanelLazy as TripChatPanel } from './features/chat/components/TripChatPanel.lazy'
import type { TripChatViewingTarget } from './features/chat/services/tripChat'
import { BottomNavBar } from './features/navigation/components/BottomNavBar'
import { TopNavSegment } from './features/navigation/components/TopNavSegment'
import { ProfileTab } from './features/navigation/components/ProfileTab'
import { UserAvatarView } from './shared/components/UserAvatarView'
import { useUserAvatar } from './features/auth/services/avatarStore'
import type { AppTab } from './features/navigation/types'
const TripMap = React.lazy(() =>
  import('./features/map/components/TripMap').then((m) => ({ default: m.TripMap })),
)
import {
  buildDayMapRouteSegments,
  dayRouteSegmentsToRequests,
} from './features/map/services/mapDayRoute'
import {
  getOrFetchMapRouteSegments,
  isOpenRouteServiceDisabled,
} from './features/map/services/openRouteService'
import { MapErrorBoundary } from './features/map/components/MapErrorBoundary'
import { PENDING_HOTEL } from './features/hotel/constants/hotels'
import { destinationBrandFromDestination } from './features/destination/services/tripCity'
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
  daysBetween,
  formatTripDayLabel,
  loadTripDates,
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
  chineseDayCount,
  destinationLabel,
  hasTripDates,
} from './appHelpers'
import { isHotelSelected } from './features/hotel/constants/hotels'
import {
  glassCapsuleSurfaceClass,
  glassCapsuleToneClass,
  glassCardSurfaceClass,
} from './shared/styles/glassCapsule'
import { ConfirmDialog } from './shared/components/ConfirmDialog'

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

const itinerarySummaryCapsuleClass =
  `${glassCapsuleSurfaceClass} inline-flex h-7 shrink-0 items-center gap-1 px-2.5 text-xs`

const itinerarySummaryCapsuleTone = {
  destination: glassCapsuleToneClass.copper,
  duration: glassCapsuleToneClass.sage,
  dates: glassCapsuleToneClass.blue,
  hotel: glassCapsuleToneClass.gold,
  flights: glassCapsuleToneClass.violet,
} as const

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
  const { avatar } = useUserAvatar(email)
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
  const [hasInteractedPane, setHasInteractedPane] = useState(false)
  const [hasInteractedDay, setHasInteractedDay] = useState(false)
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
  const destinationBrand = destinationBrandFromDestination(destination)
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
  const [activeTab, setActiveTab] = useState<AppTab>(() =>
    hasTripDates(loadTripDates()) ? 'itinerary' : 'logistics',
  )
  const tabScrollPositionsRef = useRef<Record<AppTab, number>>({
    itinerary: 0,
    logistics: 0,
    profile: 0,
  })
  const handleSelectTab = useCallback(
    (nextTab: AppTab) => {
      if (nextTab === activeTab) return

      tabScrollPositionsRef.current[activeTab] = window.scrollY
      setHasInteractedDay(false)
      setHasInteractedPane(false)
      setActiveTab(nextTab)
    },
    [activeTab],
  )
  const restoreTabScroll = useCallback(
    (tab: AppTab) => {
      // AnimatePresence keeps the outgoing tab mounted briefly. Only restore
      // once the incoming tab has mounted and its full height is measurable.
      if (tab !== activeTab) return
      window.scrollTo(0, tabScrollPositionsRef.current[tab])
    },
    [activeTab],
  )
  const handleSelectPlace = useCallback(
    (id: string) => {
      setSelectedPlaceId(id)
    },
    [setSelectedPlaceId],
  )
  const handleRouteCacheChanged = useCallback(() => {
    notifyTripChanged()
  }, [notifyTripChanged])
  const {
    setItineraryStart,
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

  const [confirmRegenAllOpen, setConfirmRegenAllOpen] = useState(false)
  const [confirmRestoreDefaultOpen, setConfirmRestoreDefaultOpen] = useState(false)
  const [confirmClearAllOpen, setConfirmClearAllOpen] = useState(false)

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
      !routePrefetchFingerprint ||
      isOpenRouteServiceDisabled()
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
          if (isOpenRouteServiceDisabled()) return
          const index = nextIndex
          nextIndex += 1
          const request = requests[index]
          if (!request) return
          for (let attempt = 0; attempt < 2 && active; attempt += 1) {
            if (isOpenRouteServiceDisabled()) return
            try {
              const result = await getOrFetchMapRouteSegments(
                request.profile,
                dayRouteSegmentsToRequests(request.segments),
              )
              if (result.fetchedFromNetwork) fetchedAny = true
              break
            } catch {
              if (attempt === 0 && !isOpenRouteServiceDisabled()) {
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

  function handleResetAll() {
    setConfirmRegenAllOpen(true)
  }

  /** Wipe dates / flights / hotel / itinerary (+ caches) back to a blank trip. */
  function handleClearAllTripState() {
    if (readOnly) return
    setConfirmClearAllOpen(true)
  }

  function doClearAllTripState() {
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
    <div className="mx-auto min-h-screen max-w-7xl px-3 pb-[max(6rem,calc(env(safe-area-inset-bottom)+5rem))] pt-[max(4.75rem,calc(env(safe-area-inset-top)+1.25rem))] sm:px-6 sm:pb-16 sm:pt-6 lg:px-8">
      <CloudSaveIndicator />
      <ApiRequestMeter />
      <div className="mb-4 flex items-center justify-between gap-3">
        {/* Left: Brand Title & Trip Selector */}
        <div className="lg:min-w-[260px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={`header-brand-${activeTab}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="flex items-center gap-3"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[var(--copper)]/15 text-lg shadow-inner">
                {destinationBrand.flag}
              </span>
              <div className="min-w-0">
                <h1 className="font-display text-base font-semibold leading-tight text-[var(--ink)] sm:text-lg">
                  {destinationBrand.title}
                </h1>
                <div className="flex items-center gap-1.5 text-[11px] text-[var(--stone)] mt-0.5">
                  <span className="shrink-0">{chineseDayCount(numberOfDays)}行程规划</span>
                  {(trips.length > 1 || (activeTrip && activeTrip.role !== 'owner')) && (
                    <>
                      <span className="text-[var(--stone)]/40">·</span>
                      <TripSelectorCapsule
                        trips={trips}
                        activeTrip={activeTrip}
                        onSelectTrip={switchTrip}
                      />
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Center: Desktop Navigation Tabs */}
        <div className="hidden lg:flex items-center justify-center">
          <TopNavSegment
            activeTab={activeTab}
            onSelectTab={handleSelectTab}
            itineraryReady={itineraryReady}
          />
        </div>

        {/* Right: Desktop User Profile & Quick Actions */}
        <div className="flex justify-end lg:min-w-[260px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={`header-account-${activeTab}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="flex items-center justify-end gap-2"
            >
              {/* Quick Action: Backup (Desktop) */}
              {activeTrip && (
                <button
                  type="button"
                  onClick={() => setBackupOpen(true)}
                  aria-label="存档备份"
                  title="存档备份"
                  className="hidden h-8 w-8 items-center justify-center rounded-full border border-white/80 dark:border-white/10 bg-white/70 dark:bg-white/10 text-zinc-600 dark:text-zinc-300 shadow-sm backdrop-blur-md transition-all hover:bg-white/90 dark:hover:bg-white/20 hover:text-zinc-900 dark:hover:text-zinc-100 hover:shadow active:scale-95 lg:inline-flex cursor-pointer"
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
                  className="hidden h-8 w-8 items-center justify-center rounded-full border border-white/80 dark:border-white/10 bg-white/70 dark:bg-white/10 text-zinc-600 dark:text-zinc-300 shadow-sm backdrop-blur-md transition-all hover:bg-white/90 dark:hover:bg-white/20 hover:text-zinc-900 dark:hover:text-zinc-100 hover:shadow active:scale-95 lg:inline-flex cursor-pointer"
                >
                  <Share2 size={15} strokeWidth={1.9} />
                </button>
              )}

              {/* User Account Capsule Button */}
              <button
                type="button"
                onClick={() => handleSelectTab('profile')}
                className="flex items-center gap-1.5 rounded-full border border-white/80 dark:border-white/10 bg-white/70 dark:bg-white/10 p-1 sm:pl-1.5 sm:pr-3 shadow-sm backdrop-blur-md transition-all hover:bg-white/90 dark:hover:bg-white/20 hover:shadow active:scale-95 cursor-pointer"
                title="查看个人中心与偏好"
              >
                <UserAvatarView
                  avatar={avatar}
                  email={email}
                  size="sm"
                  shape="circle"
                  className="border border-white/90 dark:border-white/20"
                />
                <span className="hidden max-w-[130px] truncate text-xs font-medium text-[var(--ink)] sm:inline-block">
                  {email}
                </span>
                {role && (
                  <span
                    className={`hidden sm:inline-flex ${glassCapsuleSurfaceClass} items-center px-2 py-0.5 text-[10px] font-medium whitespace-nowrap ${
                      role === 'owner'
                        ? `${glassCapsuleToneClass.copper} text-[var(--copper)]`
                        : role === 'editor'
                          ? `${glassCapsuleToneClass.sage} text-[var(--sage)]`
                          : `${glassCapsuleToneClass.neutral} text-[var(--stone)]`
                    }`}
                  >
                    {role === 'owner' ? '拥有者' : role === 'editor' ? '协作' : '只读'}
                  </span>
                )}
              </button>
            </motion.div>
          </AnimatePresence>
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
              onAnimationStart={() => restoreTabScroll('itinerary')}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="space-y-4"
            >
              {/* Top Quick Itinerary Summary Strip */}
              {itineraryReady && (
                <div className="flex items-center justify-between gap-2.5 rounded-2xl border border-white/80 dark:border-white/10 bg-white/70 dark:bg-[#18201c]/80 px-3 py-2.5 shadow-[0_4px_20px_rgba(0,0,0,0.04)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.3)] backdrop-blur-xl transition-colors sm:px-4 sm:py-3">
                  <div
                    className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-0.5 [touch-action:pan-x] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_right,black_calc(100%-12px),transparent_100%)] [-webkit-mask-image:linear-gradient(to_right,black_calc(100%-12px),transparent_100%)]"
                    aria-label="行程摘要"
                  >
                    <span
                      className={`${itinerarySummaryCapsuleClass} ${itinerarySummaryCapsuleTone.destination} font-semibold text-[var(--copper)] dark:text-zinc-200`}
                      title="旅行目的地"
                    >
                      <MapPin size={13} strokeWidth={2} className="text-[var(--copper)]" aria-hidden />
                      {destination}
                    </span>
                    <span
                      className={`${itinerarySummaryCapsuleClass} ${itinerarySummaryCapsuleTone.duration} font-medium text-[var(--sage)] dark:text-zinc-200`}
                      title="行程时长"
                    >
                      <Moon size={13} strokeWidth={2} className="text-[var(--sage)]" aria-hidden />
                      {numberOfDays}天{Math.max(0, numberOfDays - 1)}晚
                    </span>
                    {datesReady && tripDates?.startDate && tripDates.endDate && (
                      <span
                        className={`${itinerarySummaryCapsuleClass} ${itinerarySummaryCapsuleTone.dates} font-medium text-[var(--stone)] dark:text-zinc-200`}
                        title="旅行日期"
                      >
                        <CalendarDays size={13} strokeWidth={2} className="text-[var(--stone)] dark:text-[#7bb5ff]" aria-hidden />
                        {formatTripDayLabel(tripDates.startDate)}–{formatTripDayLabel(tripDates.endDate)}
                      </span>
                    )}
                    {hotel?.name && (
                      <button
                        type="button"
                        onClick={() => handleSelectPlace(SELECTED_HOTEL_PLACE_ID)}
                        className={`${itinerarySummaryCapsuleClass} ${itinerarySummaryCapsuleTone.hotel} max-w-[12rem] font-medium text-[var(--stone)] dark:text-zinc-200 transition-colors hover:bg-[#eee1c6]/90 dark:hover:bg-white/10 active:scale-95`}
                        title={`查看酒店详情：${hotel.name}`}
                      >
                        <HotelIcon size={13} className="shrink-0 text-[var(--stone)] dark:text-[#deb881]" strokeWidth={2} aria-hidden />
                        <span className="truncate text-xs font-medium">{hotel.name}</span>
                      </button>
                    )}
                    {(flights.outbound?.flightNumber || flights.returnFlight?.flightNumber) && (
                      <span
                        className={`${itinerarySummaryCapsuleClass} ${itinerarySummaryCapsuleTone.flights} font-medium text-[var(--stone)] dark:text-zinc-200`}
                        title="往返航班"
                      >
                        <Plane size={13} strokeWidth={2} className="text-[var(--stone)] dark:text-[#a89bc5]" aria-hidden />
                        {flights.outbound?.flightNumber || '—'}
                        <span className="text-[var(--stone)] dark:text-zinc-400" aria-hidden>⇄</span>
                        {flights.returnFlight?.flightNumber || '—'}
                      </span>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    {!readOnly &&
                      itineraryReady &&
                      (itineraryGenerated || itineraryIncrementalGenerating) && (
                        <>
                          {canRestoreDefault && (
                            <button
                              type="button"
                              onClick={() => setConfirmRestoreDefaultOpen(true)}
                              aria-label="恢复默认推荐"
                              title="恢复默认推荐"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-black/5 dark:border-white/10 bg-white/80 dark:bg-white/10 text-zinc-600 dark:text-zinc-300 shadow-sm backdrop-blur-md transition-all hover:bg-white dark:hover:bg-white/20 hover:text-zinc-900 dark:hover:text-white active:scale-95"
                            >
                              <History size={15} strokeWidth={1.8} aria-hidden />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={handleResetAll}
                            aria-label="重新生成全部"
                            title="重新生成全部"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-black/5 dark:border-white/10 bg-white/80 dark:bg-white/10 text-zinc-600 dark:text-zinc-300 shadow-sm backdrop-blur-md transition-all hover:bg-white dark:hover:bg-white/20 hover:text-zinc-900 dark:hover:text-white active:scale-95"
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
                    <div className="rounded-2xl border border-white/80 dark:border-white/10 bg-white/65 dark:bg-[#18201c]/80 shadow-[0_8px_30px_rgba(0,0,0,0.04),inset_0_1px_1.5px_rgba(255,255,255,1)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.3)] backdrop-blur-xl px-4 py-8">
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
                    <div className="rounded-2xl border border-dashed border-[var(--copper)]/40 dark:border-[var(--copper)]/30 bg-white/60 dark:bg-[#18201c]/80 shadow-sm dark:shadow-none backdrop-blur-xl px-4 py-6 text-center">
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
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-[var(--copper)]/40 dark:border-[var(--copper)]/30 bg-white/60 dark:bg-[#18201c]/80 shadow-sm dark:shadow-none backdrop-blur-xl px-4 py-3">
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
                      <div className="flex flex-col gap-3 sm:gap-3.5">
                        <div className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-1.5 py-1 -mx-1.5 [touch-action:pan-x] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_right,black_calc(100%-12px),transparent_100%)] [-webkit-mask-image:linear-gradient(to_right,black_calc(100%-12px),transparent_100%)]">
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
                                hasInteracted={hasInteractedDay}
                                onSelect={() => {
                                  setHasInteractedDay(true)
                                  handleSelectDay(i)
                                }}
                              />
                            )
                          })}
                        </div>

                        <div
                          className="relative flex gap-1 rounded-full border border-white/80 dark:border-white/10 bg-white/70 dark:bg-[#18201c]/70 p-1 shadow-sm backdrop-blur-xl lg:hidden"
                          role="tablist"
                          aria-label="行程视图"
                        >
                          <button
                            type="button"
                            role="tab"
                            aria-selected={mobileItineraryPane === 'timeline'}
                            onClick={() => {
                              setHasInteractedPane(true)
                              setMobileItineraryPane('timeline')
                            }}
                            className="relative isolate flex-1 rounded-full px-3 py-2 text-sm transition-colors outline-none cursor-pointer"
                          >
                            {mobileItineraryPane === 'timeline' && (
                              <motion.span
                                layoutId="itinerary-pane-pill"
                                className="absolute inset-0 z-0 rounded-full border border-black/[0.04] dark:border-white/10 bg-white dark:bg-white/10 shadow-[0_2px_8px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.3)]"
                                animate={
                                  hasInteractedPane
                                    ? {
                                        scaleX: [1, 1.16, 0.95, 1],
                                        scaleY: [1, 0.88, 1.03, 1],
                                      }
                                    : undefined
                                }
                                transition={{
                                  layout: { type: 'spring', stiffness: 420, damping: 28, mass: 0.8 },
                                  scaleX: { duration: 0.32, ease: [0.22, 1, 0.36, 1] },
                                  scaleY: { duration: 0.32, ease: [0.22, 1, 0.36, 1] },
                                }}
                              />
                            )}
                            <span className={`relative z-10 font-medium transition-colors duration-200 ${mobileItineraryPane === 'timeline' ? 'font-semibold text-[var(--copper)]' : 'text-zinc-500 dark:text-zinc-400'}`}>
                              时间线
                            </span>
                          </button>
                          <button
                            type="button"
                            role="tab"
                            aria-selected={mobileItineraryPane === 'map'}
                            onClick={() => {
                              setHasInteractedPane(true)
                              setMobileItineraryPane('map')
                            }}
                            className="relative isolate flex-1 rounded-full px-3 py-2 text-sm transition-colors outline-none cursor-pointer"
                          >
                            {mobileItineraryPane === 'map' && (
                              <motion.span
                                layoutId="itinerary-pane-pill"
                                className="absolute inset-0 z-0 rounded-full border border-black/[0.04] dark:border-white/10 bg-white dark:bg-white/10 shadow-[0_2px_8px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.3)]"
                                animate={
                                  hasInteractedPane
                                    ? {
                                        scaleX: [1, 1.16, 0.95, 1],
                                        scaleY: [1, 0.88, 1.03, 1],
                                      }
                                    : undefined
                                }
                                transition={{
                                  layout: { type: 'spring', stiffness: 420, damping: 28, mass: 0.8 },
                                  scaleX: { duration: 0.32, ease: [0.22, 1, 0.36, 1] },
                                  scaleY: { duration: 0.32, ease: [0.22, 1, 0.36, 1] },
                                }}
                              />
                            )}
                            <span className={`relative z-10 font-medium transition-colors duration-200 ${mobileItineraryPane === 'map' ? 'font-semibold text-[var(--copper)]' : 'text-zinc-500 dark:text-zinc-400'}`}>
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
                <div className={`relative overflow-hidden rounded-3xl ${glassCardSurfaceClass} p-6 sm:p-10 text-center shadow-[0_8px_32px_rgba(0,0,0,0.06),inset_0_1px_2px_rgba(255,255,255,1)]`}>
                  {/* Subtle decorative background watermark */}
                  <div
                    className="pointer-events-none absolute inset-0 opacity-[0.035] grayscale"
                    style={{
                      backgroundImage:
                        'url(https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=1600&q=60)',
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }}
                  />

                  <div className="relative mx-auto max-w-lg space-y-5">
                    {/* Top Editorial Category Badge */}
                    <div className="inline-flex items-center gap-1.5 rounded-full border border-[var(--copper)]/25 bg-[var(--copper)]/10 px-3 py-1 text-[11px] font-semibold tracking-[0.18em] uppercase text-[var(--copper)]">
                      <Sparkles size={12} strokeWidth={2.2} />
                      <span>ITINERARY READINESS · 行程就绪准备</span>
                    </div>

                    {/* Central 3D Frosted Icon Badge */}
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-white/90 bg-gradient-to-br from-white/95 to-[#fcf6f0] text-[var(--copper)] shadow-[0_8px_24px_rgba(181,106,60,0.18),inset_0_1px_1.5px_rgba(255,255,255,1)] backdrop-blur-md">
                      <Luggage size={30} strokeWidth={1.9} />
                    </div>

                    {/* Typography */}
                    <div className="space-y-1.5">
                      <h3 className="font-display text-xl sm:text-2xl font-semibold text-[var(--ink)] tracking-tight">
                        还差几项即可生成完整多日行程
                      </h3>
                      <p className="text-xs sm:text-sm text-[var(--stone)] leading-relaxed max-w-md mx-auto">
                        配置旅行日期、往返航班与心仪酒店后，AI 将为您智能规划每日景点动线、合理串联交通与就餐建议。
                      </p>
                    </div>

                    {/* Interactive 3-Step Readiness Matrix */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 text-left">
                      {/* Step 1: Dates */}
                      <button
                        type="button"
                        onClick={() => handleSelectTab('logistics')}
                        className={`group relative flex items-center justify-between gap-2 rounded-2xl border p-3 text-xs transition-all duration-200 hover:shadow-sm active:scale-[0.98] ${
                          datesReady
                            ? 'border-emerald-200/80 bg-emerald-50/60 text-emerald-900'
                            : 'border-[var(--copper)]/20 bg-white/70 text-[var(--ink)] hover:border-[var(--copper)]/40 hover:bg-white/95'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm">📅</span>
                          <div className="min-w-0">
                            <p className="font-medium truncate">旅行日期</p>
                            <p className="text-[10.5px] text-[var(--stone)] truncate">
                              {datesReady ? `${tripDates?.startDate?.slice(5)} → ${tripDates?.endDate?.slice(5)}` : '待选定起止'}
                            </p>
                          </div>
                        </div>
                        {datesReady ? (
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-xs">
                            <Check size={11} strokeWidth={3} />
                          </span>
                        ) : (
                          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9.5px] font-semibold text-amber-700">
                            待办
                          </span>
                        )}
                      </button>

                      {/* Step 2: Flights */}
                      <button
                        type="button"
                        onClick={() => handleSelectTab('logistics')}
                        className={`group relative flex items-center justify-between gap-2 rounded-2xl border p-3 text-xs transition-all duration-200 hover:shadow-sm active:scale-[0.98] ${
                          flights.outbound && flights.returnFlight
                            ? 'border-emerald-200/80 bg-emerald-50/60 text-emerald-900'
                            : 'border-[var(--copper)]/20 bg-white/70 text-[var(--ink)] hover:border-[var(--copper)]/40 hover:bg-white/95'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm">✈️</span>
                          <div className="min-w-0">
                            <p className="font-medium truncate">往返航班</p>
                            <p className="text-[10.5px] text-[var(--stone)] truncate">
                              {flights.outbound && flights.returnFlight
                                ? `${flights.outbound.flightNumber} / ${flights.returnFlight.flightNumber}`
                                : flights.outbound
                                  ? `已填去程`
                                  : '待确认时刻'}
                            </p>
                          </div>
                        </div>
                        {flights.outbound && flights.returnFlight ? (
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-xs">
                            <Check size={11} strokeWidth={3} />
                          </span>
                        ) : (
                          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9.5px] font-semibold text-amber-700">
                            待办
                          </span>
                        )}
                      </button>

                      {/* Step 3: Hotel */}
                      <button
                        type="button"
                        onClick={() => handleSelectTab('logistics')}
                        className={`group relative flex items-center justify-between gap-2 rounded-2xl border p-3 text-xs transition-all duration-200 hover:shadow-sm active:scale-[0.98] ${
                          isHotelSelected(hotel)
                            ? 'border-emerald-200/80 bg-emerald-50/60 text-emerald-900'
                            : 'border-[var(--copper)]/20 bg-white/70 text-[var(--ink)] hover:border-[var(--copper)]/40 hover:bg-white/95'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm">🏨</span>
                          <div className="min-w-0">
                            <p className="font-medium truncate">入住酒店</p>
                            <p className="text-[10.5px] text-[var(--stone)] truncate">
                              {isHotelSelected(hotel) ? hotel.name : '待挑选住宿'}
                            </p>
                          </div>
                        </div>
                        {isHotelSelected(hotel) ? (
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-xs">
                            <Check size={11} strokeWidth={3} />
                          </span>
                        ) : (
                          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9.5px] font-semibold text-amber-700">
                            待办
                          </span>
                        )}
                      </button>
                    </div>

                    {/* Primary CTA Button: French Copper-Amber Gradient */}
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={() => handleSelectTab('logistics')}
                        className="group relative isolate inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#b36b3c] to-[#9a542b] px-6 py-2.5 text-sm font-semibold text-white shadow-[0_6px_20px_rgba(179,107,60,0.28),inset_0_1px_1px_rgba(255,255,255,0.4)] transition-all duration-200 hover:brightness-105 hover:shadow-[0_8px_24px_rgba(179,107,60,0.36)] active:scale-95"
                      >
                        <span
                          aria-hidden
                          className="pointer-events-none absolute inset-x-3 top-0 h-[1px] rounded-full bg-gradient-to-r from-transparent via-white/80 to-transparent"
                        />
                        <Luggage size={16} strokeWidth={2.2} />
                        <span>前往「出行」一键完善</span>
                        <ChevronRight size={15} strokeWidth={2.2} className="transition-transform group-hover:translate-x-0.5" />
                      </button>
                    </div>
                  </div>
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
              onAnimationStart={() => restoreTabScroll('logistics')}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="space-y-8 sm:space-y-10"
            >
              <header className={`relative overflow-hidden rounded-3xl ${glassCardSurfaceClass} p-6 sm:p-8 shadow-sm transition-all`}>
                <div
                  className="pointer-events-none absolute inset-0 opacity-10"
                  style={{
                    backgroundImage:
                      'url(https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=1600&q=60)',
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }}
                />
                <div className="relative max-w-3xl animate-fade-up">
                  <p className="text-xs uppercase tracking-[0.22em] text-[var(--copper)] font-semibold">
                    TRIP SETUP · 出行预订
                  </p>
                  <h1 className="font-display mt-1.5 text-2xl leading-tight text-[var(--ink)] sm:text-3xl lg:text-4xl">
                    {destinationLabel(destination)} · 出行与预订
                  </h1>
                  <p className="mt-1.5 text-sm text-[var(--stone)] leading-relaxed">
                    设置旅行起止日期、确认往返航班时刻并挑选心仪住宿。三项就绪后即可生成或浏览每日行程。
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs">
                    <span
                      className={`${glassCapsuleSurfaceClass} ${
                        tripDates ? glassCapsuleToneClass.blue : glassCapsuleToneClass.neutral
                      } px-3 py-1 text-xs ${tripDates ? 'text-sky-800 dark:text-sky-300 font-medium' : 'text-[var(--stone)]'}`}
                    >
                      {tripDates
                        ? `📅 ${tripDates.startDate} → ${tripDates.endDate} (${daysBetween(tripDates.startDate, tripDates.endDate)}天)`
                        : '📅 日期待选'}
                    </span>
                    <span
                      className={`${glassCapsuleSurfaceClass} ${
                        flights.outbound || flights.returnFlight
                          ? glassCapsuleToneClass.violet
                          : glassCapsuleToneClass.neutral
                      } px-3 py-1 text-xs ${
                        flights.outbound || flights.returnFlight
                          ? 'text-purple-900 dark:text-purple-300 font-medium'
                          : 'text-[var(--stone)]'
                      }`}
                    >
                      {flights.outbound && flights.returnFlight
                        ? `✈️ 航班已录入 (${flights.outbound.flightNumber} / ${flights.returnFlight.flightNumber})`
                        : flights.outbound
                          ? `✈️ 去程 ${flights.outbound.flightNumber}`
                          : flights.returnFlight
                            ? `✈️ 返程 ${flights.returnFlight.flightNumber}`
                            : '✈️ 航班待查'}
                    </span>
                    <span
                      className={`${glassCapsuleSurfaceClass} ${
                        isHotelSelected(hotel)
                          ? glassCapsuleToneClass.gold
                          : glassCapsuleToneClass.neutral
                      } px-3 py-1 text-xs ${
                        isHotelSelected(hotel)
                          ? 'text-amber-900 dark:text-amber-200 font-medium'
                          : 'text-[var(--stone)]'
                      }`}
                    >
                      {isHotelSelected(hotel) ? `🏨 住宿：${hotel.name}` : '🏨 住宿待定'}
                    </span>
                    {itineraryReady && (
                      <span
                        className={`${glassCapsuleSurfaceClass} ${glassCapsuleToneClass.sage} px-3 py-1 text-xs text-[var(--sage)] font-semibold`}
                      >
                        ✓ 出行信息已就绪
                      </span>
                    )}
                  </div>
                </div>
              </header>

              <LogisticsTravelSection
                key={`travel-${panelResetKey}-${syncRenderKey}`}
                tripDates={tripDates}
                onTripDatesChange={setTripDates}
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
              />

              {itineraryReady && (
                <div className={`flex flex-col gap-4 rounded-3xl ${glassCardSurfaceClass} px-5 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-6`}>
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--sage)]/15 to-[var(--gold)]/10 text-[var(--sage)] shadow-inner">
                      <CalendarDays size={18} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[var(--ink)]">出行信息已就绪</p>
                      <p className="mt-0.5 text-xs text-[var(--stone)]">
                        日期、往返航班与当前住宿均已确认
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSelectTab('itinerary')}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--ink)]/80 bg-[var(--ink)]/90 px-5 py-2.5 text-sm font-medium text-[var(--paper)] shadow-[0_4px_14px_rgba(35,42,38,0.14),inset_0_1px_1px_rgba(255,255,255,0.18)] backdrop-blur-md transition-all hover:bg-[var(--ink)] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sage)]/35 sm:w-auto"
                  >
                    <span>查看每日行程</span>
                    <span aria-hidden>→</span>
                  </button>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'profile' && (
            <ProfileTab
              onAnimationStart={() => restoreTabScroll('profile')}
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
              tripStats={{
                daysCount: days.length,
                placesCount: days.reduce((acc, d) => acc + (d.stops?.length || 0), 0),
                hotelReady: isHotelSelected(hotel),
                flightsReady: Boolean(flights.outbound && flights.returnFlight),
                datesReady: Boolean(tripDates?.startDate && tripDates?.endDate),
              }}
            />
          )}
        </AnimatePresence>

        <footer className="rounded-3xl border border-white/80 dark:border-white/10 bg-white/60 dark:bg-[#151c18]/60 px-5 py-4 text-xs text-zinc-500 dark:text-zinc-400 shadow-sm dark:shadow-none backdrop-blur-xl transition-colors">
          <p>
            航班与营业信息会变动；详情页显示生成时缓存的 Google 评分及 Tripadvisor 详情。自驾日请确认低排放区（Crit’Air）与租车保险。
          </p>
        </footer>
      </main>

      {/* Mobile Native Bottom Navigation Bar */}
      <BottomNavBar
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
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

      <ConfirmDialog
        open={confirmRegenAllOpen}
        onClose={() => setConfirmRegenAllOpen(false)}
        onConfirm={handleRegenerateItinerary}
        title="重新生成全部行程"
        description="确定要重新生成全部天数的行程吗？当前自定义调整与已选景点将被新生成的行程替换。"
        confirmText="重新生成"
        tone="sage"
        icon="refresh"
      />

      <ConfirmDialog
        open={confirmRestoreDefaultOpen}
        onClose={() => setConfirmRestoreDefaultOpen(false)}
        onConfirm={handleRestoreDefault}
        title="恢复全部默认行程"
        description="确定将全部行程恢复为初始默认推荐吗？当前所做的个性化调整将被重置。"
        confirmText="恢复默认"
        tone="warning"
        icon="history"
      />

      <ConfirmDialog
        open={confirmClearAllOpen}
        onClose={() => setConfirmClearAllOpen(false)}
        onConfirm={doClearAllTripState}
        title="清空当前行程全部数据"
        description="确定清空日期、航班、酒店与行程，回到初始空状态？此操作不可撤销。"
        confirmText="清空全部"
        tone="danger"
        icon="trash"
      />
    </div>
  )
}
