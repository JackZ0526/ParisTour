import type { DayPlan, ItineraryStop, Place } from '../types'
import { SELECTED_HOTEL_PLACE_ID } from './dayOrigin'

const STORAGE_KEY = 'paris-tour-itinerary-v1'
/** Immutable first-generation snapshot for 「恢复默认推荐」. */
const BASELINE_STORAGE_KEY = 'paris-tour-itinerary-baseline-v1'

export type ItineraryInputFingerprint = {
  hotelId: string
  startDate: string
  endDate: string
  itineraryStartDate: string
  outboundFlight: string
  returnFlight: string
}

export type PersistedItineraryState = {
  days: DayPlan[]
  customPlaces: Record<string, Place>
  /** True after a successful LLM full-plan generation (or user-edited continuation of one). */
  generated?: boolean
  /** Trip inputs the plan was generated against — mismatch clears the plan. */
  fingerprint?: ItineraryInputFingerprint
}

/** Snapshot of the first successful full generation for a fingerprint. */
export type PersistedBaselineState = {
  days: DayPlan[]
  customPlaces: Record<string, Place>
  fingerprint?: ItineraryInputFingerprint
  savedAt: string
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/**
 * Last day (when trip has 2+ days): hotel is map/nav origin only.
 * Strip hotel stops so timeline/map do not show a hotel card before CDG.
 * Single-day trips keep Day 1 check-in (day 1 === last day).
 */
export function stripLastDayHotelStops(days: DayPlan[]): DayPlan[] {
  if (days.length <= 1) return days
  const lastDayNum = Math.max(...days.map((d) => d.day))
  if (lastDayNum <= 1) return days

  return days.map((day) => {
    if (day.day !== lastDayNum) return day
    const stops = day.stops.filter((s) => s.placeId !== SELECTED_HOTEL_PLACE_ID)
    return stops.length === day.stops.length ? day : { ...day, stops }
  })
}

function makeOvernightHotelStop(dayNum: number, existing?: ItineraryStop): ItineraryStop {
  return {
    id: existing?.id || `d${dayNum}-${SELECTED_HOTEL_PLACE_ID}-overnight`,
    time: existing?.time || '21:30',
    placeId: SELECTED_HOTEL_PLACE_ID,
    note: existing?.note || '回酒店休息，结束今天的行程。',
    transport: existing?.transport || '地铁 / 步行回酒店',
    walkLevel: existing?.walkLevel || '很少走',
    duration: existing?.duration || '过夜',
  }
}

/**
 * Except the last day: every day must end with a hotel overnight stop.
 * Mid days: morning hotel is origin-only (map/nav); evening hotel is a timeline card.
 * Day 1 (when not last): check-in stays first; overnight hotel is appended as last.
 * Single-day trips skip this (day 1 === last day → check-in only).
 */
export function ensureDayEndsAtHotel(days: DayPlan[]): DayPlan[] {
  if (days.length <= 1) return days
  const lastDayNum = Math.max(...days.map((d) => d.day))

  return days.map((day) => {
    if (day.day === lastDayNum) return day

    const last = day.stops[day.stops.length - 1]
    if (last?.placeId === SELECTED_HOTEL_PLACE_ID) return day

    const hotelStops = day.stops.filter((s) => s.placeId === SELECTED_HOTEL_PLACE_ID)
    const nonHotels = day.stops.filter((s) => s.placeId !== SELECTED_HOTEL_PLACE_ID)

    // Day 1: keep check-in first; append a distinct overnight if there are other stops
    // (or if check-in is missing and we only have an overnight candidate).
    if (day.day === 1) {
      const checkIn = hotelStops[0]
      if (!checkIn) {
        return {
          ...day,
          stops: [...nonHotels, makeOvernightHotelStop(day.day)],
        }
      }
      if (!nonHotels.length) {
        // Only check-in — already first and last.
        return { ...day, stops: [checkIn] }
      }
      const overnightExisting =
        hotelStops.length > 1 ? hotelStops[hotelStops.length - 1] : undefined
      return {
        ...day,
        stops: [checkIn, ...nonHotels, makeOvernightHotelStop(day.day, overnightExisting)],
      }
    }

    // Mid days: drop any misplaced hotel cards, then append overnight at end.
    const overnightExisting = hotelStops[hotelStops.length - 1]
    return {
      ...day,
      stops: [...nonHotels, makeOvernightHotelStop(day.day, overnightExisting)],
    }
  })
}

/** Day 1: airport is origin; first stop must be hotel check-in (not CDG as a stop). */
export function ensureDay1HotelFirst(days: DayPlan[]): DayPlan[] {
  const withDay1 = days.map((day) => {
    if (day.day !== 1) return day

    const hotelStops = day.stops.filter((s) => s.placeId === SELECTED_HOTEL_PLACE_ID)
    const rest = day.stops.filter(
      (s) => s.placeId !== 'attr-cdg' && s.placeId !== SELECTED_HOTEL_PLACE_ID,
    )
    const checkIn = hotelStops[0]
    const hotelStop: ItineraryStop = {
      id: checkIn?.id || `d1-${SELECTED_HOTEL_PLACE_ID}-checkin`,
      // Prefer preserved / computed time; seed 「10:30」 was a static placeholder.
      time: checkIn?.time || '待定',
      placeId: SELECTED_HOTEL_PLACE_ID,
      note:
        checkIn?.note ||
        '从 CDG 出关后先到酒店办理入住、放下行李，稍作休息再出门。',
      transport: checkIn?.transport || 'RER B / 出租车自戴高乐机场',
      walkLevel: checkIn?.walkLevel || '很少走',
      duration: checkIn?.duration || '入住 30–45 分钟',
    }

    // Preserve a trailing overnight hotel stop if Day 1 already had more than one hotel.
    const overnight =
      hotelStops.length > 1 ? makeOvernightHotelStop(1, hotelStops[hotelStops.length - 1]) : null

    return {
      ...day,
      stops: overnight ? [hotelStop, ...rest, overnight] : [hotelStop, ...rest],
    }
  })
  // Mid/arrival days end at hotel; last-day hotel → origin-only (map + timeline agree).
  return stripLastDayHotelStops(ensureDayEndsAtHotel(withDay1))
}

function cloneDay(day: DayPlan, dayNumber = day.day): DayPlan {
  return {
    ...day,
    day: dayNumber,
    metroHintFromArea: { ...day.metroHintFromArea },
    stops: day.stops.map((stop, index) => ({
      ...stop,
      id: stop.id || `d${dayNumber}-${stop.placeId}-${index}`,
    })),
  }
}

export function blankDay(dayNumber: number): DayPlan {
  return {
    day: dayNumber,
    title: `第 ${dayNumber} 天`,
    theme: '自由安排',
    pace: '适中',
    summary: '今天还没有安排地点，添加景点后会自动生成标题与总结。',
    metroHintFromArea: {
      custom: '按导航前往下一个地点。',
    },
    stops: [],
  }
}

/** Build a length-N blank template (no hardcoded seed plan). */
function templateBlank(count: number): DayPlan[] {
  const n = Math.max(1, count)
  return Array.from({ length: n }, (_, i) => blankDay(i + 1))
}

/** Empty itinerary of length N with Day 1 hotel check-in placeholder. */
export function emptyItinerary(dayCount?: number): DayPlan[] {
  const n = dayCount && dayCount > 0 ? dayCount : 1
  return ensureDay1HotelFirst(templateBlank(n))
}

/**
 * Resize itinerary to N daytime days. Preserves Day 1 and the return (last) day when possible;
 * fills / trims middle days from the current plan or blank days.
 */
export function resizeItineraryToLength(days: DayPlan[], count: number): DayPlan[] {
  const n = Math.max(1, Math.min(30, Math.floor(count) || 1))
  if (
    days.length === n &&
    days.every((d, i) => d.day === i + 1)
  ) {
    return days
  }

  const template = templateBlank(n)
  if (n === 1) {
    const d1 = days.find((d) => d.day === 1) || template[0]
    return ensureDay1HotelFirst([cloneDay(d1, 1)])
  }

  const out: DayPlan[] = []
  const existingByDay = new Map(days.map((d) => [d.day, d]))
  const oldLastDayNum = days.length > 1 ? days[days.length - 1]?.day : null

  for (let i = 0; i < n; i++) {
    const dayNum = i + 1
    const tmpl = template[i]

    if (dayNum === 1) {
      const ex = existingByDay.get(1)
      out.push(cloneDay(ex || tmpl, 1))
      continue
    }

    if (dayNum === n) {
      const oldLast = oldLastDayNum != null ? existingByDay.get(oldLastDayNum) : null
      out.push(cloneDay(oldLast || tmpl, n))
      continue
    }

    const ex = existingByDay.get(dayNum)
    // Don't reuse the old return day as a middle day.
    if (ex && dayNum !== oldLastDayNum) {
      out.push(cloneDay(ex, dayNum))
    } else {
      out.push(cloneDay(tmpl, dayNum))
    }
  }

  return ensureDay1HotelFirst(out)
}

export function buildItineraryFingerprint(input: {
  hotelId: string
  startDate: string
  endDate: string
  itineraryStartDate?: string | null
  outboundFlight?: string | null
  returnFlight?: string | null
}): ItineraryInputFingerprint {
  return {
    hotelId: input.hotelId.trim(),
    startDate: input.startDate.trim(),
    endDate: input.endDate.trim(),
    itineraryStartDate: (input.itineraryStartDate || input.startDate).trim(),
    outboundFlight: (input.outboundFlight || '').trim().toUpperCase(),
    returnFlight: (input.returnFlight || '').trim().toUpperCase(),
  }
}

export function fingerprintsEqual(
  a?: ItineraryInputFingerprint | null,
  b?: ItineraryInputFingerprint | null,
): boolean {
  if (!a || !b) return false
  return (
    a.hotelId === b.hotelId &&
    a.startDate === b.startDate &&
    a.endDate === b.endDate &&
    a.itineraryStartDate === b.itineraryStartDate &&
    a.outboundFlight === b.outboundFlight &&
    a.returnFlight === b.returnFlight
  )
}

/**
 * Compare trip inputs that the user explicitly controls (hotel / dates / flights).
 * Excludes `itineraryStartDate`, which can briefly differ while async resolve settles
 * and must not wipe a restored plan on refresh.
 */
export function fingerprintTripInputsEqual(
  a?: ItineraryInputFingerprint | null,
  b?: ItineraryInputFingerprint | null,
): boolean {
  if (!a || !b) return false
  return (
    a.hotelId === b.hotelId &&
    a.startDate === b.startDate &&
    a.endDate === b.endDate &&
    a.outboundFlight === b.outboundFlight &&
    a.returnFlight === b.returnFlight
  )
}

function normalizeLoadedDays(days: DayPlan[]): DayPlan[] {
  return ensureDay1HotelFirst(
    days.map((day) => ({
      ...day,
      stops: day.stops.map((stop, index) => ({
        ...stop,
        id: stop.id || `d${day.day}-${stop.placeId}-${index}`,
      })),
    })),
  )
}

export function loadItineraryState(): PersistedItineraryState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return { days: [], customPlaces: {}, generated: false }
    }
    const parsed = JSON.parse(raw) as PersistedItineraryState
    if (!parsed.days?.length) {
      return {
        days: [],
        customPlaces: parsed.customPlaces || {},
        generated: false,
        fingerprint: parsed.fingerprint,
      }
    }
    // Legacy seed saves without generated flag: treat as generated so we don't wipe user edits.
    const generated = parsed.generated !== false
    return {
      days: normalizeLoadedDays(parsed.days),
      customPlaces: parsed.customPlaces || {},
      generated,
      fingerprint: parsed.fingerprint,
    }
  } catch {
    return { days: [], customPlaces: {}, generated: false }
  }
}

export function saveItineraryState(
  days: DayPlan[],
  customPlaces: Record<string, Place>,
  meta?: { generated?: boolean; fingerprint?: ItineraryInputFingerprint | null },
) {
  try {
    let prevGenerated = false
    let prevFingerprint: ItineraryInputFingerprint | undefined
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as PersistedItineraryState
        prevGenerated = parsed.generated === true
        prevFingerprint = parsed.fingerprint
      }
    } catch {
      /* ignore */
    }
    const generated = meta?.generated !== undefined ? meta.generated : prevGenerated
    // null means explicit clear; undefined means keep previous.
    // Never drop fingerprint while keeping a generated plan (null mid-update).
    let fingerprint: ItineraryInputFingerprint | undefined
    if (meta?.fingerprint === null) {
      fingerprint = generated ? prevFingerprint : undefined
    } else if (meta?.fingerprint !== undefined) {
      fingerprint = meta.fingerprint
    } else {
      fingerprint = prevFingerprint
    }
    const payload: PersistedItineraryState = {
      days,
      customPlaces,
      generated,
      fingerprint,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    /* ignore quota */
  }
}

export function clearItineraryState() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
  clearBaselineItinerary()
}

/** Wipe working plan but keep storage key shape for next generation.
 *  Does not clear the baseline snapshot (restore default still works after regen).
 */
export function wipeGeneratedItinerary() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        days: [],
        customPlaces: {},
        generated: false,
      } satisfies PersistedItineraryState),
    )
  } catch {
    /* ignore */
  }
}

export function loadBaselineItinerary(): PersistedBaselineState | null {
  try {
    const raw = localStorage.getItem(BASELINE_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersistedBaselineState
    if (!parsed.days?.length) return null
    return {
      days: normalizeLoadedDays(parsed.days),
      customPlaces: parsed.customPlaces || {},
      fingerprint: parsed.fingerprint,
      savedAt: parsed.savedAt || '',
    }
  } catch {
    return null
  }
}

/**
 * Persist an immutable baseline of the first successful full generation for a fingerprint.
 * Skips write when a matching-fingerprint baseline already exists (edits / same-fingerprint
 * full regen must not overwrite). Replaces when fingerprint is new or missing.
 */
export function saveBaselineItinerary(
  days: DayPlan[],
  customPlaces: Record<string, Place>,
  fingerprint?: ItineraryInputFingerprint | null,
) {
  if (!days.length) return
  try {
    const existing = loadBaselineItinerary()
    if (
      existing?.days?.length &&
      fingerprint &&
      existing.fingerprint &&
      fingerprintsEqual(existing.fingerprint, fingerprint)
    ) {
      return
    }
    const payload: PersistedBaselineState = {
      days: deepClone(days),
      customPlaces: deepClone(customPlaces),
      fingerprint: fingerprint || undefined,
      savedAt: new Date().toISOString(),
    }
    localStorage.setItem(BASELINE_STORAGE_KEY, JSON.stringify(payload))
  } catch {
    /* ignore quota */
  }
}

export function clearBaselineItinerary() {
  try {
    localStorage.removeItem(BASELINE_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

/** True when a baseline exists for the given trip fingerprint (or any baseline if fingerprint unknown). */
export function hasMatchingBaseline(
  fingerprint?: ItineraryInputFingerprint | null,
): boolean {
  const baseline = loadBaselineItinerary()
  if (!baseline?.days?.length) return false
  if (!fingerprint) return true
  if (!baseline.fingerprint) return true
  return fingerprintsEqual(baseline.fingerprint, fingerprint)
}

/** True when baseline includes a specific day for the current fingerprint. */
export function hasBaselineDay(
  dayNum: number,
  fingerprint?: ItineraryInputFingerprint | null,
): boolean {
  if (!hasMatchingBaseline(fingerprint)) return false
  const baseline = loadBaselineItinerary()
  return Boolean(baseline?.days.some((d) => d.day === dayNum))
}

/**
 * Seed baseline once from an already-generated working plan when no baseline
 * exists yet (legacy sessions that predate baseline storage).
 */
export function ensureBaselineFromGenerated(state: PersistedItineraryState) {
  if (!state.generated || !state.days?.length) return
  const existing = loadBaselineItinerary()
  if (existing?.days?.length) return
  saveBaselineItinerary(state.days, state.customPlaces, state.fingerprint)
}

/** Deep-copy full trip from baseline (working copy only). */
export function restoreFullFromBaseline(): {
  days: DayPlan[]
  customPlaces: Record<string, Place>
  fingerprint?: ItineraryInputFingerprint
} | null {
  const baseline = loadBaselineItinerary()
  if (!baseline?.days?.length) return null
  return {
    days: ensureDay1HotelFirst(deepClone(baseline.days)),
    customPlaces: deepClone(baseline.customPlaces || {}),
    fingerprint: baseline.fingerprint,
  }
}

/**
 * Restore a single day from baseline into the working itinerary.
 * Merges places needed for that day; prunes customPlaces not referenced by any day.
 */
export function restoreDayFromBaseline(
  dayNum: number,
  workingDays: DayPlan[],
  workingCustomPlaces: Record<string, Place>,
): { days: DayPlan[]; customPlaces: Record<string, Place> } | null {
  const baseline = loadBaselineItinerary()
  if (!baseline?.days?.length) return null
  const baselineDay = baseline.days.find((d) => d.day === dayNum)
  if (!baselineDay) return null

  const restoredDay = deepClone(baselineDay)
  let days: DayPlan[]
  if (workingDays.some((d) => d.day === dayNum)) {
    days = workingDays.map((d) => (d.day === dayNum ? restoredDay : d))
  } else {
    days = [...workingDays, restoredDay].sort((a, b) => a.day - b.day)
  }
  days = ensureDay1HotelFirst(days)

  const neededIds = new Set<string>()
  const finalDay = days.find((d) => d.day === dayNum)
  for (const stop of finalDay?.stops || restoredDay.stops) {
    if (stop.placeId !== SELECTED_HOTEL_PLACE_ID) neededIds.add(stop.placeId)
  }

  const customPlaces: Record<string, Place> = { ...workingCustomPlaces }
  for (const id of neededIds) {
    const fromBaseline = baseline.customPlaces?.[id]
    if (fromBaseline) customPlaces[id] = deepClone(fromBaseline)
  }

  const referenced = new Set<string>()
  for (const d of days) {
    for (const s of d.stops) referenced.add(s.placeId)
  }
  for (const id of Object.keys(customPlaces)) {
    if (!referenced.has(id)) delete customPlaces[id]
  }

  return { days, customPlaces }
}

export function hasUsableGeneratedItinerary(
  state: PersistedItineraryState,
  current?: ItineraryInputFingerprint | null,
): boolean {
  if (!state.generated || !state.days?.length) return false
  if (!current) return true
  if (!state.fingerprint) return true // legacy: keep until inputs change tracking starts
  // Ignore itineraryStartDate drift (async resolve) so refresh does not re-generate.
  return fingerprintTripInputsEqual(state.fingerprint, current)
}

export function reorderStops(stops: ItineraryStop[], from: number, to: number): ItineraryStop[] {
  if (from === to || from < 0 || to < 0 || from >= stops.length || to >= stops.length) {
    return stops
  }
  const next = [...stops]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

/**
 * Pinned hotel cards: Day 1 check-in (first) and overnight return (last on non-last days).
 * Same UX as the Day 1 first hotel — no drag / no delete.
 */
export function isPinnedHotelStop(
  dayNum: number,
  stops: ItineraryStop[],
  index: number,
  lastDayNum: number,
): boolean {
  const stop = stops[index]
  if (!stop || stop.placeId !== SELECTED_HOTEL_PLACE_ID) return false
  if (dayNum === 1 && index === 0) return true
  if (dayNum !== lastDayNum && index === stops.length - 1) return true
  return false
}

/**
 * After reorder/add: keep Day 1 check-in first and non-last-day overnight hotel last.
 */
export function keepFixedHotelPositions(
  dayNum: number,
  stops: ItineraryStop[],
  lastDayNum: number,
): ItineraryStop[] {
  let next = [...stops]

  if (dayNum === 1) {
    const hotelIdx = next.findIndex((s) => s.placeId === SELECTED_HOTEL_PLACE_ID)
    if (hotelIdx > 0) {
      const [hotelStop] = next.splice(hotelIdx, 1)
      next = [hotelStop, ...next]
    }
  }

  if (dayNum !== lastDayNum && next.length > 0) {
    if (dayNum === 1 && next[0]?.placeId === SELECTED_HOTEL_PLACE_ID) {
      // Move a *second* hotel card to the end (keep check-in at index 0).
      let otherIdx = -1
      for (let i = 1; i < next.length; i++) {
        if (next[i].placeId === SELECTED_HOTEL_PLACE_ID) otherIdx = i
      }
      if (otherIdx >= 0 && otherIdx !== next.length - 1) {
        const [overnight] = next.splice(otherIdx, 1)
        next.push(overnight)
      }
    } else {
      let hotelIdx = -1
      for (let i = 0; i < next.length; i++) {
        if (next[i].placeId === SELECTED_HOTEL_PLACE_ID) hotelIdx = i
      }
      if (hotelIdx >= 0 && hotelIdx !== next.length - 1) {
        const [overnight] = next.splice(hotelIdx, 1)
        next.push(overnight)
      }
    }
  }

  return next
}

export function makeStopId(day: number, placeId: string): string {
  return `d${day}-${placeId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/**
 * Pick the insert index that minimizes origin → … → stops [→ destination] path length
 * after inserting `newLoc` (0 = before first stop, length = after last).
 */
export function findBestInsertIndex(
  origin: { lat: number; lng: number },
  stopLocations: Array<{ lat: number; lng: number }>,
  newLoc: { lat: number; lng: number },
  destination?: { lat: number; lng: number } | null,
): number {
  if (!stopLocations.length) return 0

  let bestIdx = stopLocations.length
  let bestCost = Number.POSITIVE_INFINITY

  for (let i = 0; i <= stopLocations.length; i++) {
    const order = [...stopLocations.slice(0, i), newLoc, ...stopLocations.slice(i)]
    let cost = haversineMeters(origin, order[0])
    for (let j = 1; j < order.length; j++) {
      cost += haversineMeters(order[j - 1], order[j])
    }
    if (destination) {
      cost += haversineMeters(order[order.length - 1], destination)
    }
    if (cost < bestCost) {
      bestCost = cost
      bestIdx = i
    }
  }

  return bestIdx
}
