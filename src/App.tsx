import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Archive, LogOut, Share2, Sparkles, Trash2, History } from 'lucide-react'
import { useEnterExit } from './shared/hooks/useEnterExit'
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
  RecommendationPreferencesButton,
  RecommendationPreferencesDialog,
} from './features/place/components/RecommendationPreferencesDialog'
import { PlacePanel } from './features/place/components/PlacePanel'
import { ShareDialog } from './features/cloud-sync/components/ShareDialog'
import { TripChatPanelLazy as TripChatPanel } from './features/chat/components/TripChatPanel.lazy'
import type { TripChatViewingTarget } from './features/chat/services/tripChat'
import { TripDatesPanel } from './features/itinerary/components/TripDatesPanel'
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const mobileMenuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!mobileMenuOpen) return
    const onPointerDown = (e: PointerEvent) => {
      if (!mobileMenuRef.current?.contains(e.target as Node)) {
        setMobileMenuOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileMenuOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [mobileMenuOpen])
  const popover = useEnterExit('popover')
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
    <div className="mx-auto min-h-[100svh] max-w-7xl px-3 pb-[max(6rem,calc(env(safe-area-inset-bottom)+5rem))] pt-[max(5.75rem,calc(env(safe-area-inset-top)+2.25rem))] sm:min-h-screen sm:px-6 sm:pb-16 sm:pt-6 lg:px-8">
      <CloudSaveIndicator />
      <ApiRequestMeter />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 sm:gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-sm">
          <span className="max-w-[11rem] truncate text-[var(--stone)] sm:max-w-[16rem]">
            {email}
          </span>
          {role === 'viewer' && (
            <span className="rounded-full bg-[var(--mist)] px-2.5 py-0.5 text-xs text-[var(--stone)]">
              只读
            </span>
          )}
          {role === 'editor' && (
            <span className="rounded-full bg-[var(--sage)]/15 px-2.5 py-0.5 text-xs text-[var(--sage)]">
              可编辑共享
            </span>
          )}
          {trips.length > 1 && (
            <select
              className="max-w-full truncate rounded-full border border-[var(--stone)]/30 bg-[var(--card)] px-3 py-1.5 text-sm sm:max-w-[min(100%,320px)]"
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
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 sm:gap-2">
          {/* Mobile (< sm): collapse into a "⋯" overflow menu. */}
          <div ref={mobileMenuRef} className="relative sm:hidden">
            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label="更多操作"
              aria-expanded={mobileMenuOpen}
              className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-[var(--stone)]/30 text-[var(--stone)] transition-colors hover:border-[var(--sage)] hover:text-[var(--sage)]"
            >
              <span aria-hidden>⋯</span>
            </button>
            <AnimatePresence>
              {mobileMenuOpen && (
                <motion.div
                  initial={popover.initial}
                  animate={popover.animate}
                  exit={popover.exit}
                  transition={popover.transition}
                  className="absolute right-0 top-12 z-30 flex min-w-[10rem] flex-col gap-1 rounded-2xl border border-white/70 bg-[var(--paper)] p-2 shadow-[var(--shadow)]"
                >
                  {activeTrip && (
                    <button
                      type="button"
                      onClick={() => {
                        setMobileMenuOpen(false)
                        setBackupOpen(true)
                      }}
                      className="flex items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-[var(--ink)] hover:bg-[var(--mist)] focus-visible:bg-[var(--mist)]"
                    >
                      <Archive size={16} strokeWidth={1.8} aria-hidden />
                      存档
                    </button>
                  )}
                  {role === 'owner' && activeTrip && (
                    <button
                      type="button"
                      onClick={() => {
                        setMobileMenuOpen(false)
                        setShareOpen(true)
                        void refreshTrips().catch(() => undefined)
                      }}
                      className="flex items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-[var(--ink)] hover:bg-[var(--mist)] focus-visible:bg-[var(--mist)]"
                    >
                      <Share2 size={16} strokeWidth={1.8} aria-hidden />
                      分享
                    </button>
                  )}
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => {
                        setMobileMenuOpen(false)
                        handleClearAllTripState()
                      }}
                      className="flex items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-[var(--ink)] hover:bg-[var(--mist)] focus-visible:bg-[var(--mist)]"
                    >
                      <Trash2 size={16} strokeWidth={1.8} aria-hidden />
                      清空全部
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false)
                      void signOut()
                    }}
                    className="flex items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-[var(--ink)] hover:bg-[var(--mist)] focus-visible:bg-[var(--mist)]"
                  >
                    <LogOut size={16} strokeWidth={1.8} aria-hidden />
                    退出
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          {/* Desktop (≥ sm): inline action buttons as before. */}
          <div className="hidden items-center gap-1.5 sm:flex sm:gap-2">
            {activeTrip && (
              <button
                type="button"
                onClick={() => setBackupOpen(true)}
                aria-label="存档"
                title="存档"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--stone)]/30 text-[var(--stone)] transition-colors hover:border-[var(--sage)] hover:text-[var(--sage)] focus-visible:border-[var(--sage)] focus-visible:text-[var(--sage)]"
              >
                <Archive size={17} strokeWidth={1.8} aria-hidden />
              </button>
            )}
            {role === 'owner' && activeTrip && (
              <button
                type="button"
                onClick={() => {
                  setShareOpen(true)
                  void refreshTrips().catch(() => undefined)
                }}
                aria-label="分享"
                title="分享"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--stone)]/30 text-[var(--stone)] transition-colors hover:border-[var(--sage)] hover:text-[var(--sage)] focus-visible:border-[var(--sage)] focus-visible:text-[var(--sage)]"
              >
                <Share2 size={17} strokeWidth={1.8} aria-hidden />
              </button>
            )}
            {!readOnly && (
              <button
                type="button"
                onClick={handleClearAllTripState}
                aria-label="清空全部"
                title="清空全部"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--stone)]/30 text-[var(--stone)] transition-colors hover:border-[var(--sage)] hover:text-[var(--sage)] focus-visible:border-[var(--sage)] focus-visible:text-[var(--sage)]"
              >
                <Trash2 size={17} strokeWidth={1.8} aria-hidden />
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                void signOut()
              }}
              aria-label="退出"
              title="退出"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--stone)]/30 text-[var(--stone)] transition-colors hover:border-[var(--sage)] hover:text-[var(--sage)] focus-visible:border-[var(--sage)] focus-visible:text-[var(--sage)]"
            >
              <LogOut size={17} strokeWidth={1.8} aria-hidden />
            </button>
          </div>
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

      <main className="mt-8 space-y-10 sm:mt-10 sm:space-y-12">
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

        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl sm:text-3xl">
                {chineseDayCount(numberOfDays)}行程
              </h2>
              <p className="mt-1 text-sm text-[var(--stone)]">
                {itineraryReady
                  ? '可拖拽排序、增删地点；步行距离与当日标题会随调整自动更新。'
                  : '先选好日期、往返航班和酒店，下方行程才会展开。'}
              </p>
              {datesReady && (
                <p className="mt-1.5 text-sm text-[var(--copper)]">
                  {dayNightLabel}
                  {tripDates?.endDate && itineraryStartDate ? (
                    <span className="text-[var(--stone)]">
                      {' '}
                      · {formatTripDayLabel(itineraryStartDate)} →{' '}
                      {formatTripDayLabel(tripDates.endDate)}
                    </span>
                  ) : null}
                </p>
              )}
              {itineraryReady && (
                <div className="mt-2 text-sm text-[var(--ink)]/85">
                  {itineraryStartLoading && !itineraryStart ? (
                    <LoadingIndicator
                      thinkingLabel="正在读取航班抵达时间…"
                      generatingLabel="正在按航班日期确定行程开始日…"
                      showDots
                      size="sm"
                      mode="thinking"
                      task="itineraryStart"
                    />
                  ) : itineraryStartDate ? (
                    <p>
                      <span className="text-[var(--copper)]">
                        行程起算 {formatTripDayLabel(itineraryStartDate)}
                      </span>
                      {itineraryStart?.reasonZh ? (
                        <span className="text-[var(--stone)]">
                          {' '}
                          · {itineraryStart.reasonZh}
                        </span>
                      ) : itineraryStartLoading ? (
                        <LoadingIndicator
                          className="ml-1 align-middle"
                          thinkingLabel="正在核对抵达时间…"
                          generatingLabel="正在核对抵达时间…"
                          showDots
                          size="sm"
                          mode="thinking"
                          task="itineraryStart"
                        />
                      ) : null}
                    </p>
                  ) : null}
                </div>
              )}
            </div>
            {!readOnly && (
              <div className="flex flex-wrap items-center gap-2">
                <RecommendationPreferencesButton
                  onClick={() => setRecommendationPreferencesOpen(true)}
                />
                {itineraryReady &&
                  (itineraryGenerated || itineraryIncrementalGenerating) && (
                  <>
                {canRestoreDefault && (
                  <button
                    type="button"
                    onClick={handleRestoreDefault}
                    aria-label="恢复默认推荐"
                    title="恢复默认推荐"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--stone)]/30 text-[var(--stone)] transition-colors hover:border-[var(--sage)] hover:text-[var(--sage)]"
                  >
                    <History size={17} strokeWidth={1.8} aria-hidden />
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleResetAll}
                  aria-label="重新生成全部"
                  title="重新生成全部"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--stone)]/30 text-[var(--stone)] transition-colors hover:border-[var(--sage)] hover:text-[var(--sage)]"
                >
                  <Sparkles size={17} strokeWidth={1.8} aria-hidden />
                </button>
                  </>
                )}
              </div>
            )}
          </div>

          <div
            className={`grid transition-[grid-template-rows] duration-500 ease-in-out ${
              itineraryReady ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
            }`}
          >
            <div className="min-h-0 overflow-hidden">
              <div
                className={`space-y-4 transition-[opacity,transform] duration-500 ease-in-out ${
                  itineraryReady
                    ? 'opacity-100'
                    : 'pointer-events-none -translate-y-2 opacity-0'
                }`}
              >
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
                              onSelect={() => {
                                setDayIndex(i)
                                setSelectedPlaceId(null)
                                setDayRegenError(null)
                              }}
                            />
                          )
                        })}
                      </div>

                      <div
                        className="relative flex gap-1 rounded-full bg-[var(--mist)]/70 p-1 lg:hidden"
                        role="tablist"
                        aria-label="行程视图"
                      >
                        {/* iOS-style sliding pill: a single motion.span with
                            `layoutId` that's always mounted inside the active
                            tab. Framer Motion tracks its position when the
                            active tab changes and tweens between buttons
                            with the spring below. Pure black for max
                            contrast against the white active label. The
                            previous conditional-render approach had the
                            pill being filled by the tablist's full width
                            (`absolute inset-0` resolved against the wrong
                            stacking context in some viewport widths), so the
                            pill was effectively invisible. */}
                        <button
                          type="button"
                          role="tab"
                          aria-selected={mobileItineraryPane === 'timeline'}
                          onClick={() => setMobileItineraryPane('timeline')}
                          className="relative isolate flex-1 rounded-full px-3 py-2 text-sm transition-colors"
                        >
                          {mobileItineraryPane === 'timeline' && (
                            <motion.span
                              layoutId="itinerary-pane-pill"
                              className="absolute inset-0 z-0 rounded-full bg-black shadow-sm"
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
                          <span className={`relative z-10 font-medium transition-colors duration-200 ${mobileItineraryPane === 'timeline' ? 'text-white' : 'text-[var(--ink)]'}`}>
                            时间线
                          </span>
                        </button>
                        <button
                          type="button"
                          role="tab"
                          aria-selected={mobileItineraryPane === 'map'}
                          onClick={() => setMobileItineraryPane('map')}
                          className="relative isolate flex-1 rounded-full px-3 py-2 text-sm transition-colors"
                        >
                          {mobileItineraryPane === 'map' && (
                            <motion.span
                              layoutId="itinerary-pane-pill"
                              className="absolute inset-0 z-0 rounded-full bg-black shadow-sm"
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
                          <span className={`relative z-10 font-medium transition-colors duration-200 ${mobileItineraryPane === 'map' ? 'text-white' : 'text-[var(--ink)]'}`}>
                            地图
                          </span>
                        </button>
                      </div>
                    </div>

                    <div className="grid gap-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                      <div
                        className={
                          mobileItineraryPane === 'timeline'
                            ? 'block'
                            : 'hidden lg:block'
                        }
                      >
                        <DayTimeline
                          key={`timeline-${day.day}-${hotel.id}`}
                          day={day}
                          hotel={hotel}
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
              </div>
            </div>
          </div>

          {!itineraryReady && (
            <div className="rounded-2xl border border-dashed border-[var(--copper)]/35 bg-[var(--card)] px-4 py-5 text-center">
              <p className="font-medium text-[var(--ink)]">还差几项才能看行程</p>
              <p className="mt-1 text-sm text-[var(--stone)]">
                请先完成：{missingForItinerary.join(' · ')}
              </p>
            </div>
          )}
        </section>

        <footer className="rounded-2xl border border-white/60 bg-[var(--card)] px-4 py-5 text-sm text-[var(--stone)]">
          <p>
            航班与营业信息会变动；详情页显示生成时缓存的 Google 评分及 Tripadvisor 详情。自驾日请确认低排放区（Crit’Air）与租车保险。
          </p>
        </footer>
      </main>

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
