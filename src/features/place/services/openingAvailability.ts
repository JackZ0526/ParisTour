/** Provider periods are local wall-clock times: do not convert the trip date to the browser timezone. */
export interface OpeningPoint { day?: number; hour?: number; minute?: number; date?: { year: number; month: number; day: number }; truncated?: boolean }
export interface OpeningHours { periods?: Array<{ open?: OpeningPoint; close?: OpeningPoint }>; weekdayDescriptions?: string[]; specialDays?: Array<{ date?: { year: number; month: number; day: number } }> }
export interface OpeningSchedule {
  regular?: OpeningHours
  current?: OpeningHours
  businessStatus?: string
  observedAt?: string
  utcOffsetMinutes?: number
}
export type Availability = 'open' | 'closed' | 'unknown'
const DAY = 1440, WEEK = DAY * 7
export function addCalendarDays(date: string, days: number): string {
  const value = Date.parse(`${date}T00:00:00Z`)
  return Number.isFinite(value) ? new Date(value + days * 86400000).toISOString().slice(0, 10) : ''
}
function dateNumber(date: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const n = Date.parse(`${date}T00:00:00Z`)
  return Number.isFinite(n) && new Date(n).toISOString().slice(0,10) === date ? n / 60000 : null
}
function pointDate(p: OpeningPoint): number | null {
  if (!p.date) return null
  return dateNumber(`${p.date.year}-${String(p.date.month).padStart(2,'0')}-${String(p.date.day).padStart(2,'0')}`)
}
function minute(p: OpeningPoint): number | null {
  const h = p.hour ?? 0, m = p.minute ?? 0
  return Number.isInteger(h) && h >= 0 && h < 24 && Number.isInteger(m) && m >= 0 && m < 60 ? h * 60 + m : null
}
/** Explicit empty periods means closed; absent or malformed data means unknown. */
export function openingAvailability(schedule: OpeningSchedule | undefined, date: string, time?: string, durationMinutes = 1): Availability {
  const dateMinutes = dateNumber(date)
  if (!schedule || dateMinutes == null) return 'unknown'
  if (schedule.businessStatus === 'CLOSED_PERMANENTLY' || schedule.businessStatus === 'CLOSED_TEMPORARILY') return 'closed'
  let hours = schedule.regular
  let current = false
  if (schedule.current && schedule.observedAt && schedule.utcOffsetMinutes != null) {
    const observed = Date.parse(schedule.observedAt) + schedule.utcOffsetMinutes * 60000
    if (Number.isFinite(observed)) {
      const start = dateNumber(new Date(observed).toISOString().slice(0,10))!
      if (dateMinutes >= start && dateMinutes < start + WEEK) { hours = schedule.current; current = true }
    }
  }
  if (!hours?.periods) return 'unknown'
  if (!hours.periods.length) return 'closed'
  const weekday = new Date(dateMinutes * 60000).getUTCDay()
  let start = current ? dateMinutes : weekday * DAY
  let end = start + DAY
  if (time != null) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(time)
    if (!match || +match[1] > 23 || +match[2] > 59 || !(durationMinutes > 0)) return 'unknown'
    start += +match[1] * 60 + +match[2]
    end = start + durationMinutes
  }
  let malformed = false
  for (const period of hours.periods) {
    const o = period.open, c = period.close
    if (!o || minute(o) == null) { malformed = true; continue }
    if (!c && o.day === 0 && minute(o) === 0 && !o.truncated) return 'open'
    if (!c || minute(c) == null) { malformed = true; continue }
    let from: number, to: number
    if (current) {
      const od = pointDate(o), cd = pointDate(c)
      if (od == null || cd == null) { malformed = true; continue }
      from = od + minute(o)!; to = cd + minute(c)!
    } else {
      if (o.day == null || c.day == null || o.day < 0 || o.day > 6 || c.day < 0 || c.day > 6) { malformed = true; continue }
      from = o.day * DAY + minute(o)!; to = c.day * DAY + minute(c)!
      if (to <= from) to += WEEK
    }
    for (const offset of current ? [0] : [-WEEK, 0, WEEK]) {
      if (time == null ? from + offset < end && to + offset > start : from + offset <= start && to + offset >= end) return 'open'
    }
  }
  return malformed ? 'unknown' : 'closed'
}

export function visitDurationMinutes(value?: string): number | undefined {
  if (!value) return undefined
  const text = value.trim().toLowerCase()
  if (/^\d+$/.test(text)) return +text || undefined
  const hours = /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h|小时|小時)/.exec(text)
  const minutes = /(\d+)\s*(?:minutes?|mins?|m(?![a-z])|分钟|分鐘)/.exec(text)
  if (!hours && !minutes) return undefined
  return (hours ? +hours[1] * 60 : 0) + (minutes ? +minutes[1] : 0) || undefined
}

/** Compact, language-neutral local intervals for the planner; null means unverified. */
export function openingWindows(schedule: OpeningSchedule | undefined, date: string): string[] | null {
  const state = openingAvailability(schedule, date)
  if (state === 'unknown') return null
  if (state === 'closed') return []
  const clock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  const windows: string[] = []
  let start: number | null = null
  for (let m = 0; m <= DAY; m++) {
    const open = m < DAY && openingAvailability(schedule, date, clock(m), 1) === 'open'
    if (open && start == null) start = m
    if (!open && start != null) { windows.push(`${clock(start)}–${clock(m)}`); start = null }
  }
  return windows
}
