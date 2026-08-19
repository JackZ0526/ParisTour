import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { motion, type Variants } from 'framer-motion'
import { getPlace } from '../../place/constants/places'

export const timelineItemVariants: Variants = {
  enter: (direction: number) => ({
    x: (direction || 1) > 0 ? 44 : -44,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
    transition: {
      x: {
        type: 'spring',
        stiffness: 380,
        damping: 32,
        mass: 0.5,
      },
      opacity: { duration: 0.16, ease: 'easeOut' as const },
    },
  },
  exit: (direction: number) => ({
    x: (direction || 1) > 0 ? -24 : 24,
    opacity: 0,
    transition: {
      x: { duration: 0.08, ease: 'easeIn' as const },
      opacity: { duration: 0.06, ease: 'easeIn' as const },
    },
  }),
}
import type { DayNavPlan, ResolvedDayLeg } from '../../map/services/googleNav'
import { PATH_MODE_COLORS } from '../../map/services/googleNav'
import type { RecommendationPreferences } from '../../place/services/recommendationPreferences'
import type { DayPlan, ItineraryStop, Place, SelectedHotel } from '../../../types'
import {
  getDayOrigin,
  isAirportPlace,
  isHotelPlace,
  numberedStopIndexes,
  SELECTED_HOTEL_PLACE_ID,
} from '../utils/dayOrigin'
import { AddPlaceDialog } from '../../place/components/AddPlaceDialog'
import { GommagePetals } from '../../../shared/components/GommagePetals'
import { GooglePlacePhoto } from '../../place/components/GooglePlacePhoto'
import { LoadingIndicator } from '../../../shared/components/LoadingIndicator'
import { HouseIcon, PlaneIcon } from '../../map/components/markerIcons'
import { PlaceName } from '../../place/components/PlaceName'
import {
  googleMapsDirectionsUrl,
  googleMapsTravelModeLabel,
  inferGoogleMapsTravelMode,
  type GoogleMapsTravelMode,
} from '../../map/services/googleMapsDirectionsUrl'
import { ExternalLink, GripVertical, History, Pin, Plus, Sparkles, Trash2 } from 'lucide-react'

/** Dissolve + petal flight before slot collapse. */
const GOMMAGE_DISSOLVE_MS = 560
/** Collapse exiting li height so list doesn't pop on unmount. */
const GOMMAGE_COLLAPSE_MS = 400
export const TIMELINE_DELETE_TOTAL_MS =
  GOMMAGE_DISSOLVE_MS + GOMMAGE_COLLAPSE_MS
const ENTER_ANIM_MS = 560
export const TIMELINE_INSERT_TOTAL_MS = ENTER_ANIM_MS
/** Shared height-morph timing — card swap + leg body must stay in sync. */
const TIMELINE_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'
const LEG_MORPH_MS = 320
/** Programmatic reorder (assistant / non-drag): FLIP settle duration. */
const REORDER_FLIP_MS = 420
/** In-place replace: legs fade → (optional height morph) → wipe → legs fade-in. */
const SWAP_LEG_FADE_MS = 220
const SWAP_MORPH_MS = LEG_MORPH_MS
const SWAP_WIPE_MS = 720
export const TIMELINE_SWAP_TOTAL_MS =
  Math.max(SWAP_LEG_FADE_MS, SWAP_MORPH_MS) + SWAP_WIPE_MS + 80
/** Ignore sub-pixel / rounding noise — wipe-only when heights match. */
const SWAP_HEIGHT_EPS_PX = 2
/** Ignore sub-pixel jitter when deciding whether a FLIP delta is real. */
const REORDER_FLIP_EPS_PX = 1.5

type ReorderFlip = {
  /** stopKey → invert translateY (px) before play. */
  shifts: Record<string, number>
  /** false = inverted (no transition); true = animating to 0. */
  playing: boolean
}

type ExitGhost = {
  stopKey: string
  stop: ItineraryStop
  index: number
  collapsing?: boolean
  heightPx?: number
}

type SwapPhase = 'measure' | 'morph' | 'wipe'

type SwapAnim = {
  index: number
  oldKey: string
  newKey: string
  oldStop: ItineraryStop
  /** Slot height before replace. */
  fromHeightPx: number
  /** Natural height of the incoming card (filled after measure). */
  toHeightPx: number
  /** Current stage height (animates during morph). */
  heightPx: number
  phase: SwapPhase
}

const typeLabel: Record<string, string> = {
  cafe: '咖啡馆',
  attraction: '景点',
  restaurant: '餐厅',
  transport: '交通',
  hotel: '酒店',
}

function TrashIcon() {
  return <Trash2 size={16} strokeWidth={1.8} aria-hidden />
}

function PinIcon() {
  return <Pin size={14} strokeWidth={1.8} aria-hidden />
}

function RestoreDayIcon({ busy = false }: { busy?: boolean }) {
  return (
    <History
      className={busy ? 'animate-spin' : undefined}
      size={17}
      strokeWidth={1.8}
      aria-hidden
    />
  )
}

function RegenerateDayIcon({ busy = false }: { busy?: boolean }) {
  return (
    <Sparkles
      className={busy ? 'animate-pulse' : undefined}
      size={17}
      strokeWidth={1.8}
      aria-hidden
    />
  )
}

function travelChipFromLeg(leg: ResolvedDayLeg | null | undefined): string | null {
  if (!leg) return null
  if (leg.displayMode === 'TRANSIT') {
    const lines = (leg.transitLines || [])
      .map((l) => l.label)
      .filter(Boolean)
      .slice(0, 2)
    return lines.length ? lines.join(' · ') : '公共交通'
  }
  if (leg.displayMode === 'DRIVING') return '驾车'
  if (leg.displayMode === 'WALKING') {
    const m = leg.distanceMeters || 0
    if (m > 0 && m < 400) return '很少走'
    if (m > 0 && m < 1200) return '短步行'
    if (m >= 1200) return '中等步行'
    return '步行'
  }
  return null
}

/** Ignore sub-pixel noise when morphing leg body height. */
const LEG_BODY_HEIGHT_EPS_PX = 1

/** Origin cue (「从酒店」/「从机场」) — always a prefix chip, never free text or label-inline. */
function LegOriginCue({ cue }: { cue: string }) {
  return (
    <span className="timeline-leg-cue inline-flex items-center rounded-full border border-[var(--stone)]/20 bg-[var(--mist)]/80 px-2.5 py-1 text-xs text-[var(--stone)]">
      {cue}
    </span>
  )
}

function LegConnector({
  leg,
  fallbackLabel,
  calculating,
  routeUrl,
  routeMode,
  /** Freeze displayed height — used while cards enter/exit/swap so leg morph can't push the list. */
  lockHeight = false,
  /** Optional cue for origin→first (e.g. 「从酒店」) — rendered as a prefix chip. */
  originCue,
}: {
  leg: ResolvedDayLeg | null | undefined
  fallbackLabel?: string
  calculating?: boolean
  routeUrl?: string
  routeMode?: GoogleMapsTravelMode
  lockHeight?: boolean
  originCue?: string
}) {
  const mode = leg?.displayMode
  const tone =
    mode === 'TRANSIT' || routeMode === 'transit'
      ? 'border-sky-300/60 bg-sky-50 text-sky-900'
      : mode === 'DRIVING'
        ? 'border-[var(--copper)]/40 bg-[var(--copper)]/10 text-[var(--copper)]'
        : routeMode === 'walking'
          ? 'border-emerald-300/70 bg-emerald-50 text-emerald-900'
          : 'border-[var(--stone)]/25 bg-[var(--mist)]/70 text-[var(--stone)]'

  const lines = leg?.transitLines || []
  const isCalculating = Boolean(calculating && !leg)
  const contentKey = isCalculating
    ? 'calc'
    : lines.length > 0
      ? `transit:${originCue || ''}:${lines.length}`
      : `simple:${originCue || ''}:${leg?.label || fallbackLabel || ''}:${routeMode || ''}`

  const measureRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const lockedRef = useRef(lockHeight)
  const pendingHeightRef = useRef<number | null>(null)
  const unlockRafRef = useRef<number | null>(null)
  const [bodyHeight, setBodyHeight] = useState<number | undefined>(undefined)
  const [heightReady, setHeightReady] = useState(false)

  // Natural height (1-line loader ↔ 2-line transit, etc.) with cubic height morph.
  // While lockHeight: freeze displayed px and stash the target — apply after layout anims settle.
  useLayoutEffect(() => {
    const measureEl = measureRef.current
    if (!measureEl) return

    const apply = () => {
      const next = Math.round(measureEl.scrollHeight)
      if (lockedRef.current) {
        pendingHeightRef.current = next
        // First paint still needs a height so the faded slot keeps stable space.
        setBodyHeight((prev) => (prev == null ? next : prev))
        return
      }
      pendingHeightRef.current = null
      setBodyHeight((prev) =>
        prev != null && Math.abs(prev - next) <= LEG_BODY_HEIGHT_EPS_PX ? prev : next,
      )
    }

    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(measureEl)

    let cancelled = false
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!cancelled && !lockedRef.current) setHeightReady(true)
      })
    })

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  useLayoutEffect(() => {
    const enteringLock = lockHeight && !lockedRef.current
    const leavingLock = !lockHeight && lockedRef.current
    lockedRef.current = lockHeight

    if (unlockRafRef.current != null) {
      cancelAnimationFrame(unlockRafRef.current)
      unlockRafRef.current = null
    }

    if (enteringLock) {
      // Capture mid-morph visual height so we don't jump when freezing.
      const el = bodyRef.current
      if (el) {
        const visual = Math.round(el.getBoundingClientRect().height)
        if (visual > 0) setBodyHeight(visual)
      }
      setHeightReady(false)
      return
    }

    if (!leavingLock) {
      if (lockHeight) setHeightReady(false)
      return
    }

    // Unlock: morph (or snap if first paint) to the height measured while frozen.
    const measureEl = measureRef.current
    const target =
      pendingHeightRef.current ??
      (measureEl ? Math.round(measureEl.scrollHeight) : null)
    pendingHeightRef.current = null

    if (target == null) {
      setHeightReady(true)
      return
    }

    setBodyHeight((prev) => {
      if (prev == null) return target
      if (Math.abs(prev - target) <= LEG_BODY_HEIGHT_EPS_PX) return prev
      return prev
    })

    // Enable transition, then apply target on the next frame so CSS morph runs.
    let cancelled = false
    unlockRafRef.current = requestAnimationFrame(() => {
      if (cancelled) return
      setHeightReady(true)
      unlockRafRef.current = requestAnimationFrame(() => {
        unlockRafRef.current = null
        if (cancelled) return
        setBodyHeight((prev) =>
          prev != null && Math.abs(prev - target) <= LEG_BODY_HEIGHT_EPS_PX
            ? prev
            : target,
        )
      })
    })

    return () => {
      cancelled = true
      if (unlockRafRef.current != null) {
        cancelAnimationFrame(unlockRafRef.current)
        unlockRafRef.current = null
      }
    }
  }, [lockHeight])

  const bodyClass = [
    'timeline-leg-body min-w-0 flex-1',
    heightReady && !lockHeight ? 'timeline-leg-body--ready' : '',
    lockHeight ? 'timeline-leg-body--locked' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const chipRow = (children: ReactNode) => (
    <div className="flex flex-wrap items-center gap-1.5">
      {originCue ? <LegOriginCue cue={originCue} /> : null}
      {children}
    </div>
  )

  return (
    <div
      className="timeline-leg-connector flex items-center gap-3 px-2 py-1.5"
      aria-busy={isCalculating || undefined}
    >
      <div className="timeline-leg-rail" aria-hidden />
      <div
        ref={bodyRef}
        className={bodyClass}
        style={bodyHeight != null ? { height: bodyHeight } : undefined}
      >
        <div ref={measureRef} className="timeline-leg-body-measure">
          <div key={contentKey} className="timeline-leg-body-content">
            {isCalculating ? (
              chipRow(
                <LoadingIndicator
                  variant="badge"
                  label={fallbackLabel || '正在计算导航…'}
                  size="sm"
                  showDots
                />,
              )
            ) : lines.length > 0 ? (
              chipRow(
                <>
                  {lines.map((line) => (
                    <span
                      key={line.label}
                      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs"
                      style={{
                        borderColor: `${line.color || PATH_MODE_COLORS[line.mode]}66`,
                        backgroundColor: `${line.color || PATH_MODE_COLORS[line.mode]}18`,
                        color: 'var(--ink)',
                      }}
                    >
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: line.color || PATH_MODE_COLORS[line.mode] }}
                      />
                      {line.label}
                    </span>
                  ))}
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs ${tone}`}>
                    {leg?.durationText}
                    {leg?.distanceText ? ` · ${leg.distanceText}` : ''}
                    <span className="ml-1 opacity-60">· Google</span>
                  </span>
                </>,
              )
            ) : (
              chipRow(
                routeUrl ? (
                  <a
                    className={`timeline-route-link timeline-route-link--${routeMode || 'transit'} inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs`}
                    href={routeUrl}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`${fallbackLabel || googleMapsTravelModeLabel(routeMode || 'transit')}，在 Google Maps 查看路线`}
                  >
                    <span className="timeline-route-link-label">
                      {fallbackLabel || googleMapsTravelModeLabel(routeMode || 'transit')}
                    </span>
                    <ExternalLink
                      className="timeline-route-link-arrow"
                      size={12}
                      strokeWidth={2}
                      aria-hidden
                    />
                  </a>
                ) : (
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs ${tone}`}>
                    {leg?.label || fallbackLabel || '查看地图导航'}
                  </span>
                ),
              )
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

interface Props {
  day: DayPlan
  hotel: SelectedHotel
  customPlaces: Record<string, Place>
  selectedPlaceId: string | null
  navPlan: DayNavPlan
  copyRefreshing?: boolean
  /** True while this day's stops are being regenerated via LLM. */
  dayRegenerating?: boolean
  dayRegenError?: string | null
  /** True for days not yet generated in sequential multi-day generation. */
  dayPending?: boolean
  /** True while a baseline restore is sequencing removals before insertions. */
  dayRestoring?: boolean
  /** True when this day is the trip's return day (hotel origin-only, no overnight pin). */
  isLastDay?: boolean
  onSelectPlace: (id: string) => void
  onReorder: (from: number, to: number) => void
  onDelete: (stopId: string) => void
  onAddCustom: (place: Place, mode: 'best' | 'end') => void
  onResetDay: () => void
  /** Restore this day from the first-generation baseline snapshot. */
  canRestoreDayDefault?: boolean
  onRestoreDayDefault?: () => void
  tripPlaceNames: string[]
  recommendationPreferences: RecommendationPreferences
  readOnly?: boolean
  direction?: 1 | -1
}

/** iOS-like list shift while dragging `from` toward `hover`. */
function listShiftPx(
  index: number,
  from: number,
  hover: number,
  slot: number,
): number {
  if (index === from) return 0
  if (from < hover) {
    if (index > from && index <= hover) return -slot
  } else if (from > hover) {
    if (index >= hover && index < from) return slot
  }
  return 0
}

type DragSession = {
  from: number
  hover: number
  /** Grab point relative to card top-left */
  grabX: number
  grabY: number
  width: number
  height: number
  /** Frozen shift step (card height + gap) — live measure causes jitter. */
  slot: number
  /** Untransformed slot centers captured at drag start. */
  mids: number[]
  /** Document coords of card at drag start */
  startLeft: number
  startTop: number
}

const STOP_SKELETON_TITLE_WIDTHS = ['w-[62%]', 'w-[70%]', 'w-[56%]'] as const

/** Matches the live stop card chrome while a day's places are still generating. */
function TimelineStopCardSkeleton({ index }: { index: number }) {
  const titleWidth =
    STOP_SKELETON_TITLE_WIDTHS[index % STOP_SKELETON_TITLE_WIDTHS.length]
  return (
    <div
      className="flex items-start gap-2 rounded-2xl border border-white/70 bg-[var(--card)] p-2.5 sm:gap-3 sm:p-3"
      aria-hidden
    >
      <span className="mt-1 inline-flex h-7 w-7 shrink-0 rounded-md day-tab-shimmer" />
      <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 rounded-full day-tab-shimmer" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="h-5 w-[4.5rem] rounded-full day-tab-shimmer" />
          <span className="h-3 w-8 rounded-full day-tab-shimmer" />
        </div>
        <span className={`mt-2 block h-4 rounded-full day-tab-shimmer ${titleWidth}`} />
        <div className="mt-1.5 flex items-center gap-1.5">
          <span className="h-3.5 w-[38%] rounded-full day-tab-shimmer" />
          <span className="h-4 w-4 shrink-0 rounded-full day-tab-shimmer" />
        </div>
        <span className="mt-2 block h-3.5 w-[78%] rounded-full day-tab-shimmer" />
        <div className="mt-2 flex flex-wrap gap-2">
          <span className="h-6 w-14 rounded-full day-tab-shimmer" />
          <span className="h-6 w-16 rounded-full day-tab-shimmer" />
        </div>
      </div>
      <span className="hidden h-16 w-16 shrink-0 rounded-xl day-tab-shimmer sm:block" />
      <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 rounded-full day-tab-shimmer" />
    </div>
  )
}

export function DayTimeline({
  day,
  hotel,
  customPlaces,
  selectedPlaceId,
  navPlan,
  copyRefreshing,
  dayRegenerating = false,
  dayRegenError = null,
  dayPending = false,
  dayRestoring = false,
  isLastDay = false,
  onSelectPlace,
  onReorder,
  onDelete,
  onAddCustom,
  onResetDay,
  canRestoreDayDefault = false,
  onRestoreDayDefault,
  tripPlaceNames,
  recommendationPreferences,
  readOnly = false,
  direction = 1,
}: Props) {
  const [addOpen, setAddOpen] = useState(false)
  const [drag, setDrag] = useState<DragSession | null>(null)
  const [floatPos, setFloatPos] = useState({ x: 0, y: 0 })
  const [dropping, setDropping] = useState(false)
  const [enterAnim, setEnterAnim] = useState<{
    stopKey: string
    index: number
  } | null>(null)
  /** Multiple cards can enter at once (sync / restore / regen). */
  const [enteringKeys, setEnteringKeys] = useState<string[]>([])
  const [exitAnim, setExitAnim] = useState<{
    stopKey: string
    index: number
    collapsing?: boolean
    heightPx?: number
  } | null>(null)
  /** Cards removed by sync/restore/regen — kept mounted for gommage. */
  const [exitGhosts, setExitGhosts] = useState<ExitGhost[]>([])
  /** Same-slot replace — height morph (if needed) then wipe; stage height controlled. */
  const [swapAnim, setSwapAnim] = useState<SwapAnim | null>(null)
  /** Pure reorder FLIP (assistant / any non-drag order change). */
  const [reorderFlip, setReorderFlip] = useState<ReorderFlip | null>(null)

  const dragRef = useRef<DragSession | null>(null)
  const pointerRef = useRef({ x: 0, y: 0 })
  const floatRef = useRef({ x: 0, y: 0 })
  const floatElRef = useRef<HTMLDivElement | null>(null)
  const velocityRef = useRef({ y: 0, lastY: 0, lastT: 0 })
  const rafRef = useRef<number | null>(null)
  const itemRefs = useRef<(HTMLLIElement | null)[]>([])
  const swapStageRef = useRef<HTMLDivElement | null>(null)
  const suppressClickRef = useRef(false)
  const prevStopKeysRef = useRef<string[]>([])
  const prevStopsSnapRef = useRef<Array<{ key: string; stop: ItineraryStop }>>([])
  const prevDayRef = useRef(day.day)
  const prevTopsByKeyRef = useRef<Map<string, number>>(new Map())
  /** Drag settle already animated peers — skip one FLIP after commit. */
  const skipNextFlipRef = useRef(false)
  const enterClearTimerRef = useRef<number | null>(null)
  const exitTimerRef = useRef<number | null>(null)
  const swapTimerRef = useRef<number | null>(null)
  const swapPhaseTimerRef = useRef<number | null>(null)
  const swapRafRef = useRef<number | null>(null)
  const reorderFlipRafRef = useRef<number | null>(null)
  const reorderFlipTimerRef = useRef<number | null>(null)
  /** Cached card heights by live index — used to freeze slot on replace. */
  const heightCacheRef = useRef<number[]>([])
  /** User delete already animated via exitAnim — skip external ghost. */
  const skipExternalExitRef = useRef<Set<string>>(new Set())
  const ghostTimersRef = useRef<Map<string, number>>(new Map())
  const exitGhostKeysRef = useRef<Set<string>>(new Set())
  const exitAnimKeyRef = useRef<string | null>(null)

  dragRef.current = drag
  exitGhostKeysRef.current = new Set(exitGhosts.map((g) => g.stopKey))
  exitAnimKeyRef.current = exitAnim?.stopKey ?? null

  const stopKeyOf = (stop: ItineraryStop, index: number) =>
    stop.id || `d${day.day}-${stop.placeId}-${index}`

  const clearEnterAnim = () => {
    if (enterClearTimerRef.current != null) {
      window.clearTimeout(enterClearTimerRef.current)
      enterClearTimerRef.current = null
    }
    setEnterAnim(null)
    setEnteringKeys([])
  }

  const clearSwapAnim = () => {
    if (swapTimerRef.current != null) {
      window.clearTimeout(swapTimerRef.current)
      swapTimerRef.current = null
    }
    if (swapPhaseTimerRef.current != null) {
      window.clearTimeout(swapPhaseTimerRef.current)
      swapPhaseTimerRef.current = null
    }
    if (swapRafRef.current != null) {
      cancelAnimationFrame(swapRafRef.current)
      swapRafRef.current = null
    }
    setSwapAnim(null)
  }

  const clearReorderFlip = () => {
    if (reorderFlipRafRef.current != null) {
      cancelAnimationFrame(reorderFlipRafRef.current)
      reorderFlipRafRef.current = null
    }
    if (reorderFlipTimerRef.current != null) {
      window.clearTimeout(reorderFlipTimerRef.current)
      reorderFlipTimerRef.current = null
    }
    setReorderFlip(null)
  }

  useEffect(() => {
    if (!selectedPlaceId) return

    // Only auto-scroll in desktop dual-pane mode (≥ 1024px)
    const isDesktopDualPane =
      typeof window !== 'undefined' && window.innerWidth >= 1024
    if (!isDesktopDualPane) return

    const activeIndex = day.stops.findIndex(
      (s) => s.placeId === selectedPlaceId,
    )
    if (activeIndex !== -1 && itemRefs.current[activeIndex]) {
      itemRefs.current[activeIndex]?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      })
    }
  }, [day.stops, selectedPlaceId])

  const scheduleSwapClear = (totalMs: number) => {
    if (swapTimerRef.current != null) {
      window.clearTimeout(swapTimerRef.current)
    }
    swapTimerRef.current = window.setTimeout(() => {
      swapTimerRef.current = null
      setSwapAnim(null)
    }, totalMs)
  }

  const beginSwapWipe = (fromHeightPx: number, toHeightPx: number) => {
    setSwapAnim((prev) =>
      prev
        ? {
            ...prev,
            fromHeightPx,
            toHeightPx,
            heightPx: toHeightPx,
            phase: 'wipe',
          }
        : prev,
    )
    scheduleSwapClear(SWAP_WIPE_MS + 40)
  }

  const clearExitTimers = () => {
    if (exitTimerRef.current != null) {
      window.clearTimeout(exitTimerRef.current)
      exitTimerRef.current = null
    }
    for (const t of ghostTimersRef.current.values()) {
      window.clearTimeout(t)
    }
    ghostTimersRef.current.clear()
  }

  const finishGhostExit = (stopKey: string) => {
    setExitGhosts((prev) => prev.filter((g) => g.stopKey !== stopKey))
  }

  const scheduleGhostExit = (stopKey: string) => {
    const existing = ghostTimersRef.current.get(stopKey)
    if (existing != null) window.clearTimeout(existing)

    const dissolveTimer = window.setTimeout(() => {
      setExitGhosts((prev) =>
        prev.map((g) =>
          g.stopKey === stopKey ? { ...g, collapsing: true } : g,
        ),
      )
      const collapseTimer = window.setTimeout(() => {
        ghostTimersRef.current.delete(stopKey)
        finishGhostExit(stopKey)
      }, GOMMAGE_COLLAPSE_MS)
      ghostTimersRef.current.set(stopKey, collapseTimer)
    }, GOMMAGE_DISSOLVE_MS)
    ghostTimersRef.current.set(stopKey, dissolveTimer)
  }

  // Detect any stop add/remove/reorder (manual, sync, restore, regen…) and play
  // the same structural animation regardless of where the change originated.
  // Skip only the first mount for a day and explicit day switches.
  useLayoutEffect(() => {
    const keys = day.stops.map((s, i) => stopKeyOf(s, i))
    const snap = day.stops.map((s, i) => ({ key: stopKeyOf(s, i), stop: s }))
    const prev = prevStopKeysRef.current
    const prevDay = prevDayRef.current

    if (prevDay !== day.day) {
      prevDayRef.current = day.day
      prevStopKeysRef.current = keys
      prevStopsSnapRef.current = snap
      prevTopsByKeyRef.current = new Map()
      clearEnterAnim()
      clearSwapAnim()
      clearReorderFlip()
      setExitGhosts([])
      setExitAnim(null)
      clearExitTimers()
      skipExternalExitRef.current.clear()
      skipNextFlipRef.current = false
      dragRef.current = null
      setDrag(null)
      setDropping(false)
      return
    }

    if (prev.length === 0) {
      prevStopKeysRef.current = keys
      prevStopsSnapRef.current = snap
      return
    }

    const added = keys.filter((k) => !prev.includes(k))
    const removed = prev.filter((k) => !keys.includes(k))

    // Same-slot replace (1 removed + 1 added at same index): swap anim only.
    if (added.length === 1 && removed.length === 1) {
      const oldKey = removed[0]
      const newKey = added[0]
      const oldIdx = prev.indexOf(oldKey)
      const newIdx = keys.indexOf(newKey)
      if (
        oldIdx >= 0 &&
        newIdx >= 0 &&
        oldIdx === newIdx &&
        !skipExternalExitRef.current.has(oldKey)
      ) {
        const fromSnap = prevStopsSnapRef.current.find((p) => p.key === oldKey)
        if (fromSnap) {
          clearEnterAnim()
          clearSwapAnim()
          clearReorderFlip()
          const cachedH = heightCacheRef.current[oldIdx]
          const measuredH = itemRefs.current[oldIdx]?.offsetHeight
          const fromHeightPx = Math.max(
            1,
            Math.round(cachedH || measuredH || 140),
          )
          setSwapAnim({
            index: oldIdx,
            oldKey,
            newKey,
            oldStop: fromSnap.stop,
            fromHeightPx,
            toHeightPx: fromHeightPx,
            heightPx: fromHeightPx,
            phase: 'measure',
          })
          prevStopKeysRef.current = keys
          prevStopsSnapRef.current = snap
          return
        }
      }
    }

    // Pure reorder: same identity set, different order — FLIP cards to new slots.
    const isPureReorder =
      added.length === 0 &&
      removed.length === 0 &&
      prev.length === keys.length &&
      prev.length > 0 &&
      prev.some((k, i) => k !== keys[i]) &&
      prev.every((k) => keys.includes(k))

    if (isPureReorder) {
      const skipFlip = skipNextFlipRef.current
      skipNextFlipRef.current = false
      if (
        !skipFlip &&
        !dragRef.current &&
        !exitAnimKeyRef.current &&
        exitGhostKeysRef.current.size === 0
      ) {
        const first = prevTopsByKeyRef.current
        const shifts: Record<string, number> = {}
        let any = false
        for (let i = 0; i < keys.length; i++) {
          const k = keys[i]
          const el = itemRefs.current[i]
          if (!el) continue
          const firstTop = first.get(k)
          if (firstTop == null) continue
          const lastTop = el.getBoundingClientRect().top
          const dy = firstTop - lastTop
          if (Math.abs(dy) > REORDER_FLIP_EPS_PX) {
            shifts[k] = dy
            any = true
          }
        }
        if (any) {
          clearReorderFlip()
          setReorderFlip({ shifts, playing: false })
        }
      }
      prevStopKeysRef.current = keys
      prevStopsSnapRef.current = snap
      return
    }

    if (added.length) {
      if (enterClearTimerRef.current != null) {
        window.clearTimeout(enterClearTimerRef.current)
      }
      clearReorderFlip()

      // FLIP every existing card from its real pre-insert position. Unlike a
      // fixed translate value, this stays exact for cards and legs of any height.
      const shifts: Record<string, number> = {}
      let hasPeerShift = false
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i]
        if (added.includes(key)) continue
        const firstTop = prevTopsByKeyRef.current.get(key)
        const el = itemRefs.current[i]
        if (firstTop == null || !el) continue
        const dy = firstTop - el.getBoundingClientRect().top
        if (Math.abs(dy) > REORDER_FLIP_EPS_PX) {
          shifts[key] = dy
          hasPeerShift = true
        }
      }
      if (hasPeerShift) setReorderFlip({ shifts, playing: false })

      setEnteringKeys(added)
      const primary = added[0]
      const index = keys.indexOf(primary)
      setEnterAnim(primary && index >= 0 ? { stopKey: primary, index } : null)
      enterClearTimerRef.current = window.setTimeout(() => {
        enterClearTimerRef.current = null
        setEnterAnim(null)
        setEnteringKeys([])
      }, ENTER_ANIM_MS)
    }

    if (removed.length) {
      clearReorderFlip()
      const freshGhosts: ExitGhost[] = []
      for (const k of removed) {
        if (skipExternalExitRef.current.has(k)) {
          skipExternalExitRef.current.delete(k)
          continue
        }
        if (exitAnimKeyRef.current === k) continue
        if (exitGhostKeysRef.current.has(k)) continue
        const fromSnap = prevStopsSnapRef.current.find((p) => p.key === k)
        if (!fromSnap) continue
        const index = prev.indexOf(k)
        freshGhosts.push({
          stopKey: k,
          stop: fromSnap.stop,
          index: index >= 0 ? index : 0,
          heightPx: Math.max(
            1,
            Math.round(heightCacheRef.current[index] || 140),
          ),
          collapsing: false,
        })
      }
      if (freshGhosts.length) {
        setExitGhosts((prevGhosts) => [...prevGhosts, ...freshGhosts])
        for (const g of freshGhosts) scheduleGhostExit(g.stopKey)
      }
    }

    prevStopKeysRef.current = keys
    prevStopsSnapRef.current = snap
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day.stops, day.day])

  useEffect(() => {
    return () => {
      if (enterClearTimerRef.current != null) {
        window.clearTimeout(enterClearTimerRef.current)
      }
      if (swapTimerRef.current != null) {
        window.clearTimeout(swapTimerRef.current)
      }
      if (swapPhaseTimerRef.current != null) {
        window.clearTimeout(swapPhaseTimerRef.current)
      }
      if (swapRafRef.current != null) {
        cancelAnimationFrame(swapRafRef.current)
      }
      if (reorderFlipRafRef.current != null) {
        cancelAnimationFrame(reorderFlipRafRef.current)
      }
      if (reorderFlipTimerRef.current != null) {
        window.clearTimeout(reorderFlipTimerRef.current)
      }
      clearExitTimers()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // After invert frame paints, play FLIP → resting positions.
  useLayoutEffect(() => {
    if (!reorderFlip || reorderFlip.playing) return
    reorderFlipRafRef.current = requestAnimationFrame(() => {
      reorderFlipRafRef.current = null
      setReorderFlip((prev) =>
        prev && !prev.playing ? { ...prev, playing: true } : prev,
      )
    })
    return () => {
      if (reorderFlipRafRef.current != null) {
        cancelAnimationFrame(reorderFlipRafRef.current)
        reorderFlipRafRef.current = null
      }
    }
  }, [reorderFlip])

  useEffect(() => {
    if (!reorderFlip?.playing) return
    if (reorderFlipTimerRef.current != null) {
      window.clearTimeout(reorderFlipTimerRef.current)
    }
    reorderFlipTimerRef.current = window.setTimeout(() => {
      reorderFlipTimerRef.current = null
      setReorderFlip(null)
    }, REORDER_FLIP_MS + 40)
    return () => {
      if (reorderFlipTimerRef.current != null) {
        window.clearTimeout(reorderFlipTimerRef.current)
        reorderFlipTimerRef.current = null
      }
    }
  }, [reorderFlip?.playing])

  // Cache resting tops by stopKey for the next FLIP (skip while motion is active).
  useLayoutEffect(() => {
    if (drag || reorderFlip || swapAnim || exitAnim || exitGhosts.length) return
    const map = new Map<string, number>()
    for (let i = 0; i < day.stops.length; i++) {
      const el = itemRefs.current[i]
      if (!el) continue
      map.set(stopKeyOf(day.stops[i], i), el.getBoundingClientRect().top)
    }
    prevTopsByKeyRef.current = map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day.stops, day.day, drag, reorderFlip, swapAnim, exitAnim, exitGhosts.length])

  // After replace mounts: measure new card height → morph if needed → wipe.
  useLayoutEffect(() => {
    if (!swapAnim || swapAnim.phase !== 'measure') return

    const stage = swapStageRef.current
    const underCard = stage?.querySelector(
      '.timeline-swap-under [data-timeline-card]',
    ) as HTMLElement | null
    const measured = Math.round(
      underCard?.scrollHeight || underCard?.offsetHeight || swapAnim.fromHeightPx,
    )
    const toHeightPx = Math.max(1, measured)
    const fromHeightPx = swapAnim.fromHeightPx
    const needsMorph = Math.abs(toHeightPx - fromHeightPx) > SWAP_HEIGHT_EPS_PX

    if (swapPhaseTimerRef.current != null) {
      window.clearTimeout(swapPhaseTimerRef.current)
      swapPhaseTimerRef.current = null
    }
    if (swapRafRef.current != null) {
      cancelAnimationFrame(swapRafRef.current)
      swapRafRef.current = null
    }

    if (!needsMorph) {
      // Heights match — wipe-only after legs fade.
      swapPhaseTimerRef.current = window.setTimeout(() => {
        swapPhaseTimerRef.current = null
        beginSwapWipe(fromHeightPx, fromHeightPx)
      }, SWAP_LEG_FADE_MS)
      return
    }

    // Morph first: hold old height one frame, then transition to new height, then wipe.
    setSwapAnim((prev) =>
      prev && prev.phase === 'measure'
        ? {
            ...prev,
            toHeightPx,
            heightPx: fromHeightPx,
            phase: 'morph',
          }
        : prev,
    )

    swapRafRef.current = requestAnimationFrame(() => {
      swapRafRef.current = requestAnimationFrame(() => {
        swapRafRef.current = null
        setSwapAnim((prev) =>
          prev && prev.phase === 'morph'
            ? { ...prev, heightPx: toHeightPx }
            : prev,
        )
        swapPhaseTimerRef.current = window.setTimeout(() => {
          swapPhaseTimerRef.current = null
          beginSwapWipe(fromHeightPx, toHeightPx)
        }, SWAP_MORPH_MS)
      })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swapAnim?.phase, swapAnim?.oldKey, swapAnim?.newKey])

  // Cache resting card heights so replace can freeze the slot without reflow.
  useLayoutEffect(() => {
    if (swapAnim || exitAnim || exitGhosts.length || reorderFlip) return
    const next: number[] = []
    for (let i = 0; i < day.stops.length; i++) {
      const el = itemRefs.current[i]
      const card = el?.querySelector('[data-timeline-card]') as HTMLElement | null
      next[i] = Math.round(card?.offsetHeight || el?.offsetHeight || 0)
    }
    heightCacheRef.current = next
  })

  const handleAddCustomLocal = (place: Place, mode: 'best' | 'end') => {
    onAddCustom(place, mode)
    setAddOpen(false)
  }

  const displayItems = useMemo(() => {
    type Item = {
      stop: ItineraryStop
      stopKey: string
      liveIndex: number | null
      ghost?: ExitGhost
    }
    const live: Item[] = day.stops.map((stop, i) => ({
      stop,
      stopKey: stopKeyOf(stop, i),
      liveIndex: i,
    }))
    if (!exitGhosts.length) return live

    const result = [...live]
    const sorted = [...exitGhosts].sort((a, b) => a.index - b.index)
    for (const g of sorted) {
      const at = Math.min(Math.max(0, g.index), result.length)
      result.splice(at, 0, {
        stop: g.stop,
        stopKey: g.stopKey,
        liveIndex: null,
        ghost: g,
      })
    }
    return result
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day.stops, day.day, exitGhosts])

  const dayOrigin = getDayOrigin(day.day, hotel)
  const routePlaces = day.stops.map((stop): Place | null => {
    try {
      return getPlace(stop.placeId, customPlaces)
    } catch {
      return null
    }
  })
  const stopPlaces = routePlaces.map((place, index) =>
    place || {
      id: day.stops[index]?.placeId || `missing-${index}`,
      type: 'attraction' as const,
      name: day.stops[index]?.placeId || '未知地点',
    },
  )
  const stopNumbers = numberedStopIndexes(stopPlaces)
  const routeCity = 'Paris, France'
  const originRoutePoint = {
    lat: dayOrigin.lat,
    lng: dayOrigin.lng,
    query:
      dayOrigin.kind === 'airport' ? 'Charles de Gaulle Airport' : hotel.name,
    city: routeCity,
    placeId: dayOrigin.kind === 'hotel' ? hotel.googlePlaceId : undefined,
  }
  const firstRoutePlace = routePlaces[0]
  const firstRouteMode = inferGoogleMapsTravelMode(
    day.stops[0]?.transport,
    day.stops[0]?.walkLevel,
  )
  const firstRouteUrl = firstRoutePlace
    ? googleMapsDirectionsUrl({
        origin: originRoutePoint,
        destination: {
          ...firstRoutePlace.location,
          query: firstRoutePlace.name,
          city: routeCity,
          placeId: firstRoutePlace.googlePlaceId,
        },
        travelMode: firstRouteMode,
      })
    : undefined

  const isFixedAt = (index: number) => {
    const place = stopPlaces[index]
    if (!place) return true
    const isCheckIn =
      day.day === 1 && index === 0 && place.id === SELECTED_HOTEL_PLACE_ID
    const isOvernight =
      !isLastDay &&
      index === day.stops.length - 1 &&
      place.id === SELECTED_HOTEL_PLACE_ID
    const isReturnAirport =
      isLastDay &&
      index === day.stops.length - 1 &&
      isAirportPlace(place)
    return isCheckIn || isOvernight || isReturnAirport
  }

  const requestDelete = (stopKey: string, index: number) => {
    if (
      readOnly ||
      dayPending ||
      dayRestoring ||
      isFixedAt(index) ||
      drag ||
      exitAnim ||
      exitGhosts.length ||
      swapAnim ||
      reorderFlip
    )
      return
    clearEnterAnim()
    const el = itemRefs.current[index]
    const heightPx = el?.offsetHeight ?? 140
    if (el) {
      el.style.setProperty('--exit-h', `${heightPx}px`)
    }
    setExitAnim({ stopKey, index, heightPx, collapsing: false })

    // After dissolve, collapse the slot height so unmount doesn't jump.
    exitTimerRef.current = window.setTimeout(() => {
      setExitAnim((prev) =>
        prev && prev.stopKey === stopKey ? { ...prev, collapsing: true } : prev,
      )
      exitTimerRef.current = window.setTimeout(() => {
        exitTimerRef.current = null
        skipExternalExitRef.current.add(stopKey)
        onDelete(stopKey)
        setExitAnim(null)
      }, GOMMAGE_COLLAPSE_MS)
    }, GOMMAGE_DISSOLVE_MS)
  }

  const captureLayout = (fromIndex: number) => {
    const first = itemRefs.current[0]
    const fromEl = itemRefs.current[fromIndex]
    // Subtract any existing transform so we capture resting layout.
    const fromShift = 0
    const originTop = first
      ? first.getBoundingClientRect().top - fromShift
      : 0

    let slot = 120
    const fromCard = fromEl?.querySelector(
      '[data-timeline-card]',
    ) as HTMLElement | null
    if (fromCard) slot = Math.max(96, fromCard.offsetHeight + 20)

    const mids: number[] = []
    let cursor = originTop
    for (let i = 0; i < day.stops.length; i++) {
      const el = itemRefs.current[i]
      const card = el?.querySelector('[data-timeline-card]') as HTMLElement | null
      const h = card?.offsetHeight ?? el?.offsetHeight ?? slot - 12
      mids.push(cursor + h / 2)
      cursor += slot
    }
    return { mids, slot }
  }

  const pickHoverIndex = (
    clientY: number,
    from: number,
    currentHover: number,
    mids: number[],
  ) => {
    if (!mids.length) return from
    let candidate = mids.length - 1
    for (let i = 0; i < mids.length; i++) {
      if (clientY < mids[i]) {
        candidate = i
        break
      }
    }
    // Hysteresis: stay on current slot until past its mid by a margin.
    if (candidate !== currentHover && currentHover >= 0 && currentHover < mids.length) {
      const mid = mids[currentHover]
      const margin = 22
      if (candidate > currentHover && clientY < mid + margin) return currentHover
      if (candidate < currentHover && clientY > mid - margin) return currentHover
    }
    if (isFixedAt(candidate) && candidate !== from) {
      // Snap to nearest movable index.
      for (let d = 1; d < mids.length; d++) {
        const up = candidate - d
        const down = candidate + d
        if (up >= 0 && (!isFixedAt(up) || up === from)) return up
        if (down < mids.length && (!isFixedAt(down) || down === from)) return down
      }
      return from
    }
    return candidate
  }

  const stopRaf = () => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }

  const applyFloatPos = (x: number, y: number) => {
    floatRef.current = { x, y }
    const el = floatElRef.current
    if (el) {
      el.style.left = `${x}px`
      el.style.top = `${y}px`
    }
  }

  const tickFloat = () => {
    const session = dragRef.current
    if (!session) {
      rafRef.current = null
      return
    }
    const targetX = pointerRef.current.x - session.grabX
    const targetY = pointerRef.current.y - session.grabY
    // Viscous follow — lags behind the finger for sticky inertia.
    const ease = 0.22
    applyFloatPos(
      floatRef.current.x + (targetX - floatRef.current.x) * ease,
      floatRef.current.y + (targetY - floatRef.current.y) * ease,
    )

    const hover = pickHoverIndex(
      pointerRef.current.y,
      session.from,
      session.hover,
      session.mids,
    )
    if (hover !== session.hover) {
      const next = { ...session, hover }
      dragRef.current = next
      setFloatPos({ ...floatRef.current })
      setDrag(next)
    }

    rafRef.current = requestAnimationFrame(tickFloat)
  }

  const endDrag = (commit: boolean) => {
    stopRaf()
    const session = dragRef.current
    if (!session) return

    const from = session.from
    // Inertia: flick slightly biases the drop slot.
    const predictedY = pointerRef.current.y + velocityRef.current.y * 140
    const to = commit
      ? pickHoverIndex(predictedY, from, session.hover, session.mids)
      : from
    const settled = { ...session, hover: to }
    dragRef.current = settled
    setDrag(settled)
    setDropping(true)

    // Aim float at the frozen mid of the target slot (not live transformed rect).
    const mid = session.mids[to]
    if (mid != null) {
      floatRef.current = {
        x: session.startLeft,
        y: mid - session.height / 2,
      }
      setFloatPos({ ...floatRef.current })
    }

    window.setTimeout(() => {
      if (commit && from !== to) {
        skipNextFlipRef.current = true
        onReorder(from, to)
      }
      dragRef.current = null
      setDrag(null)
      setDropping(false)
      suppressClickRef.current = true
      window.setTimeout(() => {
        suppressClickRef.current = false
      }, 40)
    }, 200)
  }

  useEffect(() => {
    if (!drag) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.body.classList.add('timeline-dragging')
    return () => {
      document.body.style.overflow = prev
      document.body.classList.remove('timeline-dragging')
    }
  }, [drag])

  useEffect(() => {
    if (!drag || dropping) return

    const onMove = (e: PointerEvent) => {
      const now = performance.now()
      const dt = Math.max(1, now - velocityRef.current.lastT)
      velocityRef.current = {
        y: (e.clientY - velocityRef.current.lastY) / dt,
        lastY: e.clientY,
        lastT: now,
      }
      pointerRef.current = { x: e.clientX, y: e.clientY }
    }
    const onUp = () => endDrag(true)
    const onCancel = () => endDrag(false)

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(drag), dropping, day.stops.length])

  useEffect(() => () => stopRaf(), [])

  const dragFrom = drag?.from ?? null
  useLayoutEffect(() => {
    if (dragFrom === null || dropping) return
    applyFloatPos(floatRef.current.x, floatRef.current.y)
  }, [dragFrom, dropping])

  const beginDrag = (
    index: number,
    e: ReactPointerEvent,
    cardEl: HTMLElement,
  ) => {
    if (
      readOnly ||
      dayPending ||
      dayRestoring ||
      isFixedAt(index) ||
      drag ||
      exitAnim ||
      exitGhosts.length ||
      swapAnim ||
      reorderFlip
    )
      return
    e.preventDefault()
    e.stopPropagation()

    const rect = cardEl.getBoundingClientRect()
    const layout = captureLayout(index)
    const session: DragSession = {
      from: index,
      hover: index,
      grabX: e.clientX - rect.left,
      grabY: e.clientY - rect.top,
      width: rect.width,
      height: rect.height,
      slot: layout.slot,
      mids: layout.mids,
      startLeft: rect.left,
      startTop: rect.top,
    }
    pointerRef.current = { x: e.clientX, y: e.clientY }
    velocityRef.current = { y: 0, lastY: e.clientY, lastT: performance.now() }
    dragRef.current = session
    applyFloatPos(rect.left, rect.top)
    setFloatPos({ x: rect.left, y: rect.top })
    setDrag(session)
    setDropping(false)
    stopRaf()
    rafRef.current = requestAnimationFrame(tickFloat)

    try {
      cardEl.setPointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }

  const dragging = Boolean(drag)
  const avgSlot = drag?.slot ?? 120
  /**
   * Structural list motion (enter / exit / replace).
   * While busy: fade legs + freeze leg-body height so morph can't fight card motion.
   */
  const layoutBusy = Boolean(
    enterAnim ||
      enteringKeys.length ||
      exitAnim ||
      exitGhosts.length ||
      swapAnim ||
      reorderFlip,
  )
  /** Drag-reorder: collapse leg height so cards can pack while sorting. */
  const collapseLegs = dragging
  /** Fade legs only — keep layout space so card gaps stay stable. */
  const fadeLegs = layoutBusy
  /** Freeze leg body height during any list structural / drag motion. */
  const lockLegHeight = layoutBusy || collapseLegs
  const legSlotClassName = (extra = '') =>
    [
      'timeline-leg-slot',
      collapseLegs ? 'timeline-leg-slot-collapsed' : '',
      fadeLegs ? 'timeline-leg-slot-faded' : '',
      extra,
    ]
      .filter(Boolean)
      .join(' ')

  return (
    <div className="w-full min-w-0 max-w-full space-y-4">
      <motion.div
        custom={direction}
        variants={timelineItemVariants}
        className="w-full min-w-0 max-w-full rounded-2xl border border-white/70 bg-[var(--card)] p-3.5 sm:p-4 shadow-sm"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 sm:gap-2">
            <span className="rounded-full bg-[var(--ink)] px-2.5 py-1 text-xs text-[var(--paper)]">
              Day {day.day}
            </span>
            <span className="rounded-full bg-[var(--sage)]/15 px-2.5 py-1 text-xs text-[var(--sage)]">
              {dayPending ? (
                <span className="inline-block h-3 w-16 rounded-full day-tab-shimmer" />
              ) : (
                day.pace
              )}
            </span>
            <span className="hidden rounded-full bg-[var(--mist)] px-2.5 py-1 text-xs text-[var(--stone)] sm:inline-flex">
              {readOnly ? '只读共享' : '可拖拽排序 · 可增删'}
            </span>
            {copyRefreshing && !dayRegenerating && (
              <LoadingIndicator
                variant="badge"
                thinkingLabel="文案思考中"
                generatingLabel="文案更新中"
                size="sm"
                showDots
                mode="thinking"
                task="dayCopy"
              />
            )}
            {dayRegenerating && (
              <LoadingIndicator
                variant="badge"
                thinkingLabel="正在思考今天的行程…"
                generatingLabel="正在重新生成今天…"
                size="sm"
                showDots
                mode="thinking"
                task="itineraryDayGenerate"
              />
            )}
          </div>
          {!readOnly && (
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            {canRestoreDayDefault && onRestoreDayDefault && (
              <button
                type="button"
                onClick={onRestoreDayDefault}
                disabled={dayRegenerating || dayRestoring || dayPending}
                title={dayRestoring ? '正在恢复本日默认' : '恢复本日默认'}
                aria-label={dayRestoring ? '正在恢复本日默认' : '恢复本日默认'}
                aria-busy={dayRestoring || dayPending || undefined}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--stone)]/30 text-[var(--stone)] transition-colors hover:border-[var(--sage)] hover:text-[var(--sage)] disabled:cursor-wait disabled:opacity-60"
              >
                <RestoreDayIcon busy={dayRestoring} />
              </button>
            )}
            <button
              type="button"
              onClick={onResetDay}
              disabled={dayRegenerating || dayRestoring || dayPending}
              title={dayRegenerating ? '正在重新生成行程' : '重新生成行程'}
              aria-label={dayRegenerating ? '正在重新生成行程' : '重新生成行程'}
              aria-busy={dayRegenerating || dayPending || undefined}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--stone)]/30 text-[var(--stone)] transition-colors hover:border-[var(--sage)] hover:text-[var(--sage)] disabled:cursor-wait disabled:opacity-60"
            >
              <RegenerateDayIcon busy={dayRegenerating} />
            </button>
          </div>
          )}
        </div>
        <h3 className="font-display mt-2 break-words text-xl sm:text-2xl md:text-3xl">
          {dayPending ? (
            <span className="mt-1 inline-block h-8 w-2/3 rounded-full day-tab-shimmer" />
          ) : (
            day.title
          )}
        </h3>
        <p className="break-words text-sm text-[var(--copper)]">
          {dayPending ? (
            <span className="inline-block h-4 w-1/2 rounded-full day-tab-shimmer" />
          ) : (
            day.theme
          )}
        </p>
        <p className="mt-2 break-words text-sm text-[var(--stone)]">
          {dayPending ? (
            <span className="mt-1 inline-block h-4 w-full rounded-full day-tab-shimmer" />
          ) : (
            day.summary
          )}
        </p>
        {dayRegenError && (
          <p className="mt-2 whitespace-pre-line break-words rounded-xl border border-[var(--copper)]/30 bg-[var(--mist)]/40 px-3 py-2 text-left text-xs text-[var(--copper)]">
            {dayRegenError}
          </p>
        )}
        {(dayPending || dayRegenerating) && (
          <div className="mt-3 rounded-xl border border-[var(--sage)]/20 bg-[var(--mist)]/40 px-3 py-3">
            <LoadingIndicator
              variant="inline"
              thinkingLabel={
                dayPending
                  ? `正在生成第 ${day.day} 天行程…`
                  : '正在仔细规划今天的行程…'
              }
              generatingLabel={
                dayPending
                  ? `正在生成第 ${day.day} 天行程…`
                  : '正在重新生成今天的行程…'
              }
              size="sm"
              showDots
              mode="thinking"
              task="itineraryDayGenerate"
            />
            {dayPending ? (
              <p className="mt-1.5 text-xs text-[var(--stone)]">
                其他天可先查看，这一天生成好后会自动更新。
              </p>
            ) : null}
          </div>
        )}
        <div className="mt-3">
          <p className="break-words rounded-xl bg-[var(--mist)]/50 px-3 py-2 text-xs sm:text-sm">
            <span className="font-medium">路线导航：</span>
            点击每段交通，在 Google Maps 查看实时路线
          </p>
        </div>
      </motion.div>

      {/* Day-1 airport origin chip (not an itinerary stop; matches map plane marker). */}
      {!dayPending && dayOrigin.kind === 'airport' && (
        <motion.div
          custom={direction}
          variants={timelineItemVariants}
          className="flex w-full min-w-0 max-w-full items-start gap-3 rounded-2xl border border-white/70 bg-[var(--card)] p-3"
        >
          <span
            className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--copper)] text-white"
            title="机场"
            aria-label="机场"
          >
            <PlaneIcon />
          </span>
          <div className="min-w-0 flex-1">
            <span className="text-xs text-[var(--stone)]">今日起点</span>
            <p className="mt-1 font-medium">{dayOrigin.label}</p>
          </div>
        </motion.div>
      )}

      {/* Day origin → first stop (airport on day 1, hotel otherwise) */}
      {!dayPending &&
        (day.stops.length > 0 || exitGhosts.length > 0) && (
        <motion.div
          custom={direction}
          variants={timelineItemVariants}
          className={`w-full min-w-0 max-w-full ${legSlotClassName()}`}
          aria-hidden={collapseLegs || fadeLegs || undefined}
        >
          <div className="timeline-leg-slot-inner">
            <LegConnector
              leg={navPlan.hotelToFirst}
              lockHeight={lockLegHeight}
              routeUrl={firstRouteUrl}
              routeMode={firstRouteMode}
              originCue={
                dayOrigin.kind === 'airport' ? '从机场' : '从酒店'
              }
              fallbackLabel={`${googleMapsTravelModeLabel(firstRouteMode)} · Google Maps`}
            />
          </div>
        </motion.div>
      )}

      {dayPending ? (
        <div
          className="space-y-1"
          role="status"
          aria-busy="true"
          aria-label={`正在加载第 ${day.day} 天行程地点`}
        >
          {Array.from({ length: 3 }, (_, i) => (
            <TimelineStopCardSkeleton key={i} index={i} />
          ))}
        </div>
      ) : (
        <ol
          className={`w-full min-w-0 max-w-full list-none p-0 m-0 space-y-1 overflow-visible ${dragging ? 'select-none' : ''}`}
        >
        {displayItems.map((item, displayIndex) => {
          const { stop, stopKey, liveIndex, ghost } = item
          let place: Place
          try {
            place = getPlace(stop.placeId, customPlaces)
          } catch {
            place = {
              id: stop.placeId,
              type: 'attraction',
              name: stop.placeId,
              description: '',
              ratingHint: '',
              image: '',
              location: { lat: 0, lng: 0 },
              googleMapsUrl: '',
            }
          }
          const active = selectedPlaceId === place.id
          const n =
            liveIndex != null ? stopNumbers[liveIndex] : displayIndex + 1
          const isHotelStop = isHotelPlace(place)
          const isAirportStop = isAirportPlace(place)
          const isGhost = liveIndex == null
          const isReturnAirport =
            !isGhost &&
            isLastDay &&
            liveIndex === day.stops.length - 1 &&
            isAirportStop
          const isFixedHotel =
            !isGhost && liveIndex != null ? isFixedAt(liveIndex) : false
          const pinTitle =
            day.day === 1 && liveIndex === 0 && place.id === SELECTED_HOTEL_PLACE_ID
              ? '酒店入住点固定为首站'
              : '回酒店过夜固定为末站'
          const legToNext =
            liveIndex != null ? navPlan.betweenStops[liveIndex] : undefined
          const nextStop =
            liveIndex != null ? day.stops[liveIndex + 1] : undefined
          const nextRouteMode = inferGoogleMapsTravelMode(
            nextStop?.transport,
            nextStop?.walkLevel,
          )
          const legInbound =
            liveIndex == null
              ? null
              : liveIndex === 0
                ? navPlan.hotelToFirst
                : navPlan.betweenStops[liveIndex - 1]
          const travelChip =
            travelChipFromLeg(legInbound) || stop.walkLevel || null
          const isDragSource = liveIndex != null && drag?.from === liveIndex
          const shiftY =
            drag && liveIndex != null && !isDragSource
              ? listShiftPx(liveIndex, drag.from, drag.hover, avgSlot)
              : 0
          const isDropTarget =
            dragging &&
            liveIndex != null &&
            drag &&
            drag.hover === liveIndex &&
            drag.from !== liveIndex
          const isEntering = enteringKeys.includes(stopKey)
          const ghostExiting = Boolean(ghost)
          const liveExiting = exitAnim?.stopKey === stopKey
          const isExiting = ghostExiting || liveExiting
          const isCollapsing = ghost
            ? Boolean(ghost.collapsing)
            : Boolean(liveExiting && exitAnim?.collapsing)
          const exitHeightPx = ghost?.heightPx ?? exitAnim?.heightPx
          const isSwappingHere = Boolean(
            swapAnim &&
              !isGhost &&
              liveIndex === swapAnim.index &&
              stopKey === swapAnim.newKey,
          )
          const flipDy = reorderFlip?.shifts[stopKey]
          const isFlipping = flipDy != null

          let oldSwapPlace: Place | null = null
          if (isSwappingHere && swapAnim) {
            try {
              oldSwapPlace = getPlace(swapAnim.oldStop.placeId, customPlaces)
            } catch {
              oldSwapPlace = {
                id: swapAnim.oldStop.placeId,
                type: 'attraction',
                name: swapAnim.oldStop.placeId,
                description: '',
                ratingHint: '',
                image: '',
                location: { lat: 0, lng: 0 },
                googleMapsUrl: '',
              }
            }
          }

          const cardInner = isReturnAirport ? (
            <div className="flex w-full min-w-0 max-w-full items-start gap-3 rounded-2xl border border-white/70 bg-[var(--card)] p-3">
              <span
                className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--copper)] text-white"
                title="机场"
                aria-label="机场"
              >
                <PlaneIcon />
              </span>
              <div className="min-w-0 flex-1">
                <span className="text-xs text-[var(--stone)]">今日终点</span>
                <p className="mt-1 font-medium">{place.name}</p>
              </div>
            </div>
          ) : (
            <div
              className={`flex w-full min-w-0 max-w-full items-start gap-2 rounded-2xl border p-2.5 sm:gap-3 sm:p-3 transition-[border-color,box-shadow,background-color] duration-200 ${
                active
                  ? 'border-[var(--copper)] bg-white shadow-[var(--shadow)] ring-2 ring-[var(--copper)]/40 timeline-card-selected-highlight'
                  : 'border-white/70 bg-[var(--card)]'
              }`}
            >
              {isFixedHotel ? (
                <span
                  className="mt-1 inline-flex h-7 w-7 select-none items-center justify-center rounded-md bg-[var(--mist)] text-[var(--stone)]"
                  title={pinTitle}
                  aria-label={pinTitle}
                >
                  <PinIcon />
                </span>
              ) : readOnly || isGhost ? (
                <span className="mt-1 inline-flex h-7 w-7" aria-hidden />
              ) : (
                <span
                  className="timeline-drag-handle mt-1 inline-flex h-7 w-7 cursor-grab select-none items-center justify-center rounded-md bg-[var(--mist)] text-xs text-[var(--stone)] touch-none active:cursor-grabbing"
                  title="按住拖动排序"
                  aria-label="按住拖动排序"
                  onPointerDown={(e) => {
                    if (liveIndex == null) return
                    const card = (e.currentTarget as HTMLElement).closest(
                      '[data-timeline-card]',
                    ) as HTMLElement | null
                    if (card) beginDrag(liveIndex, e, card)
                  }}
                >
                  <GripVertical size={16} strokeWidth={1.8} aria-hidden />
                </span>
              )}
              {isHotelStop ? (
                <span
                  className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--copper)] text-white"
                  title="酒店"
                  aria-label="酒店"
                >
                  <HouseIcon />
                </span>
              ) : isAirportStop ? (
                <span
                  className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--copper)] text-white"
                  title="机场"
                  aria-label="机场"
                >
                  <PlaneIcon />
                </span>
              ) : (
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--sage)] text-xs font-semibold text-white">
                  {n}
                </span>
              )}
              <button
                type="button"
                onClick={() => {
                  if (suppressClickRef.current || dragging || isGhost) return
                  onSelectPlace(place.id)
                }}
                className="flex min-w-0 flex-1 items-start gap-2 text-left sm:gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-[var(--mist)] px-2 py-0.5 text-xs text-[var(--stone)]">
                      {stop.time}
                    </span>
                    <span className="text-xs text-[var(--stone)]">
                      {typeLabel[place.type] || place.type}
                    </span>
                  </div>
                  <PlaceName
                    className="mt-1"
                    mode="originalWithZh"
                    name={place.name}
                    nameLocal={place.nameLocal}
                    location={place.location}
                  />
                  <p className="mt-1.5 text-sm text-[var(--stone)]">{stop.note}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-[var(--stone)]">
                    {travelChip && (
                      <span className="rounded-full bg-[var(--mist)] px-2 py-1">
                        {travelChip}
                      </span>
                    )}
                    {stop.duration && (
                      <span className="rounded-full bg-[var(--mist)] px-2 py-1">
                        {stop.duration}
                      </span>
                    )}
                  </div>
                </div>
                <GooglePlacePhoto
                  name={place.name}
                  nameLocal={place.nameLocal}
                  googlePlaceId={place.googlePlaceId}
                  tripadvisorContentId={place.tripadvisorContentId}
                  location={place.location}
                  type={place.type}
                  fallback={place.image}
                  alt={place.name}
                  className="hidden h-16 w-16 shrink-0 rounded-xl sm:block"
                  showBadge={false}
                />
              </button>
              {isFixedHotel || readOnly || isGhost ? (
                <span className="mt-0.5 inline-flex h-8 w-8 shrink-0" aria-hidden />
              ) : (
                <button
                  type="button"
                  title="删除此地点"
                  aria-label="删除此地点"
                  disabled={
                    dayRestoring ||
                    Boolean(exitAnim) ||
                    exitGhosts.length > 0 ||
                    Boolean(swapAnim) ||
                    Boolean(reorderFlip)
                  }
                  onClick={(e) => {
                    e.stopPropagation()
                    if (liveIndex == null) return
                    requestDelete(stopKey, liveIndex)
                  }}
                  className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--stone)] hover:bg-red-50 hover:text-red-700 disabled:pointer-events-none disabled:opacity-40"
                >
                  <TrashIcon />
                </button>
              )}
            </div>
          )

          return (
            <li
              key={
                // Keep the same card instance when deletion shifts its index.
                stopKey
              }
              ref={(el) => {
                if (liveIndex != null) itemRefs.current[liveIndex] = el
              }}
              className={`timeline-sortable-item relative w-full min-w-0 max-w-full overflow-visible ${
                isEntering ? 'timeline-card-entering' : ''
              } ${isExiting ? 'timeline-card-exiting' : ''} ${
                isExiting && isCollapsing ? 'timeline-card-exiting-collapse' : ''
              } ${isSwappingHere ? 'timeline-card-swapping' : ''}`}
              style={{
                transform: shiftY
                  ? `translate3d(0, ${shiftY}px, 0)`
                  : isFlipping
                    ? reorderFlip!.playing
                      ? 'translate3d(0, 0, 0)'
                      : `translate3d(0, ${flipDy}px, 0)`
                    : undefined,
                transition: dragging
                  ? 'transform 280ms cubic-bezier(0.25, 0.85, 0.3, 1)'
                  : isFlipping
                    ? reorderFlip!.playing
                      ? 'transform var(--timeline-reorder-ms) var(--timeline-ease)'
                      : 'none'
                    : enterAnim ||
                        enteringKeys.length ||
                        exitAnim ||
                        exitGhosts.length ||
                        swapAnim ||
                        reorderFlip
                      ? undefined
                      : 'transform 200ms ease',
                zIndex:
                  isDropTarget ||
                  isEntering ||
                  isExiting ||
                  isSwappingHere ||
                  isFlipping
                    ? 3
                    : 1,
                ...(isExiting && exitHeightPx != null
                  ? ({
                      ['--exit-h' as string]: `${exitHeightPx}px`,
                    } satisfies CSSProperties)
                  : null),
              }}
              onAnimationEnd={(e) => {
                if (!isEntering) return
                if (e.target !== e.currentTarget) return
                if (e.animationName !== 'timeline-card-enter') return
                setEnteringKeys((ks) => {
                  const next = ks.filter((k) => k !== stopKey)
                  if (!next.length) setEnterAnim(null)
                  return next
                })
              }}
            >
              <motion.div
                custom={direction}
                variants={timelineItemVariants}
                className="relative w-full min-w-0 max-w-full"
              >
                {isSwappingHere && swapAnim && oldSwapPlace ? (
                  <div
                    ref={swapStageRef}
                    className={`timeline-swap-stage w-full min-w-0 max-w-full${
                      swapAnim.phase === 'morph' ? ' timeline-swap-morphing' : ''
                    }${
                      swapAnim.phase === 'wipe' ? ' timeline-swap-wiping' : ''
                    }`}
                    style={{
                      height: `${swapAnim.heightPx}px`,
                      transition:
                        swapAnim.phase === 'morph'
                          ? `height ${SWAP_MORPH_MS}ms ${TIMELINE_EASE}`
                          : undefined,
                    }}
                  >
                    {/* New underneath — clipped to stage height; hidden until wipe */}
                    <div
                      className={`timeline-swap-layer timeline-swap-under${
                        swapAnim.phase !== 'wipe'
                          ? ' timeline-swap-under-pending'
                          : ''
                      }`}
                    >
                      <div
                        data-timeline-card
                        className="w-full min-w-0 max-w-full rounded-2xl border border-transparent"
                      >
                        {cardInner}
                      </div>
                    </div>
                    {/* Old on top — wipe erase after optional height morph */}
                    <div
                      className={`timeline-swap-layer timeline-swap-over${
                        swapAnim.phase === 'wipe' ? ' timeline-swap-over-wiping' : ''
                      }`}
                      aria-hidden
                    >
                      <div
                        data-timeline-card
                        className="w-full min-w-0 max-w-full rounded-2xl border border-transparent"
                      >
                        <div className="flex w-full min-w-0 max-w-full items-start gap-2 rounded-2xl border border-white/70 bg-[var(--card)] p-2.5 sm:gap-3 sm:p-3">
                          <span className="mt-1 inline-flex h-7 w-7" aria-hidden />
                          <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--sage)] text-xs font-semibold text-white">
                            {n}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full bg-[var(--mist)] px-2 py-0.5 text-xs text-[var(--stone)]">
                                {swapAnim.oldStop.time}
                              </span>
                              <span className="text-xs text-[var(--stone)]">
                                {typeLabel[oldSwapPlace.type] || oldSwapPlace.type}
                              </span>
                            </div>
                            <PlaceName
                              className="mt-1"
                              mode="originalWithZh"
                              name={oldSwapPlace.name}
                              nameLocal={oldSwapPlace.nameLocal}
                              location={oldSwapPlace.location}
                            />
                            <p className="mt-1.5 text-sm text-[var(--stone)]">
                              {swapAnim.oldStop.note}
                            </p>
                          </div>
                          <GooglePlacePhoto
                            name={oldSwapPlace.name}
                            nameLocal={oldSwapPlace.nameLocal}
                            googlePlaceId={oldSwapPlace.googlePlaceId}
                            tripadvisorContentId={oldSwapPlace.tripadvisorContentId}
                            location={oldSwapPlace.location}
                            type={oldSwapPlace.type}
                            fallback={oldSwapPlace.image}
                            alt={oldSwapPlace.name}
                            className="hidden h-16 w-16 shrink-0 rounded-xl sm:block"
                            showBadge={false}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div
                      data-timeline-card
                      className={`w-full min-w-0 max-w-full rounded-2xl border ${
                        isDropTarget
                          ? 'border-[var(--copper)]/50 ring-2 ring-[var(--copper)]/20'
                          : 'border-transparent'
                      } ${isDragSource ? 'opacity-0' : 'opacity-100'} ${
                        isExiting ? 'timeline-card-gommage' : ''
                      }`}
                      style={{
                        transition: isExiting
                          ? undefined
                          : 'box-shadow 200ms ease, opacity 160ms ease',
                      }}
                    >
                      {cardInner}
                    </div>
                    {isExiting && !isCollapsing && <GommagePetals />}
                  </>
                )}
              </motion.div>

              {liveIndex != null && liveIndex < day.stops.length - 1 && (
                <motion.div
                  custom={direction}
                  variants={timelineItemVariants}
                  className={`w-full min-w-0 max-w-full ${legSlotClassName()}`}
                  aria-hidden={collapseLegs || fadeLegs || undefined}
                >
                  <div className="timeline-leg-slot-inner">
                    <LegConnector
                      leg={legToNext}
                      lockHeight={lockLegHeight}
                      routeMode={nextRouteMode}
                      routeUrl={
                        place.location && routePlaces[liveIndex + 1]
                          ? googleMapsDirectionsUrl({
                              origin: {
                                ...place.location,
                                query: place.name,
                                city: routeCity,
                                placeId: place.googlePlaceId,
                              },
                              destination: {
                                ...routePlaces[liveIndex + 1]!.location,
                                query: routePlaces[liveIndex + 1]!.name,
                                city: routeCity,
                                placeId:
                                  routePlaces[liveIndex + 1]!.googlePlaceId,
                              },
                              travelMode: nextRouteMode,
                            })
                          : undefined
                      }
                      fallbackLabel={
                        `${googleMapsTravelModeLabel(nextRouteMode)} · Google Maps`
                      }
                    />
                  </div>
                </motion.div>
              )}
            </li>
          )
        })}
        </ol>
      )}

      {drag && (
        <div
          ref={floatElRef}
          className={`timeline-drag-float pointer-events-none fixed z-[80] ${
            dropping ? 'timeline-drag-float-settle' : 'timeline-drag-float-lifted'
          }`}
          style={{
            left: dropping ? floatPos.x : undefined,
            top: dropping ? floatPos.y : undefined,
            width: drag.width,
          }}
        >
          <div className="timeline-drag-float-card rounded-2xl border border-white/80 bg-[var(--card)] ring-1 ring-[var(--ink)]/5">
            <div className="timeline-drag-float-content">
            {(() => {
              const stop = day.stops[drag.from]
              if (!stop) return null
              const place = getPlace(stop.placeId, customPlaces)
              const n = stopNumbers[drag.from]
              const isHotelStop = isHotelPlace(place)
              const isAirportStop = isAirportPlace(place)
              const legInbound =
                drag.from === 0
                  ? navPlan.hotelToFirst
                  : navPlan.betweenStops[drag.from - 1]
              const travelChip =
                travelChipFromLeg(legInbound) || stop.walkLevel || null
              return (
                <div className="flex items-start gap-3 rounded-2xl border border-white/70 bg-[var(--card)] p-3">
                  <span className="mt-1 inline-flex h-7 cursor-grabbing items-center justify-center rounded-md bg-[var(--mist)] px-2 text-xs text-[var(--stone)]">
                    <GripVertical size={16} strokeWidth={1.8} aria-hidden />
                  </span>
                  {isHotelStop ? (
                    <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--copper)] text-white">
                      <HouseIcon />
                    </span>
                  ) : isAirportStop ? (
                    <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--copper)] text-white">
                      <PlaneIcon />
                    </span>
                  ) : (
                    <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--sage)] text-xs font-semibold text-white">
                      {n}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-[var(--mist)] px-2 py-0.5 text-xs text-[var(--stone)]">
                        {stop.time}
                      </span>
                      <span className="text-xs text-[var(--stone)]">
                        {typeLabel[place.type] || place.type}
                      </span>
                    </div>
                    <PlaceName
                      className="mt-1"
                      mode="originalWithZh"
                      name={place.name}
                      nameLocal={place.nameLocal}
                      location={place.location}
                    />
                    <p className="mt-1.5 line-clamp-2 text-sm text-[var(--stone)]">
                      {stop.note}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-[var(--stone)]">
                      {travelChip && (
                        <span className="rounded-full bg-[var(--mist)] px-2 py-1">
                          {travelChip}
                        </span>
                      )}
                      {stop.duration && (
                        <span className="rounded-full bg-[var(--mist)] px-2 py-1">
                          {stop.duration}
                        </span>
                      )}
                    </div>
                  </div>
                  <GooglePlacePhoto
                    name={place.name}
                    nameLocal={place.nameLocal}
                    googlePlaceId={place.googlePlaceId}
                    tripadvisorContentId={place.tripadvisorContentId}
                    location={place.location}
                    type={place.type}
                    fallback={place.image}
                    alt={place.name}
                    className="hidden h-16 w-16 shrink-0 rounded-xl sm:block"
                    showBadge={false}
                  />
                </div>
              )
            })()}
            </div>
          </div>
        </div>
      )}

      {!dayPending && !day.stops.length && !exitGhosts.length && (
        <motion.p
          custom={direction}
          variants={timelineItemVariants}
          className="rounded-2xl border border-dashed border-[var(--stone)]/30 px-4 py-6 text-center text-sm text-[var(--stone)]"
        >
          {readOnly ? '本日还没有地点。' : '本日还没有地点，点击下方添加。'}
        </motion.p>
      )}

      {!readOnly && !dayPending && (
        <>
          <motion.div custom={direction} variants={timelineItemVariants} className="pt-3 sm:pt-4">
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              disabled={dayRestoring}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-[var(--sage)]/50 bg-[var(--sage)]/5 px-4 py-3 text-sm font-medium text-[var(--sage)] hover:bg-[var(--sage)]/10 disabled:cursor-wait disabled:opacity-60"
            >
              <Plus size={15} strokeWidth={2} aria-hidden />
              添加地点
            </button>
          </motion.div>

          <AddPlaceDialog
            open={addOpen}
            dayNumber={day.day}
            dayTitle={day.title}
            dayPace={day.pace}
            dayTheme={day.theme}
            hotelArea={hotel.areaKey}
            hotelLocation={{ lat: hotel.lat, lng: hotel.lng }}
            recommendationPreferences={recommendationPreferences}
            currentPlaceNames={day.stops.map((s) => {
              try {
                return getPlace(s.placeId, customPlaces).name
              } catch {
                return s.placeId
              }
            })}
            tripPlaceNames={tripPlaceNames}
            onClose={() => setAddOpen(false)}
            onAddCustom={handleAddCustomLocal}
          />
        </>
      )}
    </div>
  )
}
