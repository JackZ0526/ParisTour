/**
 * Format airport-local times (TimeTable / AeroDataBox) for flight cards.
 * Prefer wall-clock from the local string; abbreviation from IANA zone / offset.
 */

const IATA_TIMEZONES: Record<string, string> = {
  YVR: 'America/Vancouver',
  CDG: 'Europe/Paris',
  ORY: 'Europe/Paris',
  LBG: 'Europe/Paris',
}

export type ParsedAirportLocal = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  /** Offset from UTC in minutes (e.g. -480 for PST). Null if absent. */
  offsetMinutes: number | null
  /** Instant when offset is known; otherwise null. */
  instant: Date | null
}

/**
 * Parse forms like:
 * - `2026-11-09 14:35-08:00`
 * - `2026-11-09T14:35:00-07:00`
 * - `2026-11-10 11:15+01:00`
 * - `2026-11-09 14:35` (no offset)
 */
export function parseAirportLocalTime(raw: string): ParsedAirportLocal | null {
  const s = raw.trim()
  const m = s.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|([+-])(\d{2}):?(\d{2}))?$/i,
  )
  if (!m) return null

  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  const hour = Number(m[4])
  const minute = Number(m[5])
  if (![year, month, day, hour, minute].every((n) => Number.isFinite(n))) return null

  let offsetMinutes: number | null = null
  let instant: Date | null = null

  if (m[7] && /^Z$/i.test(m[7])) {
    offsetMinutes = 0
  } else if (m[8] && m[9] && m[10]) {
    const sign = m[8] === '-' ? -1 : 1
    offsetMinutes = sign * (Number(m[9]) * 60 + Number(m[10]))
  }

  if (offsetMinutes != null) {
    const abs = Math.abs(offsetMinutes)
    const off =
      offsetMinutes === 0
        ? 'Z'
        : `${offsetMinutes < 0 ? '-' : '+'}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`
    const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] || '00'}${off}`
    const ms = Date.parse(iso)
    if (Number.isFinite(ms)) instant = new Date(ms)
  }

  return { year, month, day, hour, minute, offsetMinutes, instant }
}

function resolveTimeZone(
  timeZone?: string | null,
  airportCode?: string | null,
): string | undefined {
  const fromApi = timeZone?.trim()
  if (fromApi) return fromApi
  const code = airportCode?.trim().toUpperCase()
  if (code && IATA_TIMEZONES[code]) return IATA_TIMEZONES[code]
  return undefined
}

function isNamedAbbr(name: string): boolean {
  // Prefer PST/PDT/CET/CEST over GMT-8 / UTC+1
  return /^[A-Z]{2,5}$/i.test(name)
}

function abbreviateTimeZone(instant: Date, timeZone: string): string | undefined {
  // ICU locale data differs: en-US → PST/PDT for Vancouver; en-GB → CET/CEST for Paris.
  const candidates: string[] = []
  for (const locale of ['en-US', 'en-GB']) {
    try {
      const name = new Intl.DateTimeFormat(locale, {
        timeZone,
        timeZoneName: 'short',
      })
        .formatToParts(instant)
        .find((p) => p.type === 'timeZoneName')?.value?.trim()
      if (name) candidates.push(name)
    } catch {
      // ignore unsupported locale/zone
    }
  }
  return candidates.find(isNamedAbbr) || candidates[0]
}

function offsetLabel(offsetMinutes: number): string {
  const sign = offsetMinutes <= 0 ? '-' : '+'
  const abs = Math.abs(offsetMinutes)
  const h = Math.floor(abs / 60)
  const m = abs % 60
  if (m === 0) return `UTC${sign}${h}`
  return `UTC${sign}${h}:${String(m).padStart(2, '0')}`
}

/**
 * Airport-local display, e.g. `11月9日 14:35 (PST)` / `11月10日 11:15 (CET)`.
 * Uses the calendar date embedded in the local string (arrival next day stays next day).
 * Unparseable / already-formatted strings are returned trimmed for cache compatibility.
 */
export function formatAirportLocalTime(
  raw?: string | null,
  opts?: {
    timeZone?: string | null
    airportCode?: string | null
    city?: string | null
    /** Append `· {city}当地` when city is known */
    withCityHint?: boolean
  },
): string {
  if (!raw?.trim()) return '—'
  const parsed = parseAirportLocalTime(raw)
  if (!parsed) return raw.trim()

  const tz = resolveTimeZone(opts?.timeZone, opts?.airportCode)
  let abbr: string | undefined

  if (tz && parsed.instant) {
    abbr = abbreviateTimeZone(parsed.instant, tz)
  } else if (tz) {
    // No offset on string — still try abbr at noon local via constructed UTC guess
    const guess = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day, 12, 0))
    abbr = abbreviateTimeZone(guess, tz)
  }

  if (!abbr && parsed.offsetMinutes != null) {
    abbr = offsetLabel(parsed.offsetMinutes)
  }

  const dateLabel = `${parsed.month}月${parsed.day}日`
  const timeLabel = `${String(parsed.hour).padStart(2, '0')}:${String(parsed.minute).padStart(2, '0')}`
  const base = abbr ? `${dateLabel} ${timeLabel} (${abbr})` : `${dateLabel} ${timeLabel}`

  if (opts?.withCityHint && opts.city?.trim()) {
    return `${base} · ${opts.city.trim()}当地`
  }
  return base
}
