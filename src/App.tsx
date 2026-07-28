import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from './auth/AuthProvider'
import { DayTimeline } from './components/DayTimeline'
import {
  FlightPanel,
  areFlightsComplete,
  type FlightSelection,
} from './components/FlightPanel'
import { HotelPicker } from './components/HotelPicker'
import { LoadingIndicator } from './components/LoadingIndicator'
import { CloudSaveIndicator } from './components/CloudSaveIndicator'
import { PlacePanel } from './components/PlacePanel'
import { ShareDialog } from './components/ShareDialog'
import { TripChatPanel } from './components/TripChatPanel'
import { TripDatesPanel } from './components/TripDatesPanel'
import { TripMap } from './components/TripMap'
import {
  PENDING_HOTEL,
  inferParisAreaLabel,
  isHotelSelected,
  isPlaceholderHotelArea,
} from './data/hotels'
import { getPlace } from './data/places'
import { clearDayNavCache, useDayNav } from './hooks/useDayNav'
import { clearAllFlightCache } from './services/flightCache'
import {
  clearFlightSelection,
  loadFlightSelection,
} from './services/flightSelection'
import { clearHotelCache, loadHotelCache } from './services/hotelCache'
import { clearLlmMemo } from './services/llmMemo'
import { clearAllRecommendCache } from './services/recommendCache'
import {
  buildGeneratedItinerary,
  buildGeneratedSingleDay,
  flightContextBrief,
} from './services/itineraryGenerate'
import {
  generateDayCopy,
  isLlmConfigured,
  resolveItineraryStart,
  type ItineraryStartResult,
} from './services/llm'
import {
  clampIsoDate,
  dateForTripDay,
  daysBetween,
  formatDayNightLabel,
  formatTripDayLabel,
  itineraryDayCount,
  loadTripDates,
  saveTripDates,
  type TripDateRange,
} from './services/tripDates'
import type { DayPlan, HotelCandidate, ItineraryStop, Place, SelectedHotel } from './types'
import {
  getDayOrigin,
  placeFromHotel,
  SELECTED_HOTEL_PLACE_ID,
} from './utils/dayOrigin'
import {
  applyDay1HotelArrivalTimes,
  computeDay1HotelArrivalHm,
  recomputeDayStopTimes,
} from './utils/stopTimes'
import {
  blankDay,
  buildItineraryFingerprint,
  clearItineraryState,
  ensureBaselineFromGenerated,
  findBestInsertIndex,
  fingerprintTripInputsEqual,
  fingerprintsEqual,
  hasBaselineDay,
  hasMatchingBaseline,
  hasUsableGeneratedItinerary,
  isPinnedHotelStop,
  keepFixedHotelPositions,
  loadItineraryState,
  makeStopId,
  reorderStops,
  resizeItineraryToLength,
  restoreDayFromBaseline,
  restoreFullFromBaseline,
  saveBaselineItinerary,
  saveItineraryState,
  wipeGeneratedItinerary,
  type ItineraryInputFingerprint,
} from './utils/itineraryState'
import { flushTripCloudSave } from './services/tripCloud'

const ITINERARY_LOADING_LINES = [
  '正在让大模型把巴黎掰成日历块…咖啡因与地铁图同步加载中。',
  '按航班、酒店与「想睡到自然醒」三条戒律排日程，请稍候。',
  '迪士尼已预留倒数第二天席位，其余天正在顺路拼图…',
  '拒绝 7 点观光闹钟——行程约 10 点开场，生成中。',
  '香榭丽舍与凯旋门已列入必去清单，正在找顺路的好日子…',
  '地铁换乘尽量少、步行尽量短：正在给景点做片区拼图。',
  '正餐两顿、咖啡馆开场——胃口与行程表同时对齐中。',
  '戴高乐的时差还在谈判，抵达日会轻一点，别急。',
  '卢浮宫与凡尔赛今日请假；我们挑更顺路的巴黎。',
  'RER A 已在脑内预演：乐园日只留迪士尼，其他景点靠边站。',
  '正在把「想去」压成「走得动」——巴黎很大，腿只有两条。',
  '酒店作原点、末站回家睡觉：日程像回力镖一样收束中。',
]

const ITINERARY_LOADING_ROTATE_MS = 3200

/** Stable fallback when `days` is empty — avoid `blankDay(1)` per render (breaks useDayNav deps). */
const EMPTY_DAY_FALLBACK = blankDay(1)

function ensureStopId(day: number, stop: ItineraryStop, index: number): string {
  return stop.id || `d${day}-${stop.placeId}-${index}`
}

const AREA_KEY_CN: Record<string, string> = {
  marais: '玛黑',
  opera: '歌剧院一带',
  boulevards: '大林荫道',
  saintGermain: '圣日耳曼',
  latin: '拉丁区',
  trocadero: '16区特罗卡德罗',
}

/** Aliases that may appear in LLM day theme/summary as the hotel base. */
const AREA_LABEL_ALIASES: Record<string, string[]> = {
  marais: ['玛黑'],
  opera: ['歌剧院一带', '歌剧院', '欧培拉'],
  boulevards: ['大林荫道'],
  saintGermain: ['圣日耳曼', 'Saint-Germain', 'Saint Germain'],
  latin: ['拉丁区'],
  trocadero: ['16区特罗卡德罗', '特罗卡德罗', 'Trocadéro', 'Trocadero'],
}

function areaAliasEntries(): Array<{ key: string; label: string }> {
  const out: Array<{ key: string; label: string }> = []
  for (const [key, aliases] of Object.entries(AREA_LABEL_ALIASES)) {
    for (const label of aliases) out.push({ key, label })
  }
  // Longest first so「16区特罗卡德罗」wins over「特罗卡德罗」.
  out.sort((a, b) => b.label.length - a.label.length)
  return out
}

/** Rewrite hotel-base phrases (落脚点 / 落脚…) that name the wrong district. */
function rewriteHotelBaseAreaMentions(text: string, hotelAreaKey: string): string {
  const correct = AREA_KEY_CN[hotelAreaKey]
  if (!correct || !text) return text

  const wrong = areaAliasEntries().filter((a) => a.key !== hotelAreaKey)
  const mentionsWrong = (chunk: string) => wrong.some((a) => chunk.includes(a.label))
  const mentionsAnyArea = (chunk: string) =>
    areaAliasEntries().some((a) => chunk.includes(a.label))

  let next = text

  next = next.replace(/以([^，。；！？\n]{1,20})为落脚点/g, (full, area: string) =>
    mentionsWrong(area) || mentionsAnyArea(area) ? `以${correct}为落脚点` : full,
  )

  next = next.replace(
    /落脚(?!点)(?:于|在)?([^，。；！？\n的]{1,20})/g,
    (full, area: string) => {
      if (!mentionsWrong(area)) return full
      let replaced = area
      for (const a of wrong) {
        if (replaced.includes(a.label)) replaced = replaced.split(a.label).join(correct)
      }
      return full.replace(area, replaced)
    },
  )

  return next
}

/** Day 1 is hotel-settle day — swap any stale district labels in theme/summary. */
function replaceWrongAreaLabels(text: string, hotelAreaKey: string): string {
  const correct = AREA_KEY_CN[hotelAreaKey]
  if (!correct || !text) return text
  let next = text
  for (const a of areaAliasEntries().filter((x) => x.key !== hotelAreaKey)) {
    if (next.includes(a.label)) next = next.split(a.label).join(correct)
  }
  return next
}

function syncDaysCopyToHotelArea(days: DayPlan[], hotelAreaKey: string): DayPlan[] {
  if (!AREA_KEY_CN[hotelAreaKey]) return days
  let changed = false
  const next = days.map((d) => {
    let theme = rewriteHotelBaseAreaMentions(d.theme, hotelAreaKey)
    let summary = rewriteHotelBaseAreaMentions(d.summary, hotelAreaKey)
    if (d.day === 1) {
      theme = replaceWrongAreaLabels(theme, hotelAreaKey)
      summary = replaceWrongAreaLabels(summary, hotelAreaKey)
    }
    if (theme === d.theme && summary === d.summary) return d
    changed = true
    return { ...d, theme, summary }
  })
  return changed ? next : days
}

function seasonEyebrow(startDate?: string | null, destination?: string): string {
  const dest = destination?.trim()
  if (!startDate) return dest ? `${dest} Escape` : 'Next Escape'
  const month = new Date(`${startDate}T12:00:00`).getMonth() + 1
  if (Number.isNaN(month)) return dest ? `${dest} Escape` : 'Next Escape'
  if (month >= 3 && month <= 5) return 'Spring Escape'
  if (month >= 6 && month <= 8) return 'Summer Escape'
  if (month >= 9 && month <= 11) return 'Autumn Escape'
  return 'Winter Escape'
}

function destinationLabel(destination: string): string {
  return destination.trim() || '目的地'
}

function chineseDayCount(n: number): string {
  const map: Record<number, string> = {
    1: '一',
    2: '二',
    3: '三',
    4: '四',
    5: '五',
    6: '六',
    7: '七',
    8: '八',
    9: '九',
    10: '十',
  }
  if (n >= 1 && n <= 10) return `${map[n]}日`
  return `${n}日`
}

function hotelAreaShort(hotel: SelectedHotel): string | null {
  const fromKey = AREA_KEY_CN[hotel.areaKey]
  if (fromKey) return fromKey
  const label = inferParisAreaLabel(hotel.address, hotel.name, undefined, {
    lat: hotel.lat,
    lng: hotel.lng,
  })
  if (isPlaceholderHotelArea(label) || label === '巴黎市区') return null
  const arr = label.match(/^(\d{1,2}区)/)
  const cn = label.match(/\/\s*([^)]+)\s*\)/)
  if (arr && cn) return `${arr[1]}${cn[1].trim()}`
  if (arr) return arr[1]
  return label
}

function itineraryThemeTags(days: DayPlan[]): string[] {
  const hasDisney = days.some(
    (d) =>
      d.pace === '乐园日' ||
      /迪士尼|disney/i.test(d.title) ||
      /迪士尼|disney/i.test(d.theme),
  )
  const hasDrive = days.some(
    (d) => d.pace === '自驾日' || /自驾/.test(d.title) || /自驾/.test(d.theme),
  )
  const bits: string[] = []
  if (hasDisney) bits.push('一日迪士尼')
  if (hasDrive) bits.push('一日自驾')
  return bits
}

function hasTripDates(tripDates: TripDateRange | null | undefined): boolean {
  return Boolean(tripDates?.startDate && tripDates?.endDate)
}

/** Compact Chinese list of what's still blocking itinerary expand. */
function itineraryMissingLabels(input: {
  datesReady: boolean
  outboundReady: boolean
  returnReady: boolean
  hotelReady: boolean
}): string[] {
  const missing: string[] = []
  if (!input.datesReady) missing.push('日期')
  if (!input.outboundReady) missing.push('去程')
  if (!input.returnReady) missing.push('返程')
  if (!input.hotelReady) missing.push('酒店')
  return missing
}

function buildHeroCopy(
  destination: string,
  tripDates: TripDateRange | null,
  hotel: SelectedHotel,
  days: DayPlan[],
): { eyebrow: string; title: string; blurb: string; tags: string[] } {
  const hotelOn = isHotelSelected(hotel)
  const planDays = Math.max(1, days.length || 1)
  // Header duration = calendar span of selected dates (not itinerary days after flight lag).
  const tripDayCount = tripDates
    ? daysBetween(tripDates.startDate, tripDates.endDate) || planDays
    : planDays
  const durationLabel = chineseDayCount(tripDayCount)
  const dest = destination.trim()
  const destLabel = destinationLabel(destination)
  const area = hotelOn ? hotelAreaShort(hotel) : null
  const hotelPhrase = hotelOn
    ? area
      ? `${area}的${hotel.name}`
      : hotel.name
    : null

  const eyebrow = seasonEyebrow(tripDates?.startDate, dest)
  const title = tripDates
    ? `${dest || '行程'} · ${durationLabel}`
    : dest
      ? `${dest} Tour`
      : '下次去哪儿？'

  const tags: string[] = []
  if (tripDates) {
    tags.push(
      `${formatTripDayLabel(tripDates.startDate)} – ${formatTripDayLabel(tripDates.endDate)}`,
    )
  } else {
    tags.push('日期待定')
  }
  tags.push('市内地铁 + 步行')
  const themes = itineraryThemeTags(days)
  if (themes.length) tags.push(themes.join(' · '))
  if (hotelOn && area) tags.push(`住${area}`)
  else if (hotelOn) tags.push('酒店已定')
  else tags.push('酒店待选')

  let blurb: string
  if (tripDates && hotelPhrase) {
    blurb = dest
      ? `温哥华往返 · 目的地${destLabel}，${formatTripDayLabel(tripDates.startDate)}至${formatTripDayLabel(tripDates.endDate)}，共${durationLabel}，住${hotelPhrase}。闹钟可以偷懒，行程不行——每天先用一杯咖啡谈判，把这座城市慢慢吃干抹净。`
      : `温哥华往返 · ${formatTripDayLabel(tripDates.startDate)}至${formatTripDayLabel(tripDates.endDate)}，共${durationLabel}，住${hotelPhrase}。闹钟可以偷懒，行程不行——先定下目的地，故事才真正开场。`
  } else if (tripDates) {
    blurb = dest
      ? `温哥华往返 · ${destLabel}，${formatTripDayLabel(tripDates.startDate)}至${formatTripDayLabel(tripDates.endDate)}，共${durationLabel}。日期敲定了，枕头还在待业——节奏先留白，酒店一落定，动线就会乖乖跟着你跑。`
      : `温哥华往返 · ${formatTripDayLabel(tripDates.startDate)}至${formatTripDayLabel(tripDates.endDate)}，共${durationLabel}。日期敲定了，目的地与酒店却还在「待议」——先点亮目的地，行程才有坐标。`
  } else if (hotelPhrase) {
    const themeHint =
      themes.length > 0
        ? `市内地铁加步行主打，${themes.join('、')}已塞进行程口袋。`
        : '市内地铁加步行主打，日期一敲定，节奏立刻显形。'
    blurb = dest
      ? `温哥华往返 · ${destLabel}，落脚${hotelPhrase}。床位已锁定，出发日还在装神秘；${themeHint}`
      : `温哥华往返 · 落脚${hotelPhrase}。床位已锁定，目的地与出发日还在装神秘；${themeHint}`
  } else if (dest) {
    blurb = `温哥华往返 · ${destLabel}${chineseDayCount(planDays)}雏形已就位，日期与酒店却还在「待议」。先点亮这两项，行程才会从草稿升级成正经旅行。`
  } else {
    blurb = `温哥华往返 · 先告诉我这次要去哪儿，再排日期、航班与酒店。目的地一定，后面的行程才有根。`
  }

  return { eyebrow, title, blurb, tags }
}

function initialHotelState(): { hotel: SelectedHotel; candidates: HotelCandidate[] } {
  const cached = loadHotelCache()
  const candidates = cached?.candidates || []
  // Only restore a previously confirmed stay — never auto-pick on load.
  if (cached?.selected && cached.selected.id !== PENDING_HOTEL.id) {
    return { hotel: cached.selected, candidates }
  }
  return { hotel: PENDING_HOTEL, candidates }
}

/** Sync-restore flights so fingerprint / expand gates match saved itinerary on first paint. */
function initialFlightsState(): FlightSelection {
  const saved = loadFlightSelection()
  return {
    outbound: saved?.outbound ?? null,
    returnFlight: saved?.returnFlight ?? null,
  }
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
  } = useAuth()
  const readOnly = !canEdit
  const [shareOpen, setShareOpen] = useState(false)
  const initialHotels = useMemo(() => initialHotelState(), [])
  const initialFlights = useMemo(() => initialFlightsState(), [])
  const initialItinerary = useMemo(() => {
    const state = loadItineraryState()
    ensureBaselineFromGenerated(state)
    return state
  }, [])
  const [hotel, setHotel] = useState<SelectedHotel>(initialHotels.hotel)
  const [hotelCandidates, setHotelCandidates] = useState<HotelCandidate[]>(
    initialHotels.candidates,
  )
  // Destination UI temporarily hidden — lock trip to Paris.
  const destination = '巴黎'
  const [tripDates, setTripDates] = useState<TripDateRange | null>(() => loadTripDates())
  const [flights, setFlights] = useState<FlightSelection>(initialFlights)
  const [itineraryStart, setItineraryStart] = useState<ItineraryStartResult | null>(null)
  // True on first paint when outbound+dates exist so fingerprint gates wait for resolve.
  const [itineraryStartLoading, setItineraryStartLoading] = useState(() =>
    Boolean(loadTripDates()?.startDate && initialFlights.outbound?.flightNumber),
  )
  const [dayIndex, setDayIndex] = useState(0)
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null)
  const [days, setDays] = useState<DayPlan[]>(() => initialItinerary.days)
  const [customPlaces, setCustomPlaces] = useState<Record<string, Place>>(
    () => initialItinerary.customPlaces,
  )
  const [itineraryGenerated, setItineraryGenerated] = useState(
    () => Boolean(initialItinerary.generated && initialItinerary.days.length),
  )
  const [itineraryFingerprint, setItineraryFingerprint] =
    useState<ItineraryInputFingerprint | null>(() => initialItinerary.fingerprint || null)
  const [itineraryGenerating, setItineraryGenerating] = useState(false)
  const [itineraryGenError, setItineraryGenError] = useState<string | null>(null)
  const [dayRegenerating, setDayRegenerating] = useState(false)
  const [dayRegenError, setDayRegenError] = useState<string | null>(null)
  const [itineraryLoadingLineIndex, setItineraryLoadingLineIndex] = useState(
    () => Math.floor(Math.random() * ITINERARY_LOADING_LINES.length),
  )
  const [panelResetKey, setPanelResetKey] = useState(0)
  const [copyRefreshing, setCopyRefreshing] = useState(false)
  const prevStopsKeyRef = useRef<string | null>(null)
  const suppressCopyRef = useRef(false)
  const genRequestIdRef = useRef(0)
  const dayRegenRequestIdRef = useRef(0)
  /** False until hotel+flights+dates(+start resolve) have produced a stable fingerprint once. */
  const tripInputsHydratedRef = useRef(false)
  /** Skip autosave during hydrate + React Strict Mode double-effect. */
  const cloudSaveSkipRunsRef = useRef(2)
  const cloudHydratedAtRef = useRef(Date.now())

  useEffect(() => {
    if (cloudSaveSkipRunsRef.current > 0) {
      cloudSaveSkipRunsRef.current -= 1
      return
    }
    // After remount/sync, ignore transient effect noise for a short window.
    if (Date.now() - cloudHydratedAtRef.current < 1600) return
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

  const handleFlightsChange = useCallback((next: FlightSelection) => {
    setFlights((prev) =>
      prev.outbound === next.outbound && prev.returnFlight === next.returnFlight
        ? prev
        : next,
    )
  }, [])

  const datesReady = hasTripDates(tripDates)
  const outboundReady = Boolean(flights.outbound?.flightNumber?.trim())
  const returnReady = Boolean(flights.returnFlight?.flightNumber?.trim())
  const flightsReady = areFlightsComplete(flights)
  const hotelReady = isHotelSelected(hotel)
  const itineraryReady = datesReady && flightsReady && hotelReady
  const missingForItinerary = itineraryMissingLabels({
    datesReady,
    outboundReady,
    returnReady,
    hotelReady,
  })

  /**
   * Day-tab calendar base: resolved Paris itinerary start when ready,
   * else provisional trip startDate. Clamped to endDate if arrival slips past return.
   */
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

  /**
   * Inclusive daytime days from itinerary Day 1 → trip endDate.
   * Before dates exist, keep whatever length is loaded (or 1).
   */
  const numberOfDays = useMemo(() => {
    if (!tripDates?.startDate || !tripDates?.endDate) {
      return Math.max(1, days.length || 1)
    }
    const start = itineraryStartDate || tripDates.startDate
    return itineraryDayCount(start, tripDates.endDate)
  }, [tripDates?.startDate, tripDates?.endDate, itineraryStartDate, days.length])

  const dayNightLabel = formatDayNightLabel(numberOfDays)

  const currentFingerprint = useMemo(() => {
    if (!tripDates?.startDate || !tripDates?.endDate || !hotelReady) return null
    // Require both legs so we never compare/wipe against empty flights during hydrate.
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

  useEffect(() => {
    // Avoid writing null fingerprint over a saved one while state is mid-wipe/hydrate.
    saveItineraryState(days, customPlaces, {
      generated: itineraryGenerated,
      fingerprint: itineraryFingerprint ?? undefined,
    })
  }, [days, customPlaces, itineraryGenerated, itineraryFingerprint])

  // When hotel / dates / flights change after a plan was generated, wipe so next expand regenerates.
  // Wait until trip inputs (+ itinerary start resolve) are hydrated — never wipe on the brief
  // null-flights / provisional-startDate window after refresh.
  useEffect(() => {
    if (!itineraryReady || itineraryStartLoading || !currentFingerprint) return

    const wipePlan = () => {
      genRequestIdRef.current += 1
      dayRegenRequestIdRef.current += 1
      wipeGeneratedItinerary()
      clearDayNavCache()
      navTimesAppliedKeyRef.current = ''
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

    if (!tripInputsHydratedRef.current) {
      tripInputsHydratedRef.current = true
      if (!itineraryGenerated) return
      if (!itineraryFingerprint) {
        // Legacy plan without fingerprint — keep and stamp current inputs.
        setItineraryFingerprint(currentFingerprint)
        return
      }
      if (fingerprintsEqual(itineraryFingerprint, currentFingerprint)) return
      // Async start-date resolve can drift slightly; hotel/dates/flights still match → keep plan.
      if (fingerprintTripInputsEqual(itineraryFingerprint, currentFingerprint)) {
        setItineraryFingerprint(currentFingerprint)
        return
      }
      wipePlan()
      return
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
  ])

  // When hotel areaKey is confirmed / re-derived (e.g. 16区 no longer → saintGermain),
  // rewrite stale LLM day blurbs that still name the wrong 落脚点.
  useEffect(() => {
    if (!isHotelSelected(hotel)) return
    if (!itineraryGenerated || !days.length) return
    const areaKey = hotel.areaKey
    if (!AREA_KEY_CN[areaKey]) return

    setDays((prev) => {
      const next = syncDaysCopyToHotelArea(prev, areaKey)
      return next === prev ? prev : next
    })
  }, [hotel.id, hotel.areaKey, itineraryGenerated, days.length])

  // Keep day tabs in sync with computed itinerary length (only after a plan exists).
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
  }, [numberOfDays, tripDates?.startDate, tripDates?.endDate, itineraryGenerated])

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

  const runFullItineraryGeneration = useCallback(async () => {
    if (!tripDates?.startDate || !tripDates?.endDate || !hotelReady) return
    if (!isLlmConfigured()) {
      setItineraryGenError('未配置服务端 OPENAI_API_KEY，无法生成行程。')
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
    suppressCopyRef.current = true

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
      prevStopsKeyRef.current = null
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
  ])

  // First expand (dates + flights + hotel ready): generate full itinerary if none saved.
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

  const safeDayIndex = Math.min(dayIndex, Math.max(0, days.length - 1))
  const day = days[safeDayIndex] ?? EMPTY_DAY_FALLBACK
  const hero = useMemo(
    () => buildHeroCopy(destination, tripDates, hotel, days),
    [destination, tripDates, hotel, days],
  )
  const placesWithHotel = useMemo(
    () => ({
      ...customPlaces,
      [SELECTED_HOTEL_PLACE_ID]: placeFromHotel(hotel),
    }),
    [customPlaces, hotel],
  )
  const dayPlacesKey = useMemo(
    () => day.stops.map((s) => s.placeId).join(','),
    [day.stops],
  )
  const dayCalendarDate = dateForTripDay(itineraryStartDate, day.day)
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
  useEffect(() => {
    if (day.day === 1 && navPlan.hotelToFirst?.durationSeconds) {
      day1TransitSecondsRef.current = navPlan.hotelToFirst.durationSeconds
    }
  }, [day.day, navPlan.hotelToFirst?.durationSeconds])

  // Live stop clocks: cascade from Day-1 hotel arrival (or ~10:00) using Google leg durations.
  useEffect(() => {
    if (!itineraryReady || !itineraryGenerated || itineraryGenerating) return
    if (navLoading) return
    if (!day.stops.length) return
    if (!navPlan.stopsKey?.startsWith(`${day.day}|`)) return

    const transitSeconds =
      day.day === 1
        ? navPlan.hotelToFirst?.durationSeconds
        : day1TransitSecondsRef.current ?? undefined
    const day1HotelHm =
      day.day === 1 ? computeDay1HotelArrivalHm(flights.outbound, transitSeconds) : null

    const applyKey = `${navPlan.stopsKey}::${day1HotelHm || ''}`
    if (navTimesAppliedKeyRef.current === applyKey) return

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

      navTimesAppliedKeyRef.current = applyKey

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
    navLoading,
    navPlan.stopsKey,
    navPlan.betweenStops,
    navPlan.hotelToFirst?.durationSeconds,
    day.day,
    day.stops.length,
    flights.outbound,
    placesWithHotel,
  ])

  // When viewing another day, still refresh Day 1 hotel check-in if flight/transit changes.
  useEffect(() => {
    if (day.day === 1) return
    const transitSeconds = day1TransitSecondsRef.current
    const hotelHm = computeDay1HotelArrivalHm(flights.outbound, transitSeconds)
    if (!hotelHm) return
    setDays((prev) => {
      const idx = prev.findIndex((d) => d.day === 1)
      if (idx < 0) return prev
      const nextDay = applyDay1HotelArrivalTimes(prev[idx], hotelHm)
      if (nextDay === prev[idx]) return prev
      const next = [...prev]
      next[idx] = nextDay
      return next
    })
  }, [flights.outbound, day.day])

  // Auto-generate day title / theme / summary after itinerary edits.
  useEffect(() => {
    if (!itineraryReady || !itineraryGenerated || itineraryGenerating) return

    const key = `${day.day}:${dayPlacesKey}:${dayCalendarDate || ''}`

    if (prevStopsKeyRef.current === null) {
      prevStopsKeyRef.current = key
      return
    }

    if (prevStopsKeyRef.current === key) return

    const prevDay = Number(prevStopsKeyRef.current.split(':')[0])
    prevStopsKeyRef.current = key

    if (suppressCopyRef.current) {
      suppressCopyRef.current = false
      return
    }

    // Switching day tabs should not rewrite copy.
    if (prevDay !== day.day) return

    let cancelled = false
    const timer = window.setTimeout(() => {
      const names = day.stops.map((s) => {
        try {
          return getPlace(s.placeId, placesWithHotel).name
        } catch {
          return s.placeId
        }
      })

      setCopyRefreshing(true)
      void generateDayCopy({
        day: day.day,
        pace: day.pace,
        placeNames: names,
        hotelArea: hotel.areaKey,
        hotelAreaLabel: AREA_KEY_CN[hotel.areaKey] || hotelAreaShort(hotel) || undefined,
        calendarDate: dayCalendarDate || undefined,
        totalDays: numberOfDays,
      })
        .then((copy) => {
          if (cancelled || !copy) return
          const areaKey = hotel.areaKey
          setDays((prev) =>
            prev.map((d, i) => {
              if (i !== dayIndex) return d
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
        .finally(() => {
          if (!cancelled) setCopyRefreshing(false)
        })
    }, 900)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [
    dayPlacesKey,
    day.day,
    day.pace,
    day.stops,
    dayIndex,
    dayCalendarDate,
    placesWithHotel,
    hotel,
    itineraryReady,
    itineraryGenerated,
    itineraryGenerating,
    numberOfDays,
  ])

  const updateDayStops = useCallback(
    (updater: (stops: ItineraryStop[]) => ItineraryStop[]) => {
      setDays((prev) =>
        prev.map((d, i) => (i === dayIndex ? { ...d, stops: updater(d.stops) } : d)),
      )
    },
    [dayIndex],
  )

  const lastDayNum = numberOfDays

  function handleReorder(from: number, to: number) {
    updateDayStops((stops) =>
      keepFixedHotelPositions(day.day, reorderStops(stops, from, to), lastDayNum),
    )
  }

  function handleReorderOnDay(dayNum: number, from: number, to: number) {
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
  }

  function handleDelete(stopId: string) {
    updateDayStops((stops) => {
      const removedIdx = stops.findIndex((s, i) => ensureStopId(day.day, s, i) === stopId)
      if (removedIdx < 0) return stops
      // Pinned hotel check-in / overnight cannot be removed.
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
  }

  function handleDeleteOnDay(dayNum: number, stopId: string) {
    setDays((prev) =>
      prev.map((d) => {
        if (d.day !== dayNum) return d
        const removedIdx = d.stops.findIndex((s, i) => ensureStopId(d.day, s, i) === stopId)
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
  }

  function handleAddCustom(place: Place, mode: 'best' | 'end') {
    handleAddOnDay(day.day, place, { mode })
  }

  function handleAddOnDay(
    dayNum: number,
    place: Place,
    options?: { mode?: 'best' | 'end'; insertAt?: number },
  ) {
    const mode = options?.mode || 'best'
    setCustomPlaces((prev) => ({ ...prev, [place.id]: place }))

    const newStop: ItineraryStop = {
      id: makeStopId(dayNum, place.id),
      time: '12:00',
      placeId: place.id,
      note: place.description,
      walkLevel: '短步行',
      duration: place.durationHint || '60 分钟',
    }

    setDays((prev) =>
      prev.map((d) => {
        if (d.day !== dayNum) return d

        const next = [...d.stops]
        const endsWithOvernight =
          d.day !== lastDayNum &&
          d.stops[d.stops.length - 1]?.placeId === SELECTED_HOTEL_PLACE_ID

        // Explicit index only for rare internal cases; normal adds use 最顺路.
        if (typeof options?.insertAt === 'number') {
          let at = Math.max(0, Math.min(options.insertAt, next.length))
          if (d.day === 1 && d.stops[0]?.placeId === SELECTED_HOTEL_PLACE_ID) {
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
        // Day 1 origin is CDG; other days use the hotel.
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
        // Keep day-1 hotel check-in as the first stop (airport → hotel → …).
        if (d.day === 1 && d.stops[0]?.placeId === SELECTED_HOTEL_PLACE_ID) {
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
    setSelectedPlaceId(place.id)
  }

  function handleSwitchDay(dayNum: number) {
    const idx = days.findIndex((d) => d.day === dayNum)
    if (idx >= 0) {
      setDayIndex(idx)
      setSelectedPlaceId(null)
    }
  }

  /** Atomically replace a stop in-place so the new place keeps the old index. */
  function handleReplaceOnDay(dayNum: number, stopId: string, place: Place) {
    setCustomPlaces((prev) => ({ ...prev, [place.id]: place }))

    setDays((prev) =>
      prev.map((d) => {
        if (d.day !== dayNum) return d
        const idx = d.stops.findIndex((s, i) => ensureStopId(d.day, s, i) === stopId)
        if (idx < 0) return d

        const old = d.stops[idx]
        // Pinned hotel check-in / overnight cannot be replaced.
        if (isPinnedHotelStop(d.day, d.stops, idx, lastDayNum)) return d

        const newStop: ItineraryStop = {
          id: makeStopId(dayNum, place.id),
          time: old.time || '12:00',
          placeId: place.id,
          note: place.description,
          walkLevel: old.walkLevel || '短步行',
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
    setSelectedPlaceId(place.id)
  }

  async function handleResetDay() {
    if (!tripDates?.startDate || !tripDates?.endDate || !hotelReady) return
    if (!itineraryGenerated || !days.length) return
    if (dayRegenerating || itineraryGenerating) return
    if (!isLlmConfigured()) {
      setDayRegenError('未配置服务端 OPENAI_API_KEY，无法重新生成当天行程。')
      return
    }

    const active = days[dayIndex] || days.find((d) => d.day === day.day)
    if (!active) return

    const requestId = ++dayRegenRequestIdRef.current
    setDayRegenerating(true)
    setDayRegenError(null)
    suppressCopyRef.current = true

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
      })

      if (requestId !== dayRegenRequestIdRef.current) return

      const synced = syncDaysCopyToHotelArea(result.days, hotel.areaKey)
      setDays(synced)
      setCustomPlaces(result.customPlaces)
      // Keep full-plan flags: do not collapse section or wipe fingerprint.
      setItineraryGenerated(true)
      saveItineraryState(synced, result.customPlaces, {
        generated: true,
        fingerprint: itineraryFingerprint,
      })
      setSelectedPlaceId(null)
      setDayRegenError(null)
      prevStopsKeyRef.current = null
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
  }

  function handleRegenerateItinerary() {
    suppressCopyRef.current = true
    genRequestIdRef.current += 1
    dayRegenRequestIdRef.current += 1
    wipeGeneratedItinerary()
    clearDayNavCache()
    navTimesAppliedKeyRef.current = ''
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
    // Effect will re-run generation when generated=false and no usable plan.
  }

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
    genRequestIdRef.current += 1
    dayRegenRequestIdRef.current += 1
    tripInputsHydratedRef.current = false

    clearItineraryState()
    clearFlightSelection()
    clearHotelCache()
    saveTripDates(null)
    clearAllFlightCache()
    clearAllRecommendCache()
    clearLlmMemo()
    clearDayNavCache()
    navTimesAppliedKeyRef.current = ''
    try {
      sessionStorage.removeItem('paris-tour-popular-destinations-v1')
      localStorage.removeItem('paris-tour-popular-destinations-v1')
      sessionStorage.removeItem('paris-tour-review-translations-v1')
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
  }

  function handleRestoreDefault() {
    const restored = restoreFullFromBaseline()
    if (!restored) return
    suppressCopyRef.current = true
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
    prevStopsKeyRef.current = null
  }

  function handleRestoreDayDefault() {
    const dayNum = days[safeDayIndex]?.day ?? day.day
    const restored = restoreDayFromBaseline(dayNum, days, customPlaces)
    if (!restored) return
    suppressCopyRef.current = true
    setDays(restored.days)
    setCustomPlaces(restored.customPlaces)
    saveItineraryState(restored.days, restored.customPlaces, {
      generated: true,
      fingerprint: itineraryFingerprint,
    })
    setSelectedPlaceId(null)
    setDayRegenError(null)
    prevStopsKeyRef.current = null
  }

  const canRestoreDefault = hasMatchingBaseline(
    itineraryFingerprint || currentFingerprint,
  )
  const canRestoreDayDefault = hasBaselineDay(
    days[safeDayIndex]?.day ?? day.day,
    itineraryFingerprint || currentFingerprint,
  )

  const showItineraryContent =
    itineraryReady && itineraryGenerated && days.length > 0 && !itineraryGenerating
  const showItineraryLoading =
    itineraryReady && (itineraryGenerating || (itineraryStartLoading && !itineraryGenerated))
  const showItineraryError =
    itineraryReady && !itineraryGenerating && Boolean(itineraryGenError) && !itineraryGenerated

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

  return (
    <div className="mx-auto min-h-screen max-w-7xl px-4 pb-16 pt-6 sm:px-6 lg:px-8">
      <CloudSaveIndicator />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
          <span className="truncate text-[var(--stone)]">{email}</span>
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
              className="max-w-[min(100%,320px)] truncate rounded-full border border-[var(--stone)]/30 bg-[var(--card)] px-3 py-1.5 text-sm"
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
        <div className="flex flex-wrap items-center gap-2">
          {role === 'owner' && activeTrip && (
            <button
              type="button"
              onClick={() => {
                setShareOpen(true)
                void refreshTrips().catch(() => undefined)
              }}
              className="rounded-full border border-[var(--stone)]/35 bg-[var(--card)] px-4 py-1.5 text-sm text-[var(--ink)] transition hover:border-[var(--sage)]"
            >
              分享
            </button>
          )}
          {!readOnly && (
            <button
              type="button"
              onClick={handleClearAllTripState}
              className="rounded-full border border-[var(--stone)]/35 bg-[var(--card)] px-4 py-1.5 text-sm text-[var(--ink)] transition hover:border-[var(--sage)]"
            >
              清空全部
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              void signOut()
            }}
            className="rounded-full border border-[var(--stone)]/35 bg-[var(--card)] px-4 py-1.5 text-sm text-[var(--ink)] transition hover:border-[var(--sage)]"
          >
            退出
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

      <header className="relative overflow-hidden rounded-[28px] border border-white/60 bg-[linear-gradient(135deg,rgba(28,36,32,0.92),rgba(74,99,86,0.88))] px-6 py-10 text-[var(--paper)] shadow-[var(--shadow)] sm:px-10 sm:py-14">
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
          <p className="text-xs uppercase tracking-[0.28em] text-[var(--gold)]">{hero.eyebrow}</p>
          <h1 className="font-display mt-2 text-5xl leading-none sm:text-6xl md:text-7xl">
            {hero.title}
          </h1>
          <p className="mt-4 max-w-lg text-base text-[var(--paper)]/85 sm:text-lg">{hero.blurb}</p>
          <div className="mt-6 flex flex-wrap gap-2 text-sm">
            {hero.tags.map((tag) => (
              <span key={tag} className="rounded-full bg-white/10 px-3 py-1 backdrop-blur">
                {tag}
              </span>
            ))}
          </div>
        </div>
      </header>

      <main className="mt-10 space-y-12">
        <TripDatesPanel
          key={`dates-${panelResetKey}`}
          value={tripDates}
          onChange={setTripDates}
          readOnly={readOnly}
        />
        <FlightPanel
          key={`flights-${panelResetKey}`}
          tripDates={tripDates}
          destination={destination}
          onFlightsChange={handleFlightsChange}
          readOnly={readOnly}
        />
        <HotelPicker
          key={`hotel-${panelResetKey}`}
          selected={hotel}
          candidates={hotelCandidates}
          days={days}
          onSelect={setHotel}
          onCandidatesChange={setHotelCandidates}
          readOnly={readOnly}
        />

        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-3xl">
                {chineseDayCount(numberOfDays)}行程
              </h2>
              <p className="mt-1 text-sm text-[var(--stone)]">
                {itineraryReady
                  ? '拖拽排序、增删地点；步行距离与标题会随行程自动更新。'
                  : '日期、往返航班和枕头都还没就位——先把上面几项点亮，行程才肯从幕后现身。'}
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
                      label="正在根据航班与时差推算行程起算日…"
                      showDots
                      size="sm"
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
                          label="正在核对抵达时间…"
                          showDots
                          size="sm"
                        />
                      ) : null}
                    </p>
                  ) : null}
                </div>
              )}
            </div>
            {itineraryReady && itineraryGenerated && !readOnly && (
              <div className="flex flex-wrap items-center gap-2">
                {canRestoreDefault && (
                  <button
                    type="button"
                    onClick={handleRestoreDefault}
                    className="rounded-full border border-[var(--stone)]/30 px-3 py-1.5 text-sm hover:border-[var(--sage)]"
                  >
                    恢复默认推荐
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleResetAll}
                  className="rounded-full border border-[var(--stone)]/30 px-3 py-1.5 text-sm hover:border-[var(--sage)]"
                >
                  重新生成全部
                </button>
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
                    <p className="mt-1 text-sm text-[var(--stone)]">{itineraryGenError}</p>
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
                    <div className="flex gap-2 overflow-x-auto pb-1">
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
                            className={`shrink-0 rounded-full px-4 py-2 text-sm transition ${
                              i === dayIndex
                                ? 'bg-[var(--ink)] text-[var(--paper)]'
                                : 'bg-white/70 text-[var(--ink)] hover:bg-white'
                            }`}
                          >
                            <span className="block leading-tight">
                              D{d.day}
                              {cal ? ` · ${formatTripDayLabel(cal)}` : ''}
                            </span>
                            <span className="block text-[11px] opacity-80">{d.title}</span>
                          </button>
                        )
                      })}
                    </div>

                    <div className="grid gap-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
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
                        isLastDay={day.day === lastDayNum}
                        onSelectPlace={setSelectedPlaceId}
                        onReorder={handleReorder}
                        onDelete={handleDelete}
                        onAddCustom={handleAddCustom}
                        onResetDay={() => {
                          void handleResetDay()
                        }}
                        canRestoreDayDefault={canRestoreDayDefault}
                        onRestoreDayDefault={handleRestoreDayDefault}
                        tripPlaceNames={tripPlaceNames}
                        readOnly={readOnly}
                      />
                      <div className="space-y-4">
                        <TripMap
                          key={`map-${day.day}-${hotel.id}-${dayPlacesKey}`}
                          hotel={hotel}
                          day={day}
                          customPlaces={placesWithHotel}
                          navPlan={navPlan}
                          navLoading={navLoading}
                          selectedPlaceId={selectedPlaceId}
                          onSelectPlace={setSelectedPlaceId}
                        />
                        <PlacePanel
                          placeId={selectedPlaceId}
                          customPlaces={placesWithHotel}
                          day={day}
                          hotel={hotel}
                          days={days}
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
              <p className="font-medium text-[var(--ink)]">前面都没选好怎么看行程</p>
              <p className="mt-1 text-sm text-[var(--stone)]">
                还卡在：{missingForItinerary.join(' · ')}——挑完再掀帘子。
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
          key={`chat-${panelResetKey}`}
          hotel={hotel}
          hotelCandidates={hotelCandidates}
          days={days}
          currentDay={day.day}
          customPlaces={placesWithHotel}
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
    </div>
  )
}
