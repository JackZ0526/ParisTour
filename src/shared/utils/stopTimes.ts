import type { DayPlan, FlightInfo, ItineraryStop } from '../../types'
import { parseAirportLocalTime } from '../../features/flight/utils/flightTime'

/** CDG immigration + baggage claim buffer before leaving the airport. */
export const CDG_EXIT_BUFFER_MINUTES = 60

const HM_RE = /^(\d{1,2}):(\d{2})$/
const PENDING_TIME = '待定'

/** Parse `HH:MM` (or `H:MM`) into minutes from midnight. */
export function parseHm(raw: string | undefined | null): number | null {
  if (!raw?.trim()) return null
  const m = raw.trim().match(HM_RE)
  if (!m) return null
  const hour = Number(m[1])
  const minute = Number(m[2])
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
  return hour * 60 + minute
}

export function formatHm(totalMinutes: number): string {
  const day = 24 * 60
  const m = ((Math.round(totalMinutes) % day) + day) % day
  const hour = Math.floor(m / 60)
  const minute = m % 60
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

/** Visit length from stop.duration text; falls back by place type. */
export function parseVisitMinutes(
  raw: string | undefined | null,
  fallback = 60,
): number {
  if (!raw?.trim()) return fallback
  const s = raw.trim()
  if (/全天|全日/.test(s)) return 8 * 60
  if (/过夜|入住/.test(s)) return 45

  const range = s.match(/(\d+)\s*[–\-~—至到]\s*(\d+)/)
  if (range) {
    const a = Number(range[1])
    const b = Number(range[2])
    if (Number.isFinite(a) && Number.isFinite(b)) return Math.round((a + b) / 2)
  }

  const hours = s.match(/(\d+(?:\.\d+)?)\s*小时/)
  if (hours) {
    const h = Number(hours[1])
    if (Number.isFinite(h) && h > 0) return Math.round(h * 60)
  }

  const mins = s.match(/(\d+)\s*分/)
  if (mins) {
    const m = Number(mins[1])
    if (Number.isFinite(m) && m > 0) return m
  }

  const bare = s.match(/^(\d{1,3})$/)
  if (bare) {
    const m = Number(bare[1])
    if (Number.isFinite(m) && m > 0) return m
  }

  return fallback
}

export function defaultVisitMinutes(placeType?: string | null): number {
  switch (placeType) {
    case 'cafe':
      return 45
    case 'restaurant':
      return 75
    case 'hotel':
      return 45
    case 'transport':
      return 30
    default:
      return 90
  }
}

function isSpecialScheduleTime(raw: string | undefined | null): boolean {
  if (!raw?.trim()) return false
  if (parseHm(raw) != null) return false
  return /按航班|倒推|待定/.test(raw)
}

/**
 * Paris-local arrival minutes from persisted FlightInfo (`to.actual` preferred).
 * Returns null when the schedule string cannot be parsed.
 */
export function extractParisArrivalMinutes(
  flight: FlightInfo | null | undefined,
): number | null {
  if (!flight) return null
  const raw = flight.to?.actual?.trim() || flight.to?.scheduled?.trim()
  if (!raw) return null

  const parsed = parseAirportLocalTime(raw)
  if (parsed) return parsed.hour * 60 + parsed.minute

  // Already-formatted or partial strings, e.g. `11月10日 11:15 (CET)` / `11:15`
  const loose = raw.match(/(\d{1,2}):(\d{2})/)
  if (!loose) return null
  const hour = Number(loose[1])
  const minute = Number(loose[2])
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
  return hour * 60 + minute
}

/**
 * Hotel check-in arrival ≈ flight arrive (Paris) + exit buffer + CDG→hotel transit.
 * Returns null when flight or transit is missing (caller keeps existing / 待定).
 */
export function computeDay1HotelArrivalHm(
  flight: FlightInfo | null | undefined,
  transitDurationSeconds: number | null | undefined,
  bufferMinutes: number = CDG_EXIT_BUFFER_MINUTES,
): string | null {
  const arrive = extractParisArrivalMinutes(flight)
  if (arrive == null) return null
  if (transitDurationSeconds == null || !Number.isFinite(transitDurationSeconds)) {
    return null
  }
  if (transitDurationSeconds <= 0) return null

  const transitMin = Math.max(1, Math.round(transitDurationSeconds / 60))
  return formatHm(arrive + bufferMinutes + transitMin)
}

/**
 * Set Day 1 first stop time to `hotelArrivalHm`.
 * Later stops that would fall before the new hotel time are shifted by the same
 * delta as the hotel move (preserves gaps for conflicted stops only).
 */
export function applyDay1HotelArrivalTimes(
  day: DayPlan,
  hotelArrivalHm: string,
): DayPlan {
  if (day.day !== 1 || !day.stops.length) return day

  const newFirst = parseHm(hotelArrivalHm)
  if (newFirst == null) return day

  const first = day.stops[0]
  if (first.time === hotelArrivalHm) {
    // Still cascade in case later stops lag behind a previously-set hotel time.
    const needsCascade = day.stops.slice(1).some((s) => {
      const t = parseHm(s.time)
      return t != null && t < newFirst
    })
    if (!needsCascade) return day
  }

  const oldFirst = parseHm(first.time)
  const shift =
    oldFirst != null && first.time !== PENDING_TIME ? newFirst - oldFirst : 0

  let changed = false
  const stops: ItineraryStop[] = day.stops.map((stop, index) => {
    if (index === 0) {
      if (stop.time === hotelArrivalHm) return stop
      changed = true
      return { ...stop, time: hotelArrivalHm }
    }
    const t = parseHm(stop.time)
    if (t == null || t >= newFirst) return stop
    let nextMinutes = shift !== 0 ? t + shift : newFirst + 30 * index
    // Keep a clear gap after hotel if a relative shift still lands too early.
    if (nextMinutes < newFirst) nextMinutes = newFirst + 30 * index
    const nextTime = formatHm(nextMinutes)
    if (nextTime === stop.time) return stop
    changed = true
    return { ...stop, time: nextTime }
  })

  return changed ? { ...day, stops } : day
}

export interface NavLegTiming {
  durationSeconds?: number | null
}

/**
 * Recompute each stop's clock time from an anchor + visit lengths + Google leg durations.
 * - Stop 0 uses `firstStopHm` when provided, else a sensible default / existing HH:MM.
 * - Stop i+1 arrives after visit(i) + travel(betweenStops[i]).
 * Special times like「按航班倒推」are left unchanged.
 */
export function recomputeDayStopTimes(
  day: DayPlan,
  opts: {
    betweenStops: Array<NavLegTiming | null | undefined>
    firstStopHm?: string | null
    defaultFirstHm?: string
    placeTypeAt?: (placeId: string) => string | null | undefined
  },
): DayPlan {
  if (!day.stops.length) return day

  const defaultFirst = parseHm(opts.defaultFirstHm || '10:00') ?? 10 * 60
  const forcedFirst = opts.firstStopHm ? parseHm(opts.firstStopHm) : null

  let cursor =
    forcedFirst ??
    (day.day === 1 ? parseHm(day.stops[0].time) : null) ??
    defaultFirst

  // Non-Day-1: always start the outing clock near 10:00 (hotel→first travel is shown above).
  if (forcedFirst == null && day.day !== 1) {
    cursor = defaultFirst
  }

  let changed = false
  const stops: ItineraryStop[] = day.stops.map((stop, index) => {
    if (isSpecialScheduleTime(stop.time)) {
      return stop
    }

    const nextTime = formatHm(cursor)
    if (nextTime !== stop.time) changed = true

    const placeType = opts.placeTypeAt?.(stop.placeId)
    const visit = parseVisitMinutes(
      stop.duration,
      defaultVisitMinutes(placeType),
    )

    const leg = opts.betweenStops[index]
    const travelSec = leg?.durationSeconds
    const travelMin =
      travelSec != null && Number.isFinite(travelSec) && travelSec > 0
        ? Math.max(1, Math.round(travelSec / 60))
        : index < day.stops.length - 1
          ? 15 // soft fallback between stops when nav missing
          : 0

    cursor = cursor + visit + travelMin
    return nextTime === stop.time ? stop : { ...stop, time: nextTime }
  })

  return changed ? { ...day, stops } : day
}
