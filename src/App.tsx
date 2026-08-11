import { useMemo, useRef, useState } from 'react'
import { useAuth } from './features/auth/AuthProvider'
import { useTripCore } from './hooks/useTripCore'
import { useItineraryGeneration } from './hooks/useItineraryGeneration'
import { useItineraryDays, useItineraryDaysEffects } from './hooks/useItineraryDays'
import { useMobilePane } from './hooks/useMobilePane'
import { useTripDialogs } from './hooks/useTripDialogs'
import { useTripSync } from './hooks/useTripSync'
import { DayTimeline } from './features/itinerary/components/DayTimeline'
import { FlightPanel } from './features/flight/components/FlightPanel'
import { HotelPicker } from './features/hotel/components/HotelPicker'
import { LoadingIndicator } from './shared/components/LoadingIndicator'
import { CloudSaveIndicator } from './features/cloud-sync/components/CloudSaveIndicator'
import { BackupDialog } from './features/cloud-sync/components/BackupDialog'
import {
  RecommendationPreferencesButton,
  RecommendationPreferencesDialog,
} from './features/place/components/RecommendationPreferencesDialog'
import { PlacePanel } from './features/place/components/PlacePanel'
import { ShareDialog } from './features/cloud-sync/components/ShareDialog'
import { TripChatPanel } from './features/chat/components/TripChatPanel'
import type { TripChatViewingTarget } from './features/chat/services/tripChat'
import { TripDatesPanel } from './features/itinerary/components/TripDatesPanel'
import { TripMap } from './features/map/components/TripMap'
import { MapErrorBoundary } from './features/map/components/MapErrorBoundary'
import { PENDING_HOTEL } from './features/hotel/constants/hotels'
import { getPlace } from './features/place/constants/places'
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
    day,
  } = useItineraryDays(
    hotel,
    {
      days: initialItinerary.days,
      customPlaces: initialItinerary.customPlaces,
    },
    { numberOfDaysRef },
  )
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
    showItineraryLoading,
    showItineraryContent,
    showItineraryError,
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
    if (selectedPlaceId) {
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
  const { plan: navPlan, loading: navLoading } = useDayNav(
    day,
    hotel,
    placesWithHotel,
    itineraryReady && itineraryGenerated && !itineraryGenerating && days.length > 0,
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
    <div className="mx-auto min-h-screen max-w-7xl px-3 pb-[max(6rem,calc(env(safe-area-inset-bottom)+5rem))] pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 sm:pb-16 sm:pt-6 lg:px-8">
      <CloudSaveIndicator />
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
          {activeTrip && (
            <button
              type="button"
              onClick={() => setBackupOpen(true)}
              aria-label="存档"
              title="存档"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--stone)]/30 text-[var(--stone)] transition-colors hover:border-[var(--sage)] hover:text-[var(--sage)]"
            >
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <rect x="3" y="4" width="18" height="4" rx="1" />
                <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" />
                <path d="M10 12h4" />
              </svg>
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
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--stone)]/30 text-[var(--stone)] transition-colors hover:border-[var(--sage)] hover:text-[var(--sage)]"
            >
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <circle cx="18" cy="5" r="2.5" />
                <circle cx="6" cy="12" r="2.5" />
                <circle cx="18" cy="19" r="2.5" />
                <path d="M8.3 10.8 15.7 6.2M8.3 13.2l7.4 4.6" />
              </svg>
            </button>
          )}
          {!readOnly && (
            <button
              type="button"
              onClick={handleClearAllTripState}
              aria-label="清空全部"
              title="清空全部"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--stone)]/30 text-[var(--stone)] transition-colors hover:border-[var(--sage)] hover:text-[var(--sage)]"
            >
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M3 6h18" />
                <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
                <path d="M19 6v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6" />
                <path d="M10 11v6M14 11v6" />
              </svg>
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              void signOut()
            }}
            aria-label="退出"
            title="退出"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--stone)]/30 text-[var(--stone)] transition-colors hover:border-[var(--sage)] hover:text-[var(--sage)]"
          >
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" />
              <path d="M16 8l4 4-4 4" />
              <path d="M9 12h11" />
            </svg>
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
                {itineraryReady && itineraryGenerated && (
                  <>
                {canRestoreDefault && (
                  <button
                    type="button"
                    onClick={handleRestoreDefault}
                    aria-label="恢复默认推荐"
                    title="恢复默认推荐"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--stone)]/30 text-[var(--stone)] transition-colors hover:border-[var(--sage)] hover:text-[var(--sage)]"
                  >
                    <svg
                      width="17"
                      height="17"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                      <path d="M3 3v5h5" />
                      <path d="M12 7v5l3 2" />
                    </svg>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleResetAll}
                  aria-label="重新生成全部"
                  title="重新生成全部"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--stone)]/30 text-[var(--stone)] transition-colors hover:border-[var(--sage)] hover:text-[var(--sage)]"
                >
                  <svg
                    width="17"
                    height="17"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="m14.5 4.5 5 5L8 21H3v-5L14.5 4.5Z" />
                    <path d="m11.5 7.5 5 5" />
                    <path d="M5 3v4" />
                    <path d="M3 5h4" />
                    <path d="M19 16v4" />
                    <path d="M17 18h4" />
                  </svg>
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

                {showItineraryContent && (
                  <>
                    <div className="sticky top-0 z-20 -mx-3 space-y-2 bg-[color-mix(in_srgb,var(--paper)_92%,transparent)] px-3 py-2 backdrop-blur-md sm:static sm:mx-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none">
                      <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        {days.map((d, i) => {
                          const cal = dateForTripDay(itineraryStartDate, d.day)
                          return (
                            <button
                              key={d.day}
                              type="button"
                              onClick={() => {
                                setDayIndex(i)
                                setSelectedPlaceId(null)
                                setDayRegenError(null)
                              }}
                              className={`shrink-0 rounded-full px-3 py-2 text-sm transition sm:px-4 ${
                                i === dayIndex
                                  ? 'bg-[var(--ink)] text-[var(--paper)]'
                                  : 'bg-white/70 text-[var(--ink)] hover:bg-white'
                              }`}
                            >
                              <span className="block leading-tight">
                                D{d.day}
                                {cal ? ` · ${formatTripDayLabel(cal)}` : ''}
                              </span>
                              <span className="block max-w-[9.5rem] truncate text-[11px] opacity-80 sm:max-w-none">
                                {d.title}
                              </span>
                            </button>
                          )
                        })}
                      </div>

                      <div
                        className="flex gap-1 rounded-full bg-[var(--mist)]/70 p-1 lg:hidden"
                        role="tablist"
                        aria-label="行程视图"
                      >
                        <button
                          type="button"
                          role="tab"
                          aria-selected={mobileItineraryPane === 'timeline'}
                          onClick={() => setMobileItineraryPane('timeline')}
                          className={`flex-1 rounded-full px-3 py-2 text-sm transition ${
                            mobileItineraryPane === 'timeline'
                              ? 'bg-[var(--ink)] text-[var(--paper)] shadow-sm'
                              : 'text-[var(--ink)]'
                          }`}
                        >
                          时间线
                        </button>
                        <button
                          type="button"
                          role="tab"
                          aria-selected={mobileItineraryPane === 'map'}
                          onClick={() => setMobileItineraryPane('map')}
                          className={`flex-1 rounded-full px-3 py-2 text-sm transition ${
                            mobileItineraryPane === 'map'
                              ? 'bg-[var(--ink)] text-[var(--paper)] shadow-sm'
                              : 'text-[var(--ink)]'
                          }`}
                        >
                          地图
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
                          navLoading={navLoading}
                          copyRefreshing={copyRefreshing}
                          dayRegenerating={dayRegenerating}
                          dayRegenError={dayRegenError}
                          dayRestoring={dayRestoring}
                          isLastDay={day.day === lastDayNum}
                          onSelectPlace={setSelectedPlaceId}
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
                        <MapErrorBoundary
                          key={`map-boundary-${day.day}-${hotel.id}`}
                        >
                          <TripMap
                            hotel={hotel}
                            day={day}
                            customPlaces={placesWithHotel}
                            navPlan={navPlan}
                            navLoading={navLoading}
                            selectedPlaceId={selectedPlaceId}
                            onSelectPlace={setSelectedPlaceId}
                          />
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
            航班与营业信息会变动；餐厅评分以 Google Maps 实时为准。自驾日请确认低排放区（Crit’Air）与租车保险。
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
            selectPlace: setSelectedPlaceId,
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
