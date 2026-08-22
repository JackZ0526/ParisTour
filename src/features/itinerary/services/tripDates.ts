export interface TripDateRange {
  startDate: string // YYYY-MM-DD
  endDate: string
}

const STORAGE_KEY = 'paris-tour-dates-v1'

export function loadTripDates(): TripDateRange | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as TripDateRange
    if (!parsed?.startDate || !parsed?.endDate) return null
    return parsed
  } catch {
    return null
  }
}

export function saveTripDates(range: TripDateRange | null) {
  try {
    if (!range?.startDate || !range?.endDate) {
      localStorage.removeItem(STORAGE_KEY)
      return
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(range))
  } catch {
    /* ignore */
  }
}

/** Add calendar days to a YYYY-MM-DD string (UTC-safe via local noon). */
export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00`)
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function daysBetween(startDate: string, endDate: string): number {
  const a = new Date(`${startDate}T12:00:00`).getTime()
  const b = new Date(`${endDate}T12:00:00`).getTime()
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0
  return Math.round((b - a) / 86400000) + 1
}

/** ISO date compare (YYYY-MM-DD); invalid → null. */
function isoTime(isoDate: string): number | null {
  const t = new Date(`${isoDate}T12:00:00`).getTime()
  return Number.isNaN(t) ? null : t
}

/**
 * Clamp a calendar day into [minDate, maxDate]. If date is after max, use max;
 * if before min, use min.
 */
export function clampIsoDate(isoDate: string, minDate: string, maxDate: string): string {
  const t = isoTime(isoDate)
  const minT = isoTime(minDate)
  const maxT = isoTime(maxDate)
  if (t == null) return minDate
  if (minT != null && t < minT) return minDate
  if (maxT != null && t > maxT) return maxDate
  return isoDate
}

/**
 * Inclusive daytime count for the itinerary: from Day-1 calendar date through trip endDate.
 * If start is after end (bad data), clamps to 1 day on endDate.
 */
export function itineraryDayCount(
  itineraryStartDate: string | null | undefined,
  endDate: string | null | undefined,
): number {
  if (!endDate) return 0
  const start = itineraryStartDate || endDate
  const startT = isoTime(start)
  const endT = isoTime(endDate)
  if (startT == null || endT == null) return 0
  if (startT > endT) return 1
  return Math.max(1, daysBetween(start, endDate))
}

/** Hotel / overnight nights for N daytime days. */
export function nightsFromDayCount(dayCount: number): number {
  return Math.max(0, dayCount - 1)
}

import { getLocale, type Locale } from '../../../shared/i18n'

const MONTH_NAMES_EN = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

/** e.g. 「6个白天 · 5晚」 or 「6 Days · 5 Nights」 */
export function formatDayNightLabel(dayCount: number, locale: Locale = getLocale()): string {
  const n = Math.max(0, dayCount)
  const nights = nightsFromDayCount(n)
  if (locale === 'en') {
    return `${n} ${n === 1 ? 'Day' : 'Days'} · ${nights} ${nights === 1 ? 'Night' : 'Nights'}`
  }
  return `${n}个白天 · ${nights}晚`
}

/** Format for UI, e.g. 9月15日 or Sep 15 */
export function formatTripDayLabel(isoDate: string, locale: Locale = getLocale()): string {
  const d = new Date(`${isoDate}T12:00:00`)
  if (Number.isNaN(d.getTime())) return isoDate
  if (locale === 'en') {
    return `${MONTH_NAMES_EN[d.getMonth()]} ${d.getDate()}`
  }
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

/** Calendar date for itinerary day N (1-based) from itinerary start. */
export function dateForTripDay(startDate: string | undefined, dayNumber: number): string | null {
  if (!startDate) return null
  return addDays(startDate, dayNumber - 1)
}
