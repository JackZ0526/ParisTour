import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useBodyScrollLock } from '../../../shared/hooks/useBodyScrollLock'
import { useEnterExit } from '../../../shared/hooks/useEnterExit'
import { createPortal } from 'react-dom'
import {
  fetchGooglePlaceDetails,
} from '../../map/services/googlePlaceDetails'
import { fetchPlaceWebsitePhotosWithFallback } from '../../place/services/placeWebsitePhotos'
import { fetchTripadvisorAttractionInfo } from '../../place/services/tripadvisorPlacePhotos'
import {
  generatePlaceDescription,
  generatePlaceDetailCopy,
  getOpenAIModelShortLabel,
  getThinkingMode,
  getThinkingModeLabel,
  isDeepSeekModel,
  isLlmConfigured,
  resolveThinkingForTask,
  supportsThinkingControls,
  type HotelDetailCopy,
} from '../../../shared/services/llm/llm'
import { useLlmSettings } from '../hooks/useOpenAIModel'
import { ModelBrandIcon } from './LlmModelPicker'
import {
  memoizePlaceDetailCopy,
  peekPlaceDetailCopy,
  placeDetailKeysFromPlace,
} from '../../place/services/placeDetailMemo'
import {
  nearbyStopsForAdvisor,
  placeAdvisorCopyFields,
  placeAdvisorFactsSignature,
  type PlaceAdvisorFacts,
} from '../../place/services/placeAdvisorFacts'
import {
  persistHotelState,
  refreshHotelCandidates,
  replaceHotelCandidates,
  replaceOneHotelCandidate,
} from '../../hotel/services/hotelRecommend'
import { candidateToSelected, resolveHotelCandidate } from '../../hotel/services/hotelResolve'
import {
  extractQuotedPlaceNames,
  findReplaceTargetInDay,
  inferPlaceTypeFromText,
  isReplacePlaceIntent,
  matchHotelCandidate,
  matchPlaceInDay,
  replyClaimsDetailConfirm,
  replyClaimsItineraryApplied,
  sendTripChatMessageStream,
  stripDetailConfirmClaim,
  type TripChatAction,
  type TripChatContext,
  type TripChatDestination,
  type TripChatTurn,
  type TripChatViewingTarget,
} from '../services/tripChat'
import type {
  DayPlan,
  FlightInfo,
  HotelCandidate,
  Place,
  PlaceType,
  SelectedHotel,
} from '../../../types'
import { useLlmBusyMode } from '../hooks/useOpenAIModel'
import { CloseIconButton } from '../../../shared/components/CloseIconButton'
import {
  glassBackdropSurfaceClass,
  glassCapsuleSurfaceClass,
  glassCapsuleToneClass,
} from '../../../shared/styles/glassCapsule'
import { InlineMarkdown } from './InlineMarkdown'
import { GooglePlacePage } from '../../place/components/GooglePlacePage'
import { ButtonSpinner, LoadingIndicator } from '../../../shared/components/LoadingIndicator'
import { LlmModelPicker } from './LlmModelPicker'
import {
  FALLBACK_IMAGE,
  PENDING_PLACE_LABELS,
  RECOMMENDED_ATTRACTION_MAX_DISTANCE_METERS,
  RECOMMENDED_FOOD_MAX_DISTANCE_METERS,
  buildRerecommendMessage,
  clarifyReplyForPending,
  friendlyChatError,
  isOperationalStopNote,
  notesClaimDetailConfirm,
  notesIndicateItineraryApplied,
  pendingFallbackReason,
  pickTravelerStopNote,
  type PendingPlaceConfirm,
} from './chatHelpers'

const NO_ACTION_APPLIED_NOTE = '行程未改动，请再说一下你想要的调整。'
const DETAIL_CONFIRM_MISSING_NOTE = '行程未改动：请在详情页确认是否加入。'
const TRIP_CHAT_BACKDROP_Z = 2040
const TRIP_CHAT_PANEL_Z = 2045
// Panel width target: 23.75rem (380px) on wide viewports, but never
// wider than viewport − 2.5rem margin (prevents the panel from running
// off the left edge on narrow phones, where the chip→panel morph would
// otherwise overshoot the screen).
const TRIP_CHAT_PANEL_WIDTH = 'min(calc(100vw - 2.5rem), 23.75rem)'

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mediaQuery = window.matchMedia(query)
    setMatches(mediaQuery.matches)
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches)
    mediaQuery.addEventListener('change', onChange)
    return () => mediaQuery.removeEventListener('change', onChange)
  }, [query])

  return matches
}

export interface TripChatHandlers {
  switchDay: (day: number) => void
  selectPlace: (placeId: string) => void
  removeStop: (day: number, stopId: string) => void
  addPlace: (
    day: number,
    place: Place,
    options?: { mode?: 'best' | 'end'; insertAt?: number; select?: boolean },
  ) => void
  replaceStop: (
    day: number,
    stopId: string,
    place: Place,
    options?: { select?: boolean },
  ) => void
  reorderStop: (day: number, fromIndex: number, toIndex: number) => void
  setHotel: (hotel: SelectedHotel) => void
  setHotelCandidates: (candidates: HotelCandidate[]) => void
}
import { ChatBubbleIcon } from './ChatBubbleIcon'
import {
  CHAT_WORK_STEP_LABELS,
  actionsNeedPlaceLookup,
  activateChatWorkStep,
  finishChatWorkSteps,
  initialChatWorkSteps,
  requestPlanStepLabel,
  searchStepLabel,
  type ChatWorkStep,
} from './ChatWorkStepList'
import {
  ChatWorkStepsPanel,
  StoredChatWorkStepsPanel,
} from './ChatWorkStepPanels'
import {
  ChatReasoningDisclosure,
  StoredChatReasoningDisclosure,
} from './ChatReasoningDisclosure'

interface Props {
  hotel: SelectedHotel
  hotelCandidates: HotelCandidate[]
  days: DayPlan[]
  currentDay: number
  customPlaces: Record<string, Place>
  /** Destination from DestinationPanel / trip meta (string or structured). */
  destination?: TripChatDestination | string | null
  /** Optional free-text preferences when collected by the app. */
  preferences?: string | null
  tripStartDate?: string | null
  tripEndDate?: string | null
  itineraryStartDate?: string | null
  outbound?: FlightInfo | null
  returnFlight?: FlightInfo | null
  /** Open PlacePanel / hotel detail the user is viewing (for 「这个怎么样」). */
  viewing?: TripChatViewingTarget | null
  handlers: TripChatHandlers
  forceOpen?: boolean
  onClose?: () => void
}

interface ChatSuggestion {
  text: string
  tone: keyof typeof glassCapsuleToneClass
}

const SUGGESTIONS: ChatSuggestion[] = [
  { text: '介绍一下当前选中的酒店', tone: 'gold' },
  { text: '按左岸、中档重新推荐一批酒店', tone: 'gold' },
  { text: '介绍一下今天行程里的第一个地点', tone: 'sage' },
  { text: '帮我在今天加上一家附近的咖啡馆', tone: 'copper' },
  { text: '把凯旋门从行程里删掉', tone: 'neutral' },
]

export function TripChatPanel({
  hotel,
  hotelCandidates,
  days,
  currentDay,
  customPlaces,
  destination = null,
  preferences = null,
  tripStartDate = null,
  tripEndDate = null,
  itineraryStartDate = null,
  outbound = null,
  returnFlight = null,
  viewing = null,
  handlers,
  forceOpen,
  onClose,
}: Props) {
  const [internalOpen, setInternalOpen] = useState(false)
  const open = forceOpen ?? internalOpen
  const setOpen = (next: boolean | ((prev: boolean) => boolean)) => {
    const nextVal = typeof next === 'function' ? next(open) : next
    setInternalOpen(nextVal)
    if (!nextVal && onClose) {
      onClose()
    }
  }
  const isDesktop = useMediaQuery('(min-width: 640px)')
  useBodyScrollLock(open && !isDesktop)
  const { model, thinkingMode } = useLlmSettings()
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [streamingReply, setStreamingReply] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<TripChatTurn[]>([])
  const [actionNotes, setActionNotes] = useState<string[]>([])
  const [panelEntered, setPanelEntered] = useState(false)
  const [modelPickerVisible, setModelPickerVisible] = useState(!open)
  const modelPickerVisibleRef = useRef(!open)
  const chatOpenRef = useRef(open)
  chatOpenRef.current = open
  // The morph completion callback sets `panelEntered` when the panel settles.
  // Reset it immediately on close, and keep a fallback timer for opening in
  // case an interrupted animation does not report completion.
  useEffect(() => {
    if (open) {
      modelPickerVisibleRef.current = false
      setModelPickerVisible(false)
      const t = setTimeout(() => setPanelEntered(true), 520)
      return () => clearTimeout(t)
    }
    setPanelEntered(false)
  }, [open])
  const [pendingPlaces, setPendingPlaces] = useState<PendingPlaceConfirm[]>([])
  /** Bumps GooglePlacePage remount when confirm overlay must be forced visible. */
  const [confirmEpoch, setConfirmEpoch] = useState(0)
  const [pendingStory, setPendingStory] = useState<HotelDetailCopy | null>(null)
  const [pendingStoryLoading, setPendingStoryLoading] = useState(false)
  const [pendingStoryRegenToken, setPendingStoryRegenToken] = useState(0)
  const [advisorFacts, setAdvisorFacts] = useState<PlaceAdvisorFacts | null>(null)
  const [advisorFactsPendingId, setAdvisorFactsPendingId] = useState<string | null>(null)
  const [confirmBusy, setConfirmBusy] = useState(false)
  const [busyUserText, setBusyUserText] = useState('')
  const [workSteps, setWorkSteps] = useState<ChatWorkStep[]>([])
  const [workStepsOpen, setWorkStepsOpen] = useState(false)
  const [reasoningText, setReasoningText] = useState('')
  const [reasoningOpen, setReasoningOpen] = useState(false)
  const [showReasoningUi, setShowReasoningUi] = useState(false)
  const [requestThinkingEnabled, setRequestThinkingEnabled] = useState<boolean | undefined>(
    undefined,
  )
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const wasOpenRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  const backdrop = useEnterExit('fade')
  // Spring for the FAB↔panel container transform. stiffness 350 / damping 30
  // gives just a hint of overshoot (iOS modal presentation feel) and settles
  // in ~320ms. Higher stiffness than the TimePicker morph because the
  // aspect-ratio change (48x48 → 380x560) is much larger — too much bounce
  // reads as "the button flew away" rather than "grew".
  const morphSpring = { type: 'spring' as const, stiffness: 350, damping: 30 }
  const workStepsRef = useRef<ChatWorkStep[]>([])
  const reasoningTextRef = useRef('')
  const chatBusy = useLlmBusyMode({
    task: 'tripChat',
    userText: busyUserText || input,
    thinkingEnabled: requestThinkingEnabled,
  })
  // Snapshot day/hotel context so itinerary edits don't re-fire LLM mid-confirm.
  const pendingCtxRef = useRef({ hotel, days, customPlaces })
  pendingCtxRef.current = { hotel, days, customPlaces }
  workStepsRef.current = workSteps
  reasoningTextRef.current = reasoningText

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  function beginChatRequest(): AbortController {
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    return ac
  }

  function buildChatContext(): TripChatContext {
    return {
      hotel,
      hotelCandidates,
      days,
      currentDay,
      customPlaces,
      destination,
      preferences,
      tripStartDate,
      tripEndDate,
      itineraryStartDate,
      outbound,
      returnFlight,
      viewing,
    }
  }

  function isAbortError(err: unknown): boolean {
    return (
      (err instanceof DOMException && err.name === 'AbortError') ||
      (err instanceof Error && err.name === 'AbortError')
    )
  }

  function updateLastAssistantContent(content: string) {
    setHistory((prev) => {
      if (!prev.length) return prev
      const last = prev[prev.length - 1]
      if (!last || last.role !== 'assistant') return prev
      if (last.content === content) return prev
      return [...prev.slice(0, -1), { ...last, content }]
    })
  }

  const activePending = pendingPlaces[0] ?? null
  const activePendingId = activePending?.id

  // If pending exists but the portaled detail page never painted, force remount.
  useEffect(() => {
    if (!pendingPlaces.length) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      if (cancelled) return
      const visible = document.querySelector('[data-pending-place-confirm="1"]')
      if (!visible) {
        setOpen(false)
        setConfirmEpoch((e) => e + 1)
      }
    }, 80)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [pendingPlaces, confirmEpoch])

  const factsForPending =
    advisorFactsPendingId === activePending?.id ? advisorFacts : null
  const factsSig = placeAdvisorFactsSignature(factsForPending)

  // Generate intro + 推荐理由 when pending confirm opens (same memo as PlacePanel).
  useEffect(() => {
    if (!activePending) {
      setPendingStory(null)
      setPendingStoryLoading(false)
      return
    }

    const pending = activePending
    const place = pending.place
    const fallbackReason = pendingFallbackReason(pending)
    const stopNote =
      pending.note ||
      (pending.kind === 'replace'
        ? `用于替换「${pending.fromPlaceName || '原地点'}」`
        : '')
    const detailKeys = placeDetailKeysFromPlace(place)
    const bypass = pendingStoryRegenToken > 0
    if (!bypass) {
      const memoHit = peekPlaceDetailCopy(...detailKeys)
      if (memoHit) {
        setPendingStory({ ...memoHit, tripFit: '' })
        setPendingStoryLoading(false)
        return
      }
    }

    if (!isLlmConfigured()) {
      setPendingStory({
        intro: place.description,
        reason: fallbackReason,
        tripFit: '',
      })
      setPendingStoryLoading(false)
      return
    }

    if (!factsSig) {
      setPendingStory({ intro: '', reason: '', tripFit: '' })
      setPendingStoryLoading(true)
      return
    }

    let cancelled = false
    setPendingStory({ intro: '', reason: '', tripFit: '' })
    setPendingStoryLoading(true)

    const ctx = pendingCtxRef.current
    const day = ctx.days.find((d) => d.day === pending.dayNum)
    const facts = placeAdvisorCopyFields(factsForPending)
    const nearbyStops = day
      ? nearbyStopsForAdvisor(day.stops, undefined, ctx.customPlaces)
      : []

    void memoizePlaceDetailCopy(
      detailKeys,
      () =>
        generatePlaceDetailCopy({
          name: place.name,
          nameLocal: place.nameLocal,
          type: place.type,
          address: facts.address,
          existingDescription: place.description,
          listingDescription: facts.listingDescription,
          stopNote,
          rating: facts.rating,
          reviewCount: facts.reviewCount,
          priceLevel: facts.priceLevel,
          cuisine: facts.cuisine,
          featuredReviews: facts.featuredReviews,
          nearbyStops,
          day: pending.dayNum,
          dayTitle: day?.title,
          dayTheme: day?.theme,
          dayPace: day?.pace,
          hotelArea: ctx.hotel.areaKey,
          tripDays: ctx.days.map((d) => ({
            day: d.day,
            title: d.title,
            pace: d.pace,
            theme: d.theme,
          })),
          onPartial: (partial) => {
            if (cancelled) return
            setPendingStory((prev) => ({
              intro: partial.intro ?? prev?.intro ?? '',
              reason: partial.reason ?? prev?.reason ?? '',
              tripFit: '',
            }))
          },
        }).then((copy) => {
          if (!copy) {
            return {
              intro: place.description,
              reason: fallbackReason,
              tripFit: '',
            }
          }
          return { ...copy, tripFit: '' }
        }),
      { bypass },
    )
      .then((copy) => {
        if (cancelled || !copy) return
        setPendingStory(copy)
      })
      .finally(() => {
        if (!cancelled) setPendingStoryLoading(false)
      })

    return () => {
      cancelled = true
    }
    // Only re-run when the pending confirm target changes or user regenerates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePending?.id, pendingStoryRegenToken, factsSig])

  useEffect(() => {
    setPendingStoryRegenToken(0)
  }, [activePending?.id])

  useEffect(() => {
    if (!activePendingId || !isLlmConfigured()) return
    if (factsSig) return
    const pendingId = activePendingId
    const timer = window.setTimeout(() => {
      setAdvisorFactsPendingId(pendingId)
      setAdvisorFacts((prev) =>
        prev?.settled ? prev : { reviews: prev?.reviews || [], settled: true },
      )
    }, 12_000)
    return () => window.clearTimeout(timer)
  }, [activePendingId, factsSig])

  // AnimatePresence keeps the panel mounted through the close animation, so the
  // panelEntered gate below is set by `onAnimationComplete` on the panel
  // motion.div (when the height animation settles).
  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false
      return
    }
    // Wait for the panel's enter animation to finish so bottomRef is mounted
    // and the scroll container has its final height — otherwise scrollIntoView
    // runs on a still-transforming, possibly detached panel (reopen case).
    if (!panelEntered) return
    // Jump instantly when opening so we don't animate through the whole history.
    const behavior: ScrollBehavior = wasOpenRef.current ? 'smooth' : 'auto'
    wasOpenRef.current = true
    bottomRef.current?.scrollIntoView({ behavior, block: 'end' })
  }, [history, actionNotes, busy, streamingReply, workSteps, reasoningText, open, panelEntered])

  // Mobile keeps modal-style outside-click and Escape dismissal. On desktop,
  // the assistant is non-modal and can only be closed with its X button.
  useEffect(() => {
    if (!open || isDesktop) return

    function onPointerDown(event: PointerEvent) {
      const root = rootRef.current
      if (root && !root.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, isDesktop])

  function beginWorkPipeline(userText: string) {
    setWorkSteps(initialChatWorkSteps(userText))
    setWorkStepsOpen(false)
    setReasoningText('')
    setReasoningOpen(false)
    // The preflight classifier itself runs without thinking. Its result will
    // update this before the answer model starts.
    setRequestThinkingEnabled(false)
    setShowReasoningUi(false)
  }

  function clearWorkPipeline() {
    setWorkSteps([])
    setWorkStepsOpen(false)
    setReasoningText('')
    setShowReasoningUi(false)
    setReasoningOpen(false)
    setRequestThinkingEnabled(undefined)
  }

  function persistWorkOnLastAssistant(
    steps: ChatWorkStep[],
    reasoning: string,
    content?: string,
  ) {
    const finished = finishChatWorkSteps(steps)
    const reasoningTrimmed = reasoning.trim()
    setHistory((prev) => {
      const last = prev[prev.length - 1]
      if (!last || last.role !== 'assistant') return prev
      return [
        ...prev.slice(0, -1),
        {
          ...last,
          ...(content !== undefined ? { content } : {}),
          steps: finished,
          ...(reasoningTrimmed ? { reasoning: reasoningTrimmed } : {}),
        },
      ]
    })
    clearWorkPipeline()
  }

  async function buildPlaceFromQuery(input: {
    placeName: string
    placeType?: PlaceType
    source?: 'explicit' | 'recommend'
    /** Optional chat-action note — only used when traveler-facing, never operational. */
    note?: string
    dayNum: number
  }): Promise<Place> {
    const placeType: PlaceType = input.placeType || 'attraction'
    if (placeType === 'attraction') {
      const ta = await fetchTripadvisorAttractionInfo({
        name: input.placeName,
      })
      if (!ta?.location) {
        throw new Error(`找不到景点「${input.placeName}」，请换个更完整的名称。`)
      }
      const travelerNote = !isOperationalStopNote(input.note) ? input.note?.trim() : undefined
      const hasUsefulNote = Boolean(travelerNote && travelerNote.length >= 12)
      return {
        id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        tripadvisorContentId: ta.contentId,
        name: ta.name || input.placeName,
        type: 'attraction',
        description:
          (hasUsefulNote ? travelerNote : undefined) ||
          ta.description ||
          `${ta.name}，适合安排进第 ${input.dayNum} 天行程。`,
        ratingHint:
          ta.rating != null ? `Tripadvisor ★ ${ta.rating.toFixed(1)}` : 'Tripadvisor 景点',
        image: ta.photos[0] || FALLBACK_IMAGE,
        location: ta.location,
        googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          `${ta.name} Paris`,
        )}`,
        durationHint: '90 分钟',
      }
    }

    const hotelLocation =
      Number.isFinite(hotel.lat) &&
      Number.isFinite(hotel.lng) &&
      Math.abs(hotel.lat) <= 90 &&
      Math.abs(hotel.lng) <= 180 &&
      (hotel.lat !== 0 || hotel.lng !== 0)
        ? { lat: hotel.lat, lng: hotel.lng }
        : undefined
    const maxDistanceMeters =
      input.source === 'recommend' && hotelLocation
        ? placeType === 'restaurant' || placeType === 'cafe'
          ? RECOMMENDED_FOOD_MAX_DISTANCE_METERS
          : RECOMMENDED_ATTRACTION_MAX_DISTANCE_METERS
        : undefined
    const details = await fetchGooglePlaceDetails(
      `${input.placeName} Paris`,
      hotelLocation,
      { maxDistanceMeters },
    )
    if (!details?.location) {
      if (maxDistanceMeters) {
        throw new Error(
          `没有在当前住宿附近验证到「${input.placeName}」，已取消操作，避免误选外地同名地点。`,
        )
      }
      throw new Error(`找不到地点「${input.placeName}」，请换个更完整的名称。`)
    }

    // Never seed place.description from operational action.note
    // (e.g. 「作为第1天晚餐，按行程路线顺路插入。」) — that becomes the DayTimeline card.
    const travelerNote = !isOperationalStopNote(input.note) ? input.note?.trim() : undefined
    const hasUsefulNote = Boolean(travelerNote && travelerNote.length >= 12)
    let description =
      (hasUsefulNote ? travelerNote : undefined) ||
      details.summary ||
      `${details.name}，适合安排进第 ${input.dayNum} 天行程。`

    if (isLlmConfigured() && !hasUsefulNote) {
      const blurb = await generatePlaceDescription({
        name: details.name,
        type: placeType,
        address: details.address,
        googleSummary: details.summary,
      })
      if (blurb) description = blurb
    }

    const websitePhotos = (
      await fetchPlaceWebsitePhotosWithFallback({
        website: details.website,
        name: details.name,
        nameLocal: details.nameOriginal,
        address: details.address,
      }).catch(() => ({ photos: [] }))
    ).photos
    const websitePhoto = websitePhotos[0] || null

    return {
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: details.name,
      type: placeType,
      description,
      googleRating: details.rating,
      googleUserRatingCount: details.userRatingCount,
      googleAddress: details.address,
      ratingHint: details.rating ? `Google ${details.rating}` : 'Google 地点',
      image: websitePhoto || FALLBACK_IMAGE,
      location: details.location,
      googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(details.name + ' Paris')}`,
      durationHint: placeType === 'cafe' ? '45 分钟' : '90 分钟',
    }
  }

  async function resolveAddHotel(
    action: Extract<TripChatAction, { type: 'add_hotel' }>,
    workingCandidates: HotelCandidate[],
    workingHotel: SelectedHotel,
  ): Promise<{ note: string; candidates: HotelCandidate[]; hotel: SelectedHotel }> {
    const existing = matchHotelCandidate(workingCandidates, action.hotelName)
    if (existing) {
      const selectedHotel = candidateToSelected(existing)
      if (action.select !== false) {
        handlers.setHotel(selectedHotel)
        persistHotelState(workingCandidates, selectedHotel)
        return {
          note: `候选项里已有「${existing.name}」，已设为当前酒店`,
          candidates: workingCandidates,
          hotel: selectedHotel,
        }
      }
      return {
        note: `候选项里已有「${existing.name}」`,
        candidates: workingCandidates,
        hotel: workingHotel,
      }
    }

    const card = await resolveHotelCandidate({
      name: action.hotelName,
      source: 'custom',
    })
    const next = [card, ...workingCandidates]
    handlers.setHotelCandidates(next)
    const selectedHotel = candidateToSelected(card)
    if (action.select !== false) {
      handlers.setHotel(selectedHotel)
      persistHotelState(next, selectedHotel)
      return {
        note: `已添加酒店「${card.name}」并设为当前住宿`,
        candidates: next,
        hotel: selectedHotel,
      }
    }
    persistHotelState(next, workingHotel)
    return {
      note: `已添加酒店候选项「${card.name}」`,
      candidates: next,
      hotel: workingHotel,
    }
  }

  async function resolveAddPlace(
    action: Extract<TripChatAction, { type: 'add_place' }>,
    rejectedNames?: string[],
  ): Promise<{
    note: string
    pending?: PendingPlaceConfirm
    /** Set when applied immediately (explicit). */
    appliedPlace?: Place
  }> {
    const dayNum = action.day || currentDay
    const place = await buildPlaceFromQuery({
      placeName: action.placeName,
      placeType: action.placeType,
      source: action.source,
      note: action.note,
      dayNum,
    })
    const mode = action.mode === 'end' ? 'end' : 'best'
    // Re-recommend chains always confirm; otherwise only model picks need confirm.
    const needsConfirm = action.source !== 'explicit' || Boolean(rejectedNames?.length)

    // User named the place → apply now; model recommendation → confirm UI.
    if (!needsConfirm) {
      handlers.addPlace(dayNum, place, { mode, select: false })
      return {
        note:
          mode === 'end'
            ? `已将「${place.name}」加到第 ${dayNum} 天末尾`
            : `已将「${place.name}」按最顺路插入第 ${dayNum} 天`,
        appliedPlace: place,
      }
    }

    return {
      note: `已找到「${place.name}」，请在详情页确认是否加入第 ${dayNum} 天`,
      pending: {
        id: `add-${place.id}`,
        kind: 'add',
        dayNum,
        place,
        note: action.note,
        mode,
        rejectedNames,
        status: 'ready',
      },
    }
  }

  async function resolveReplacePlace(
    action: Extract<TripChatAction, { type: 'replace_place' }>,
    workingDays: DayPlan[],
    activeDay: number,
    rejectedNames?: string[],
    userMessage?: string,
  ): Promise<{
    note: string
    pending?: PendingPlaceConfirm
    /** Updated local day snapshot when applied immediately. */
    nextDays?: DayPlan[]
  }> {
    const dayNum = action.day || activeDay
    const day = workingDays.find((d) => d.day === dayNum)
    if (!day) throw new Error(`没有第 ${dayNum} 天`)

    const hit =
      (action.fromPlaceName
        ? matchPlaceInDay(day, customPlaces, action.fromPlaceName)
        : null) ||
      findReplaceTargetInDay(day, customPlaces, {
        fromPlaceName: action.fromPlaceName,
        placeType: action.placeType,
        userMessage,
        excludePlaceName: action.toPlaceName,
      })
    if (!hit) {
      const label = action.fromPlaceName?.trim() || action.placeType || '地点'
      throw new Error(`第 ${dayNum} 天没有可替换的「${label}」`)
    }

    const place = await buildPlaceFromQuery({
      placeName: action.toPlaceName,
      placeType: action.placeType || hit.place.type,
      source: action.source,
      note: action.note,
      dayNum,
    })

    if (action.source === 'explicit' && !rejectedNames?.length) {
      handlers.replaceStop(dayNum, hit.stopId, place, { select: false })
      const nextDays = workingDays.map((d) => {
        if (d.day !== dayNum) return d
        const stops = [...d.stops]
        stops[hit.stopIndex] = {
          ...stops[hit.stopIndex],
          id: `d${dayNum}-${place.id}-${hit.stopIndex}`,
          placeId: place.id,
          note: place.description,
          duration: place.durationHint || stops[hit.stopIndex].duration,
        }
        return { ...d, stops }
      })
      return {
        note: `已将第 ${dayNum} 天的「${hit.place.name}」替换为「${place.name}」`,
        nextDays,
      }
    }

    return {
      note: `已找到「${place.name}」，请在详情页确认是否替换「${hit.place.name}」`,
      pending: {
        id: `replace-${hit.stopId}-${place.id}`,
        kind: 'replace',
        dayNum,
        place,
        note: action.note,
        replaceStopId: hit.stopId,
        fromPlaceName: hit.place.name,
        rejectedNames,
        status: 'ready',
      },
    }
  }

  /**
   * Enqueue recommend confirms. Detail uses createPortal(document.body) + inline
   * z-index; still close the chat sheet on mobile so it cannot trap focus.
   */
  function enqueuePendingPlaces(next: PendingPlaceConfirm[]) {
    if (!next.length) return
    setOpen(false)
    setPendingPlaces((prev) => [...prev, ...next])
    setConfirmEpoch((e) => e + 1)
  }

  /** When the model claims a detail confirm but apply produced none, rebuild pending. */
  async function recoverPendingConfirm(input: {
    reply: string
    actions: TripChatAction[]
    userMessage: string
    rejectedNames?: string[]
  }): Promise<PendingPlaceConfirm | null> {
    const { reply, actions, userMessage, rejectedNames } = input
    const workingDays = days.map((d) => ({ ...d, stops: [...d.stops] }))
    const placeActions = actions.filter(
      (a): a is Extract<TripChatAction, { type: 'add_place' | 'replace_place' }> =>
        a.type === 'add_place' || a.type === 'replace_place',
    )

    for (const action of placeActions) {
      try {
        if (action.type === 'replace_place') {
          const result = await resolveReplacePlace(
            { ...action, source: 'recommend' },
            workingDays,
            currentDay,
            rejectedNames,
            userMessage,
          )
          if (result.pending) return result.pending
        } else {
          const result = await resolveAddPlace(
            { ...action, source: 'recommend' },
            rejectedNames,
          )
          if (result.pending) return result.pending
        }
      } catch {
        /* try next candidate */
      }
    }

    const names = extractQuotedPlaceNames(reply)
    const replaceIntent = isReplacePlaceIntent(userMessage)
    const placeType =
      inferPlaceTypeFromText(userMessage) || inferPlaceTypeFromText(reply) || undefined

    for (const name of names) {
      try {
        if (replaceIntent) {
          const result = await resolveReplacePlace(
            {
              type: 'replace_place',
              toPlaceName: name,
              placeType,
              source: 'recommend',
            },
            workingDays,
            currentDay,
            rejectedNames,
            userMessage,
          )
          if (result.pending) return result.pending
        } else {
          const result = await resolveAddPlace(
            {
              type: 'add_place',
              placeName: name,
              placeType,
              mode: 'best',
              source: 'recommend',
            },
            rejectedNames,
          )
          if (result.pending) return result.pending
        }
      } catch {
        /* try next quoted name */
      }
    }
    return null
  }

  /**
   * Guarantee: if reply/notes say「请在详情页确认」, either pending opens or we
   * surface a hard error (never a dangling confirm promise).
   */
  async function ensurePendingFromTurn(input: {
    reply: string
    actions: TripChatAction[]
    userMessage: string
    notes: string[]
    pending: PendingPlaceConfirm[]
    rejectedNames?: string[]
  }): Promise<{ reply: string; notes: string[]; pending: PendingPlaceConfirm[] }> {
    let { reply, notes, pending } = input
    if (pending.length) {
      return {
        reply: clarifyReplyForPending(reply, pending),
        notes,
        pending,
      }
    }

    const wantsConfirm =
      replyClaimsDetailConfirm(reply) || notesClaimDetailConfirm(notes)
    if (!wantsConfirm) {
      return { reply, notes, pending }
    }

    // Model said confirm but apply already mutated — strip the false confirm claim.
    if (notesIndicateItineraryApplied(notes)) {
      return {
        reply: stripDetailConfirmClaim(reply) || reply,
        notes,
        pending: [],
      }
    }

    const recovered = await recoverPendingConfirm({
      reply,
      actions: input.actions,
      userMessage: input.userMessage,
      rejectedNames: input.rejectedNames,
    })
    if (recovered) {
      const confirmNote =
        recovered.kind === 'replace'
          ? `已找到「${recovered.place.name}」，请在详情页确认是否替换「${recovered.fromPlaceName || '原地点'}」`
          : `已找到「${recovered.place.name}」，请在详情页确认是否加入第 ${recovered.dayNum} 天`
      return {
        reply: clarifyReplyForPending(reply, [recovered]),
        notes: [...notes.filter((n) => !/请在详情页确认/.test(n)), confirmNote],
        pending: [recovered],
      }
    }

    const cleaned = stripDetailConfirmClaim(reply)
    const keepNotes = notes.filter((n) => !/请在详情页确认/.test(n))
    return {
      reply: cleaned
        ? `${cleaned}\n\n（${DETAIL_CONFIRM_MISSING_NOTE}）`
        : DETAIL_CONFIRM_MISSING_NOTE,
      notes: [...keepNotes, DETAIL_CONFIRM_MISSING_NOTE],
      pending: [],
    }
  }

  /** Backdrop / Esc: cancel without asking the model again. */
  function cancelPending(rejected: PendingPlaceConfirm) {
    if (rejected.status === 'rerecommending') return
    setPendingPlaces((prev) => prev.filter((p) => p.id !== rejected.id))
    setActionNotes((prev) => [...prev, `已取消「${rejected.place.name}」。`])
  }

  function confirmPending(pending: PendingPlaceConfirm) {
    if (confirmBusy || pending.status === 'rerecommending') return
    setConfirmBusy(true)
    // Close detail immediately before applying the itinerary mutation.
    setPendingPlaces((prev) => prev.filter((p) => p.id !== pending.id))
    try {
      // Prefer advisor intro / place blurb; never persist operational action.note on the card.
      const description =
        pickTravelerStopNote({
          storyIntro: pendingStory?.intro,
          placeDescription: pending.place.description,
          actionNote: pending.note,
        }) || pending.place.description
      const place =
        description !== pending.place.description
          ? { ...pending.place, description }
          : pending.place

      if (pending.kind === 'replace') {
        if (!pending.replaceStopId) {
          setActionNotes((prev) => [
            ...prev,
            `无法替换「${pending.fromPlaceName || '原地点'}」：缺少行程停点信息，请再说一次。`,
          ])
          return
        }
        handlers.replaceStop(pending.dayNum, pending.replaceStopId, place, {
          select: false,
        })
        setActionNotes((prev) => [
          ...prev,
          `已将第 ${pending.dayNum} 天的「${pending.fromPlaceName || '原地点'}」替换为「${place.name}」`,
        ])
        return
      }

      const mode = pending.mode === 'end' ? 'end' : 'best'
      // select: false — same as AddPlaceDialog; avoid reopening PlacePanel overlay.
      handlers.addPlace(pending.dayNum, place, { mode, select: false })
      setActionNotes((prev) => [
        ...prev,
        mode === 'end'
          ? `已将「${place.name}」加到第 ${pending.dayNum} 天末尾`
          : `已将「${place.name}」按最顺路插入第 ${pending.dayNum} 天`,
      ])
    } finally {
      setConfirmBusy(false)
    }
  }

  async function rerecommendPending(rejected: PendingPlaceConfirm) {
    if (busy || confirmBusy || rejected.status === 'rerecommending') return
    if (!isLlmConfigured()) {
      setError('对话助手暂不可用，请稍后再试。')
      return
    }

    const excluded = [...(rejected.rejectedNames || []), rejected.place.name]
    const message = buildRerecommendMessage(rejected, excluded)

    setConfirmBusy(true)
    setPendingPlaces((prev) =>
      prev.map((p) => (p.id === rejected.id ? { ...p, status: 'rerecommending' } : p)),
    )
    setError(null)
    // Keep exclusion prompt in API history only — never as a visible user bubble.
    setBusyUserText(message)
    beginWorkPipeline(message)
    setHistory((prev) => [
      ...prev,
      { role: 'user', content: message, hidden: true },
      { role: 'assistant', content: '' },
    ])
    setActionNotes(['正在重新推荐…'])
    setBusy(true)
    setStreamingReply(false)
    const ac = beginChatRequest()

    try {
      const result = await sendTripChatMessageStream({
        ctx: buildChatContext(),
        history,
        userMessage: message,
        signal: ac.signal,
        onRequestPlan: (phase, plan) => {
          if (abortRef.current !== ac || phase !== 'done' || !plan) return
          setRequestThinkingEnabled(plan.thinking.enabled)
          setShowReasoningUi(plan.thinking.enabled)
          setWorkSteps((prev) => {
            const relabeled = prev.map((step) => {
              if (step.id === 'preprocessPlan') {
                return { ...step, label: requestPlanStepLabel(plan) }
              }
              if (step.id === 'preprocessFallback') {
                return plan.source === 'fallback'
                  ? { ...step, status: 'done' as const }
                  : { ...step, status: 'skipped' as const }
              }
              return step
            })

            // Planning must finish before search/generation can begin. We keep
            // an explicit active step transition so shimmer stays "live".
            if (plan.needsWeb) {
              return activateChatWorkStep(relabeled, 'webSearch', {
                labels: {
                  webSearch: searchStepLabel(undefined, message),
                },
              })
            }

            return activateChatWorkStep(relabeled, 'generate')
          })
        },
        onWebSearch: (phase, detail) => {
          if (abortRef.current !== ac) return
          if (phase === 'start') {
            setWorkSteps((prev) =>
              activateChatWorkStep(prev, 'webSearch', {
                labels: {
                  webSearch: searchStepLabel(detail, message),
                },
              }),
            )
            return
          }
          if (phase === 'done') {
            setWorkSteps((prev) => activateChatWorkStep(prev, 'generate'))
            return
          }
          if (phase === 'skip') {
            setWorkSteps((prev) => {
              const next = prev.map((s) =>
                s.id === 'webSearch' ? { ...s, status: 'skipped' as const } : s,
              )
              return activateChatWorkStep(next, 'generate')
            })
          }
        },
        onReplyDelta: (reply) => {
          setStreamingReply(true)
          setWorkSteps((prev) => activateChatWorkStep(prev, 'generate'))
          updateLastAssistantContent(reply)
        },
        onReasoningDelta: (_delta, full) => {
          if (!resolveThinkingForTask(getThinkingMode(), message, "tripChat").enabled) return
          setShowReasoningUi(true)
          setReasoningText(full)
        },
      })
      if (abortRef.current !== ac) return
      setStreamingReply(false)
      setWorkSteps((prev) => activateChatWorkStep(prev, 'parse'))

      let notes: string[] = []
      let pending: PendingPlaceConfirm[] = []
      if (result.actions.length) {
        const applied = await applyActions(result.actions, {
          rejectedNames: excluded,
          userMessage: message,
          onProgress: (phase, detail) => {
            if (phase === 'resolvePlaces') {
              setWorkSteps((prev) =>
                activateChatWorkStep(
                  prev.map((s) =>
                    s.id === 'apply'
                      ? { ...s, status: 'pending' as const, label: '打开确认页…' }
                      : s,
                  ),
                  'resolvePlaces',
                  {
                    labels: {
                      resolvePlaces: detail?.label || CHAT_WORK_STEP_LABELS.resolvePlaces,
                    },
                  },
                ),
              )
              return
            }
            setWorkSteps((prev) =>
              activateChatWorkStep(prev, 'apply', {
                labels: {
                  apply: detail?.pending ? '打开确认页…' : '应用改动…',
                },
              }),
            )
          },
        })
        notes = applied.notes
        pending = applied.pending
      }

      if (abortRef.current !== ac) return

      const ensured = await ensurePendingFromTurn({
        reply: result.reply,
        actions: result.actions,
        userMessage: message,
        notes,
        pending,
        rejectedNames: excluded,
      })
      if (abortRef.current !== ac) return

      notes = ensured.notes
      pending = ensured.pending
      const displayReply = ensured.reply
      setActionNotes(
        notes.length
          ? notes
          : pending.length
            ? []
            : ['没有拿到新的地点推荐，请再说一下你想要的风格或区域。'],
      )
      setPendingPlaces((prev) => {
        const rest = prev.filter((p) => p.id !== rejected.id)
        return pending.length ? [...rest, ...pending] : rest
      })
      if (pending.length) {
        setConfirmEpoch((e) => e + 1)
        setOpen(false)
      } else {
        setOpen(true)
      }
      persistWorkOnLastAssistant(
        workStepsRef.current,
        reasoningTextRef.current,
        displayReply,
      )
    } catch (err) {
      if (isAbortError(err) || abortRef.current !== ac) return
      setPendingPlaces((prev) =>
        prev.map((p) => (p.id === rejected.id ? { ...p, status: 'ready' } : p)),
      )
      setHistory((prev) => {
        const last = prev[prev.length - 1]
        if (last?.role === 'assistant' && last.content.trim()) {
          return [
            ...prev.slice(0, -1),
            {
              ...last,
              content: `${last.content.trim()}\n\n（重新推荐中断：${
                err instanceof Error ? err.message : '请稍后再试'
              }）`,
            },
          ]
        }
        return prev.filter((t, i) => !(i === prev.length - 1 && t.role === 'assistant' && !t.content))
      })
      setError(err instanceof Error ? err.message : '重新推荐失败，请稍后再试。')
      setOpen(true)
      clearWorkPipeline()
    } finally {
      if (abortRef.current === ac) {
        abortRef.current = null
        setBusy(false)
        setStreamingReply(false)
        setBusyUserText('')
        setConfirmBusy(false)
      }
    }
  }

  async function applyActions(
    actions: TripChatAction[],
    options?: {
      rejectedNames?: string[]
      userMessage?: string
      onProgress?: (
        phase: 'resolvePlaces' | 'apply',
        detail?: { pending?: boolean; label?: string },
      ) => void
    },
  ): Promise<{ notes: string[]; pending: PendingPlaceConfirm[] }> {
    const notes: string[] = []
    const pendingBatch: PendingPlaceConfirm[] = []
    const rejectedNames = options?.rejectedNames
    const userMessage = options?.userMessage || ''
    const replaceIntent = Boolean(userMessage) && isReplacePlaceIntent(userMessage)
    let workingDays = days.map((d) => ({ ...d, stops: [...d.stops] }))
    let workingCandidates = [...hotelCandidates]
    let workingHotel = hotel
    let activeDay = currentDay
    const needLookup = actionsNeedPlaceLookup(actions)
    if (needLookup) {
      const names = actions
        .flatMap((action) => {
          if (action.type === 'add_place') return [action.placeName]
          if (action.type === 'replace_place') return [action.toPlaceName]
          if (action.type === 'add_hotel') return [action.hotelName]
          if (action.type === 'replace_hotel') return action.toHotelName ? [action.toHotelName] : []
          return []
        })
        .filter(Boolean)
      const compactNames = [...new Set(names)].slice(0, 2).join('、')
      options?.onProgress?.('resolvePlaces', {
        label: compactNames
          ? `正在核对地点：${compactNames}`
          : CHAT_WORK_STEP_LABELS.resolvePlaces,
      })
    } else {
      options?.onProgress?.('apply', { pending: false })
    }

    for (let i = 0; i < actions.length; i++) {
      const action = actions[i]
      try {
        if (action.type === 'switch_day') {
          activeDay = action.day
          handlers.switchDay(action.day)
          notes.push(`已切换到第 ${action.day} 天`)
          continue
        }

        if (action.type === 'select_place') {
          const day = workingDays.find((d) => d.day === activeDay) || workingDays[0]
          const hit = matchPlaceInDay(day, customPlaces, action.placeName)
          if (!hit) {
            notes.push(
              `当前第 ${activeDay} 天没有「${action.placeName}」。若要改其它天，请明确说「第N天」。`,
            )
            continue
          }
          handlers.selectPlace(hit.placeId)
          notes.push(`已选中「${hit.place.name}」`)
          continue
        }

        if (action.type === 'remove_place') {
          const dayNum = action.day || activeDay
          const next = actions[i + 1]
          // Coalesce remove+add into replace. Explicit add → apply now; recommend → confirm.
          if (
            next?.type === 'add_place' &&
            (next.day || activeDay) === dayNum
          ) {
            const result = await resolveReplacePlace(
              {
                type: 'replace_place',
                day: dayNum,
                fromPlaceName: action.placeName,
                toPlaceName: next.placeName,
                placeType: next.placeType,
                note: next.note,
                source: next.source === 'explicit' ? 'explicit' : 'recommend',
              },
              workingDays,
              activeDay,
              rejectedNames,
              userMessage,
            )
            if (result.nextDays) workingDays = result.nextDays
            if (result.pending) pendingBatch.push(result.pending)
            notes.push(result.note)
            i += 1
            continue
          }

          const day = workingDays.find((d) => d.day === dayNum)
          if (!day) {
            notes.push(`没有第 ${dayNum} 天`)
            continue
          }
          const hit = matchPlaceInDay(day, customPlaces, action.placeName)
          if (!hit) {
            notes.push(`第 ${dayNum} 天没有「${action.placeName}」`)
            continue
          }
          handlers.removeStop(dayNum, hit.stopId)
          workingDays = workingDays.map((d) =>
            d.day === dayNum
              ? { ...d, stops: d.stops.filter((_, stopIdx) => stopIdx !== hit.stopIndex) }
              : d,
          )
          notes.push(`已从第 ${dayNum} 天移除「${hit.place.name}」`)
          continue
        }

        if (action.type === 'replace_place') {
          const result = await resolveReplacePlace(
            action,
            workingDays,
            activeDay,
            rejectedNames,
            userMessage,
          )
          if (result.nextDays) workingDays = result.nextDays
          if (result.pending) pendingBatch.push(result.pending)
          notes.push(result.note)
          continue
        }

        if (action.type === 'reorder_place') {
          const dayNum = action.day || activeDay
          const day = workingDays.find((d) => d.day === dayNum)
          if (!day) {
            notes.push(`没有第 ${dayNum} 天`)
            continue
          }
          const hit = matchPlaceInDay(day, customPlaces, action.placeName)
          if (!hit) {
            notes.push(`第 ${dayNum} 天没有「${action.placeName}」`)
            continue
          }
          const to = Math.min(action.toIndex, Math.max(0, day.stops.length - 1))
          handlers.reorderStop(dayNum, hit.stopIndex, to)
          notes.push(`已将「${hit.place.name}」调整到第 ${dayNum} 天第 ${to + 1} 位`)
          continue
        }

        if (action.type === 'add_place') {
          const dayNum = action.day || activeDay
          // 「换一家」often arrives as add_place — coerce to in-place replace.
          if (replaceIntent) {
            const day = workingDays.find((d) => d.day === dayNum)
            const target = day
              ? findReplaceTargetInDay(day, customPlaces, {
                  placeType: action.placeType,
                  userMessage,
                  excludePlaceName: action.placeName,
                })
              : null
            if (target) {
              const result = await resolveReplacePlace(
                {
                  type: 'replace_place',
                  day: dayNum,
                  fromPlaceName: target.place.name,
                  toPlaceName: action.placeName,
                  placeType: action.placeType || target.place.type,
                  note: action.note,
                  source: action.source === 'explicit' ? 'explicit' : 'recommend',
                },
                workingDays,
                activeDay,
                rejectedNames,
                userMessage,
              )
              if (result.nextDays) workingDays = result.nextDays
              if (result.pending) pendingBatch.push(result.pending)
              notes.push(result.note)
              continue
            }
          }

          const result = await resolveAddPlace(
            {
              ...action,
              day: dayNum,
            },
            rejectedNames,
          )
          if (result.appliedPlace) {
            // Keep a rough local snapshot so later actions in this batch can match.
            workingDays = workingDays.map((d) =>
              d.day === dayNum
                ? {
                    ...d,
                    stops: [
                      ...d.stops,
                      {
                        id: `d${dayNum}-${result.appliedPlace!.id}-${d.stops.length}`,
                        time: '12:00',
                        placeId: result.appliedPlace!.id,
                        note: result.appliedPlace!.description,
                        walkLevel: '短步行',
                        duration: result.appliedPlace!.durationHint || '60 分钟',
                      },
                    ],
                  }
                : d,
            )
          }
          if (result.pending) pendingBatch.push(result.pending)
          notes.push(result.note)
          continue
        }

        if (action.type === 'select_hotel') {
          const hit = matchHotelCandidate(workingCandidates, action.hotelName)
          if (!hit) {
            notes.push(`候选项里没有「${action.hotelName}」，可让我用 add_hotel 添加`)
            continue
          }
          const selectedHotel = candidateToSelected(hit)
          handlers.setHotel(selectedHotel)
          persistHotelState(workingCandidates, selectedHotel)
          workingHotel = selectedHotel
          notes.push(`已将住宿切换为「${hit.name}」`)
          continue
        }

        if (action.type === 'add_hotel') {
          const result = await resolveAddHotel(action, workingCandidates, workingHotel)
          workingCandidates = result.candidates
          workingHotel = result.hotel
          notes.push(result.note)
          continue
        }

        if (action.type === 'remove_hotel') {
          const hit = matchHotelCandidate(workingCandidates, action.hotelName)
          if (!hit) {
            notes.push(`候选项里没有「${action.hotelName}」`)
            continue
          }
          if (workingCandidates.length <= 1) {
            notes.push('至少保留一家酒店候选项')
            continue
          }
          const next = workingCandidates.filter((h) => h.id !== hit.id)
          handlers.setHotelCandidates(next)
          workingCandidates = next
          if (workingHotel.id === hit.id) {
            const fallback = next.find((h) => h.isBest) || next[0]
            const selectedHotel = candidateToSelected(fallback)
            handlers.setHotel(selectedHotel)
            persistHotelState(next, selectedHotel)
            workingHotel = selectedHotel
            notes.push(`已移除「${hit.name}」，并改选「${fallback.name}」`)
          } else {
            persistHotelState(next, workingHotel)
            notes.push(`已从候选项移除「${hit.name}」`)
          }
          continue
        }

        if (action.type === 'refresh_hotels') {
          const result = await refreshHotelCandidates({
            current: workingCandidates,
            preferences: action.preferences,
            keepCustom: action.keepCustom,
          })
          handlers.setHotelCandidates(result.candidates)
          handlers.setHotel(result.selected)
          workingCandidates = result.candidates
          workingHotel = result.selected
          notes.push(
            action.preferences?.trim()
              ? `已按「${action.preferences.trim()}」重新推荐 ${result.candidates.filter((c) => c.source === 'llm').length} 家酒店，并选中「${result.selected.name}」`
              : `已重新推荐一批酒店，并选中「${result.selected.name}」`,
          )
          continue
        }

        if (action.type === 'replace_hotel') {
          const from = matchHotelCandidate(workingCandidates, action.fromHotelName)
          if (!from) {
            notes.push(`候选项里没有「${action.fromHotelName}」`)
            continue
          }
          const result = await replaceOneHotelCandidate({
            current: workingCandidates,
            selected: workingHotel,
            from,
            toHotelName: action.toHotelName,
            preferences: action.preferences,
            select: action.select,
          })
          handlers.setHotelCandidates(result.candidates)
          handlers.setHotel(result.selected)
          workingCandidates = result.candidates
          workingHotel = result.selected
          notes.push(result.note)
          continue
        }

        if (action.type === 'replace_hotels') {
          const fromHotels: HotelCandidate[] = []
          for (const name of action.fromHotelNames) {
            const hit = matchHotelCandidate(workingCandidates, name)
            if (!hit) {
              notes.push(`候选项里没有「${name}」`)
              continue
            }
            if (!fromHotels.some((h) => h.id === hit.id)) fromHotels.push(hit)
          }
          if (!fromHotels.length) continue
          const result = await replaceHotelCandidates({
            current: workingCandidates,
            selected: workingHotel,
            fromHotels,
            preferences: action.preferences,
          })
          handlers.setHotelCandidates(result.candidates)
          handlers.setHotel(result.selected)
          workingCandidates = result.candidates
          workingHotel = result.selected
          notes.push(result.note)
        }
      } catch (err) {
        notes.push(err instanceof Error ? err.message : '操作失败')
      }
    }

    if (needLookup || pendingBatch.length || notes.length) {
      options?.onProgress?.('apply', { pending: pendingBatch.length > 0 })
    }

    return { notes, pending: pendingBatch }
  }

  async function submit(text: string) {
    const message = text.trim()
    if (!message || busy) return
    if (!isLlmConfigured()) {
      setError('对话助手暂不可用，请稍后再试。')
      return
    }

    setBusy(true)
    setStreamingReply(false)
    setError(null)
    setActionNotes([])
    // New user turn supersedes any lingering recommend-confirm sheet.
    setPendingPlaces([])
    setBusyUserText(message)
    beginWorkPipeline(message)
    setInput('')
    setHistory((prev) => [
      ...prev,
      { role: 'user', content: message },
      { role: 'assistant', content: '' },
    ])
    const ac = beginChatRequest()
    try {
      const result = await sendTripChatMessageStream({
        ctx: buildChatContext(),
        history,
        userMessage: message,
        signal: ac.signal,
        onRequestPlan: (phase, plan) => {
          if (abortRef.current !== ac || phase !== 'done' || !plan) return
          setRequestThinkingEnabled(plan.thinking.enabled)
          setShowReasoningUi(plan.thinking.enabled)
          setWorkSteps((prev) => {
            const relabeled = prev.map((step) => {
              if (step.id === 'preprocessPlan') {
                return { ...step, label: requestPlanStepLabel(plan) }
              }
              if (step.id === 'preprocessFallback') {
                return plan.source === 'fallback'
                  ? { ...step, status: 'done' as const }
                  : { ...step, status: 'skipped' as const }
              }
              return step
            })

            // Planning must finish before search/generation can begin.
            if (plan.needsWeb) {
              return activateChatWorkStep(relabeled, 'webSearch', {
                labels: {
                  webSearch: searchStepLabel(undefined, message),
                },
              })
            }

            return activateChatWorkStep(relabeled, 'generate')
          })
        },
        onWebSearch: (phase, detail) => {
          if (abortRef.current !== ac) return
          if (phase === 'start') {
            setWorkSteps((prev) =>
              activateChatWorkStep(prev, 'webSearch', {
                labels: {
                  webSearch: searchStepLabel(detail, message),
                },
              }),
            )
            return
          }
          if (phase === 'done') {
            setWorkSteps((prev) => activateChatWorkStep(prev, 'generate'))
            return
          }
          if (phase === 'skip') {
            setWorkSteps((prev) => {
              const next = prev.map((s) =>
                s.id === 'webSearch' ? { ...s, status: 'skipped' as const } : s,
              )
              return activateChatWorkStep(next, 'generate')
            })
          }
        },
        onReplyDelta: (reply) => {
          setStreamingReply(true)
          setWorkSteps((prev) => activateChatWorkStep(prev, 'generate'))
          updateLastAssistantContent(reply)
        },
        onReasoningDelta: (_delta, full) => {
          if (!resolveThinkingForTask(getThinkingMode(), message, "tripChat").enabled) return
          setShowReasoningUi(true)
          setReasoningText(full)
        },
      })
      if (abortRef.current !== ac) return
      setStreamingReply(false)
      setWorkSteps((prev) => activateChatWorkStep(prev, 'parse'))

      let notes: string[] = []
      let pending: PendingPlaceConfirm[] = []
      if (result.actions.length) {
        const applied = await applyActions(result.actions, {
          userMessage: message,
          onProgress: (phase, detail) => {
            if (phase === 'resolvePlaces') {
              setWorkSteps((prev) =>
                activateChatWorkStep(
                  prev.map((s) =>
                    s.id === 'apply'
                      ? { ...s, status: 'pending' as const, label: '打开确认页…' }
                      : s,
                  ),
                  'resolvePlaces',
                  {
                    labels: {
                      resolvePlaces: detail?.label || CHAT_WORK_STEP_LABELS.resolvePlaces,
                    },
                  },
                ),
              )
              return
            }
            setWorkSteps((prev) =>
              activateChatWorkStep(prev, 'apply', {
                labels: {
                  apply: detail?.pending ? '打开确认页…' : '应用改动…',
                },
              }),
            )
          },
        })
        notes = applied.notes
        pending = applied.pending
      } else if (replyClaimsItineraryApplied(result.reply)) {
        notes = [NO_ACTION_APPLIED_NOTE]
      }

      // Guard again after long applyActions (Google Places) in case a newer turn started.
      if (abortRef.current !== ac) return

      const ensured = await ensurePendingFromTurn({
        reply: result.reply,
        actions: result.actions,
        userMessage: message,
        notes,
        pending,
      })
      if (abortRef.current !== ac) return

      setActionNotes(ensured.notes)
      enqueuePendingPlaces(ensured.pending)
      persistWorkOnLastAssistant(
        workStepsRef.current,
        reasoningTextRef.current,
        ensured.reply,
      )
    } catch (err) {
      if (isAbortError(err) || abortRef.current !== ac) return
      setHistory((prev) => {
        const last = prev[prev.length - 1]
        if (last?.role === 'assistant' && last.content.trim()) {
          return [
            ...prev.slice(0, -1),
            {
              ...last,
              content: `${last.content.trim()}\n\n（回答中断：${
                err instanceof Error ? err.message : '请稍后再试'
              }）`,
            },
          ]
        }
        // Drop empty assistant placeholder when nothing streamed.
        return prev.filter((t, i) => !(i === prev.length - 1 && t.role === 'assistant' && !t.content))
      })
      setError(friendlyChatError(err))
      clearWorkPipeline()
    } finally {
      if (abortRef.current === ac) {
        abortRef.current = null
        setBusy(false)
        setStreamingReply(false)
        setBusyUserText('')
      }
    }
  }

  const chatChrome = (
    <>
      {/* LlmModelPicker stays anchored at the FAB position; hidden when the
          chat panel is open so the morphing card can take over the corner.
          Mobile: stacked above the chat button (column, 8px gap → bottom
          offset = 48px button + 8px gap = 56px = 3.5rem). */}
      <div
        data-trip-chat-fab="1"
        className={`fixed bottom-[calc(max(1.15rem,env(safe-area-inset-bottom))+8.35rem)] right-[max(1.25rem,env(safe-area-inset-right))] z-[2050] flex flex-col items-end gap-2 transition-opacity duration-200 sm:bottom-5 sm:right-[calc(max(1.25rem,env(safe-area-inset-right))+3.625rem)] sm:flex-row sm:items-center sm:gap-2.5 ${
          modelPickerVisible && !open
            ? 'visible opacity-100'
            : 'pointer-events-none invisible opacity-0'
        }`}
      >
        <LlmModelPicker />
      </div>

      <AnimatePresence>
        {open && (
          <motion.button
            key="trip-chat-backdrop"
            type="button"
            aria-label="关闭行程助手"
            initial={backdrop.initial}
            animate={backdrop.animate}
            exit={backdrop.exit}
            transition={backdrop.transition}
            className={`fixed inset-0 sm:hidden ${glassBackdropSurfaceClass}`}
            style={{ zIndex: TRIP_CHAT_BACKDROP_Z }}
            onClick={() => setOpen(false)}
          />
        )}
      </AnimatePresence>

      {/*
        The chat panel is a single element that morphs from a 48x48 black
        FAB into a 380x560 floating card (clamped to viewport − 2.5rem
        on narrow screens so it doesn't run off the left edge). Staged so:
        - opening: width 48→380 first, then height 48→560
        - closing: height 560→48 first, then width 380→48
        Background + icon fade happen during the first stage; panel
        content fades in during the second stage.
      */}
      <motion.div
        ref={rootRef}
        role={open ? 'dialog' : 'button'}
        tabIndex={open ? -1 : 0}
        aria-label={open ? '行程助手' : '打开行程助手'}
        aria-expanded={open}
        onClick={open ? undefined : () => setOpen(true)}
        onKeyDown={
          open
            ? undefined
            : (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  setOpen(true)
                }
              }
        }
        whileTap={open ? undefined : { scale: 0.94 }}
        initial={false}
        animate={{
          width: open ? TRIP_CHAT_PANEL_WIDTH : 48,
          height: open ? 560 : 48,
          backgroundColor: open ? 'rgba(255, 255, 255, 0.85)' : 'rgba(255, 255, 255, 0.75)',
        }}
        transition={{
          width: { ...morphSpring, delay: open ? 0 : 0.18 },
          height: { ...morphSpring, delay: open ? 0.18 : 0 },
          backgroundColor: { duration: 0.18, ease: 'easeOut' },
        }}
        onUpdate={(latest) => {
          const height = Number(latest.height)
          if (
            !chatOpenRef.current &&
            !modelPickerVisibleRef.current &&
            Number.isFinite(height) &&
            Math.abs(height - 48) < 0.001
          ) {
            modelPickerVisibleRef.current = true
            setModelPickerVisible(true)
          }
        }}
        onAnimationComplete={() => {
          const currentlyOpen = chatOpenRef.current
          setPanelEntered(currentlyOpen)
          if (!currentlyOpen) {
            modelPickerVisibleRef.current = true
            setModelPickerVisible(true)
          }
        }}
        style={{
          position: 'fixed',
          borderRadius: 24,
          overflow: 'hidden',
          zIndex: TRIP_CHAT_PANEL_Z,
          transformOrigin: 'bottom right',
          maxHeight: 'calc(100vh - max(1.15rem, env(safe-area-inset-bottom)) - 5.5rem)',
          color: 'var(--ink)',
          border: '1px solid rgba(255, 255, 255, 0.9)',
          boxShadow:
            '0 8px 32px rgba(0, 0, 0, 0.08), inset 0 1px 1.5px 0 rgba(255, 255, 255, 1)',
          backdropFilter: 'blur(24px) saturate(180%)',
        }}
        className="fixed flex flex-col bottom-[calc(max(1.15rem,env(safe-area-inset-bottom))+4.85rem)] right-[max(1.25rem,env(safe-area-inset-right))] sm:bottom-5 sm:right-5"
      >
        {/* Icon layer — visible when closed, fades out during the width-grow stage */}
        <motion.div
          initial={false}
          animate={{ opacity: open ? 0 : 1 }}
          transition={{
            opacity: { duration: 0.18, delay: open ? 0 : 0.32, ease: 'easeOut' },
          }}
          aria-hidden={!open}
          className="absolute inset-0 flex items-center justify-center text-[var(--copper)]"
        >
          {/* Top specular reflection arc */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-2 top-0 h-[1.5px] rounded-full bg-gradient-to-r from-transparent via-white to-transparent opacity-95"
          />
          <ChatBubbleIcon className="h-5 w-5 text-[var(--copper)] drop-shadow-[0_1px_2px_rgba(0,0,0,0.06)]" />
        </motion.div>

        {/* Panel content layer — visible when open, fades in during the height-grow stage */}
        <motion.div
          initial={false}
          animate={{ opacity: open ? 1 : 0 }}
          transition={{
            opacity: { duration: 0.2, delay: open ? 0.18 : 0, ease: 'easeOut' },
          }}
          inert={!open || undefined}
          aria-hidden={!open}
          className="absolute inset-0 flex flex-col"
        >
          {/* Top Specular Streaming Reflection Line */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-3 top-0 h-[1.5px] rounded-full bg-gradient-to-r from-transparent via-white to-transparent opacity-95 z-10"
          />

          <div className="border-b border-white/85 px-4 py-3 bg-white/40 backdrop-blur-md">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-display text-xl leading-tight text-[var(--ink)]">行程助手</h3>
                  {/* Model & Thinking Status Capsule */}
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/90 bg-white/80 px-2 py-0.5 text-[11px] font-medium text-[var(--ink)] shadow-2xs backdrop-blur-sm">
                    <ModelBrandIcon
                      deepseek={isDeepSeekModel(model)}
                      className="h-3 w-3 shrink-0 drop-shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                    />
                    <span>{getOpenAIModelShortLabel(model)}</span>
                    {supportsThinkingControls(model) && thinkingMode !== 'off' && (
                      <>
                        <span className="text-zinc-300">·</span>
                        <span className="text-[var(--stone)]">
                          思考{getThinkingModeLabel(thinkingMode)}
                        </span>
                      </>
                    )}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {/* Current Day Capsule */}
                  <span className="inline-flex items-center gap-1 rounded-full border border-[#b5c7ba]/60 bg-[#f4f8f5]/85 px-2 py-0.5 text-[11px] font-medium text-[var(--sage)] shadow-2xs backdrop-blur-sm">
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--sage)]" />
                    第 {currentDay} 天
                  </span>

                  {/* Viewing Place Context Capsule */}
                  {viewing && (
                    <span className="inline-flex max-w-[14rem] items-center gap-1 truncate rounded-full border border-[#d7a98a]/60 bg-[#f6e8de]/85 px-2 py-0.5 text-[11px] font-medium text-[var(--copper)] shadow-2xs backdrop-blur-sm">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--copper)]" />
                      <span className="truncate">正在看「{viewing.name}」</span>
                    </span>
                  )}
                </div>
              </div>
              <CloseIconButton
                onClick={() => setOpen(false)}
                aria-label="关闭助手"
              />
            </div>
          </div>

          {/* overflow-y-hidden during the opening morph — the inner column
              hasn't grown to its final height yet, and `auto` would briefly
              show a scrollbar as the panel expands. `panelEntered` flips
              true when the height animation settles, after which we want
              scrolling for long chat histories. */}
          <div className={`min-h-0 flex-1 space-y-3 ${panelEntered ? 'overflow-y-auto' : 'overflow-y-hidden'} overscroll-contain px-3.5 py-3`}>
            {!history.some((t) => !t.hidden) && (
              <div className="space-y-2.5">
                <p className="text-xs font-medium text-[var(--stone)]">
                  试试问我：介绍酒店、换一批住宿、介绍今天地点、加咖啡馆，或删改行程。
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {SUGGESTIONS.map(({ text, tone }) => (
                    <button
                      key={text}
                      type="button"
                      disabled={busy}
                      onClick={() => void submit(text)}
                      className={`${glassCapsuleSurfaceClass} ${glassCapsuleToneClass[tone]} inline-flex items-center px-3 py-1.5 text-left text-xs font-medium text-[var(--ink)] transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 cursor-pointer`}
                    >
                      {text}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {history
              .filter((t) => !t.hidden)
              .map((turn, i, visible) => {
                const isLastVisible = i === visible.length - 1
                const isStreamingAssistant =
                  busy &&
                  turn.role === 'assistant' &&
                  isLastVisible
                const showLiveSteps =
                  isStreamingAssistant && workSteps.length > 0
                const showStoredSteps =
                  turn.role === 'assistant' &&
                  !showLiveSteps &&
                  Boolean(turn.steps?.length)
                const showLiveReasoning =
                  isStreamingAssistant &&
                  showReasoningUi &&
                  Boolean(reasoningText.trim())
                const showStoredReasoning =
                  turn.role === 'assistant' &&
                  !showLiveReasoning &&
                  Boolean(turn.reasoning?.trim())
                const showThinking =
                  isStreamingAssistant &&
                  !turn.content &&
                  !streamingReply &&
                  !showLiveSteps
                const showAnswerBubble =
                  turn.role === 'user' ||
                  Boolean(turn.content) ||
                  streamingReply ||
                  showThinking
                return (
                  <div
                    key={`${turn.role}-${i}`}
                    className={`max-w-[92%] ${turn.role === 'user' ? 'ml-auto' : ''}`}
                  >
                    {showLiveSteps ? (
                      <div className="px-1">
                        <ChatWorkStepsPanel
                          steps={workSteps}
                          open={workStepsOpen}
                          onToggle={() => setWorkStepsOpen((v) => !v)}
                        />
                      </div>
                    ) : showStoredSteps ? (
                      <div className="px-1">
                        <StoredChatWorkStepsPanel steps={turn.steps!} />
                      </div>
                    ) : null}
                    {showLiveReasoning ? (
                      <div className="px-1">
                        <ChatReasoningDisclosure
                          text={reasoningText}
                          open={reasoningOpen}
                          onToggle={() => setReasoningOpen((v) => !v)}
                        />
                      </div>
                    ) : showStoredReasoning ? (
                      <div className="px-1">
                        <StoredChatReasoningDisclosure text={turn.reasoning!} />
                      </div>
                    ) : null}
                    {showAnswerBubble ? (
                      <div
                        className={`px-3.5 py-2 text-sm leading-relaxed ${
                          turn.role === 'user'
                            ? 'rounded-2xl rounded-tr-xs border border-white/12 bg-[var(--ink)]/95 text-[var(--paper)] shadow-[0_3px_12px_rgba(35,42,38,0.18),inset_0_1px_1.5px_rgba(255,255,255,0.22),inset_0_-1px_1px_rgba(0,0,0,0.3)] backdrop-blur-sm'
                            : 'rounded-2xl rounded-tl-xs border border-white/90 bg-white/80 shadow-[0_2px_12px_rgba(0,0,0,0.04),inset_0_1px_1.5px_rgba(255,255,255,1)] backdrop-blur-md text-[var(--ink)]'
                        }`}
                      >
                        {showThinking ? (
                          <LoadingIndicator
                            thinkingLabel="助手思考中…"
                            generatingLabel="助手回答中…"
                            showDots
                            size="sm"
                            mode="thinking"
                            task="tripChat"
                            userText={busyUserText}
                          />
                        ) : (
                          <>
                            <InlineMarkdown
                              text={turn.content}
                              className="space-y-1.5 leading-relaxed [&_p]:m-0 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 [&_code]:rounded [&_code]:bg-black/5 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.9em] [&_hr]:my-2 [&_hr]:border-[var(--mist)]"
                            />
                            {isStreamingAssistant && streamingReply ? (
                              <span
                                className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[0.1em] animate-pulse bg-[var(--sage)] align-text-bottom"
                                aria-hidden
                              />
                            ) : null}
                          </>
                        )}
                      </div>
                    ) : null}
                  </div>
                )
              })}

            {!!actionNotes.length && (
              <ul className="space-y-1 rounded-2xl border border-[var(--sage)]/30 bg-[var(--sage)]/12 px-3.5 py-2.5 text-xs text-[var(--sage)] shadow-2xs backdrop-blur-sm">
                {actionNotes.map((n) => (
                  <li key={n}>· {n}</li>
                ))}
              </ul>
            )}

            {error && (
              <div className="flex items-start gap-2 rounded-2xl border border-red-200/80 bg-red-50/80 p-3 text-xs leading-relaxed text-red-900 shadow-2xs backdrop-blur-md">
                <span className="shrink-0 mt-0.5 inline-block h-1.5 w-1.5 rounded-full bg-red-500" />
                <p className="min-w-0 flex-1">{error}</p>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <form
            className="relative flex items-center gap-2 border-t border-white/85 bg-white/50 p-3 backdrop-blur-md before:pointer-events-none before:absolute before:inset-x-3 before:top-0 before:h-[1.5px] before:rounded-full before:bg-gradient-to-r before:from-transparent before:via-white before:to-transparent before:opacity-95"
            onSubmit={(e) => {
              e.preventDefault()
              void submit(input)
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="跟我说你想怎么改行程…"
              disabled={busy || !open}
              tabIndex={open ? undefined : -1}
              aria-busy={busy || undefined}
              enterKeyHint="send"
              autoComplete="off"
              className="min-w-0 flex-1 rounded-full border border-white/90 bg-white/85 px-4 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--stone)]/65 shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.04),inset_0_-1px_1px_rgba(255,255,255,0.8),0_2px_6px_rgba(0,0,0,0.02)] backdrop-blur-md outline-none transition-all focus:border-[var(--copper)]/70 focus:bg-white focus:shadow-[0_0_0_2.5px_rgba(181,106,60,0.14),inset_0_1px_2px_rgba(0,0,0,0.02)] disabled:bg-white/60 disabled:text-[var(--stone)]/60"
            />
            {busy ? (
              <div
                role="status"
                aria-live="polite"
                className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border border-white/18 bg-[var(--ink)]/95 px-3.5 py-2 text-xs font-medium text-white shadow-[0_3px_12px_rgba(35,42,38,0.22),inset_0_1px_1.5px_rgba(255,255,255,0.25),inset_0_-1px_1px_rgba(0,0,0,0.35)] backdrop-blur-md select-none"
              >
                <ButtonSpinner
                  mode="thinking"
                  task="tripChat"
                  userText={busyUserText || input}
                  thinkingEnabled={requestThinkingEnabled}
                />
                <span className="tracking-wide">
                  {chatBusy.label({ thinking: '思考中…', generating: '回答中…' })}
                </span>
              </div>
            ) : (
              <button
                type="submit"
                disabled={!input.trim() || !open}
                tabIndex={open ? undefined : -1}
                className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition-all duration-200 ${
                  input.trim() && open
                    ? 'border border-white/20 bg-[var(--ink)] text-white shadow-[0_4px_14px_rgba(35,42,38,0.25),inset_0_1px_1.5px_rgba(255,255,255,0.3),inset_0_-1px_1px_rgba(0,0,0,0.4)] backdrop-blur-md hover:bg-black hover:scale-[1.03] hover:shadow-[0_6px_18px_rgba(35,42,38,0.32)] active:scale-95 cursor-pointer'
                    : 'border border-black/[0.08] bg-black/[0.07] text-[var(--stone)] shadow-[inset_0_1px_1.5px_rgba(0,0,0,0.04),inset_0_-1px_1px_rgba(255,255,255,0.6)] backdrop-blur-sm cursor-not-allowed pointer-events-none select-none'
                }`}
              >
                发送
              </button>
            )}
          </form>
        </motion.div>
      </motion.div>
    </>
  )

  return (
    <>
      {createPortal(chatChrome, document.body)}
      <GooglePlacePage
        key={`${activePending?.id || 'pending-place'}-${confirmEpoch}`}
        open={Boolean(activePending)}
        name={activePending?.place.name || ''}
        nameLocal={activePending?.place.nameLocal}
        googlePlaceId={activePending?.place.googlePlaceId}
        googleRating={activePending?.place.googleRating}
        googleRatingCount={activePending?.place.googleUserRatingCount}
        googleAddress={activePending?.place.googleAddress}
        googleRatingHint={activePending?.place.ratingHint}
        location={activePending?.place.location}
        placeType={activePending?.place.type}
        fallbackImage={activePending?.place.image}
        showMap={false}
        overlayClassName="z-[2300]"
        overlayZIndex={2500}
        closeOnBackdrop={activePending?.status !== 'rerecommending'}
        onAdvisorFacts={(next) => {
          setAdvisorFactsPendingId(activePending?.id || null)
          setAdvisorFacts(next)
        }}
        llmNarrative={
          activePending
            ? {
                intro:
                  pendingStory?.intro ||
                  (!pendingStoryLoading
                    ? activePending.place.description || undefined
                    : undefined),
                reason:
                  pendingStory?.reason ||
                  (!pendingStoryLoading
                    ? pendingFallbackReason(activePending)
                    : undefined),
                loading: pendingStoryLoading,
                labels: PENDING_PLACE_LABELS,
                onRegenerate: isLlmConfigured()
                  ? () => setPendingStoryRegenToken((n) => n + 1)
                  : undefined,
                regenerating: pendingStoryLoading && pendingStoryRegenToken > 0,
              }
            : null
        }
        footer={
          activePending ? (
            <div className="space-y-2">
              {activePending.status === 'rerecommending' ? (
                <div className="rounded-xl bg-white/80 px-3 py-2">
                  <LoadingIndicator
                    thinkingLabel="正在重新思考推荐…"
                    generatingLabel="正在重新推荐…"
                    showDots
                    size="sm"
                    mode="thinking"
                    task="placeRecommend"
                  />
                </div>
              ) : (
                <>
                  <p className="text-sm text-[var(--stone)]">
                    {activePending.kind === 'replace'
                      ? `确认用「${activePending.place.name}」替换「${activePending.fromPlaceName}」吗？`
                      : `确认将「${activePending.place.name}」加入第 ${activePending.dayNum} 天吗？`}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={confirmBusy}
                      onClick={() => confirmPending(activePending)}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[var(--sage)] px-3 py-2.5 text-sm text-white disabled:opacity-50"
                    >
                      {confirmBusy && <ButtonSpinner />}
                      {activePending.kind === 'replace' ? '确认替换' : '加入行程'}
                    </button>
                    <button
                      type="button"
                      disabled={confirmBusy || busy}
                      onClick={() => void rerecommendPending(activePending)}
                      className="rounded-xl border border-[var(--stone)]/30 px-3 py-2.5 text-sm text-[var(--stone)] disabled:opacity-50"
                    >
                      返回重新推荐
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : null
        }
        onClose={() => {
          if (activePending) cancelPending(activePending)
        }}
      />
    </>
  )
}
