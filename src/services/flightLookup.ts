import type { FlightInfo, FlightLegTemplate } from '../types'
import {
  clearCachedFlight,
  getCachedFlight,
  withFlightLookupLock,
} from './flightCache'
function normalizeFlightNumber(input: string): string {
  return input.replace(/\s+/g, '').toUpperCase()
}
export function templateToFlightInfo(template: FlightLegTemplate): FlightInfo {
  return {
    flightNumber: template.flightNumber,
    airline: template.airline,
    from: {
      code: template.from.code,
      city: template.from.city,
    },
    to: {
      code: template.to.code,
      city: template.to.city,
    },
    duration: template.duration,
    aircraft: template.aircraft,
    source: 'recommended',
    rawNote: template.notes,
  }
}
function asString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}
/** Strip trailing IATA type codes like "(359)" / "(77W)". */
function cleanAircraftName(raw: string): string {
  return raw.replace(/\s*\([A-Z0-9]{2,4}\)\s*$/i, '').trim()
}
/**
 * Future flights often only have "Scheduled" / "no live data" — not useful on the card.
 * Keep only meaningful operational status (delay, cancel, boarding, etc.).
 */
export function meaningfulFlightStatus(status?: string): string | undefined {
  const raw = status?.trim()
  if (!raw) return undefined
  const lower = raw.toLowerCase()
  const isGenericScheduled =
    /^(scheduled|计划|计划中|计划时刻|按时|准时|on\s*time|expected|unknown)$/i.test(raw) ||
    /\bfuture\s*flight\b/i.test(lower) ||
    /\blive\s*status\s*(not|unavailable|n\/a)\b/i.test(lower) ||
    /\bnot\s+yet\s+available\b/i.test(lower) ||
    /\bno\s+live\b/i.test(lower) ||
    /实时.{0,12}(不可|未|没有|暂无)/.test(raw) ||
    /暂无实时/.test(raw) ||
    /live\s*(tracking|data|info).{0,20}(not|unavailable|n\/a)/i.test(lower) ||
    /(gate|baggage|check-?in).{0,24}(not|unavailable|unknown|n\/a|暂无)/i.test(lower) ||
    /推荐班次/.test(raw)
  if (isGenericScheduled) return undefined
  return raw
}
export type FlightLookupDirection = 'outbound' | 'return'
export interface FlightTravelContext {
  /** Trip start date YYYY-MM-DD — outbound / 出发日 */
  startDate?: string | null
  /** Trip end date YYYY-MM-DD — return / 返程日 */
  endDate?: string | null
  /** Travel destination city name when known */
  destination?: string | null
  /** Which leg is being looked up */
  direction?: FlightLookupDirection
}
/** Date used for schedule lookup: 去程=出发日, 返程=返程日. */
export function resolveLookupDate(travel?: FlightTravelContext): string | null {
  if (travel?.direction === 'return') {
    return travel.endDate?.trim() || travel.startDate?.trim() || null
  }
  return travel?.startDate?.trim() || travel?.endDate?.trim() || null
}
// —— AeroDataBox mapping ——
type Json = Record<string, unknown>
function asObj(value: unknown): Json | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Json)
    : null
}
function pickLocalTime(movement: Json | null): string | undefined {
  if (!movement) return undefined
  const scheduled = asObj(movement.scheduledTime)
  const local =
    asString(scheduled?.local) ||
    asString(movement.scheduledTimeLocal) ||
    asString(movement.scheduledTime)
  return local?.trim() || undefined
}
function pickRevisedTime(movement: Json | null): string | undefined {
  if (!movement) return undefined
  const revised = asObj(movement.revisedTime)
  return (
    asString(revised?.local) ||
    asString(movement.actualTimeLocal) ||
    asString(movement.revisedTimeLocal) ||
    undefined
  )
}
function movementCompleteness(movement: Json | null): number {
  if (!movement) return 0
  let score = 0
  const airport = asObj(movement.airport)
  if (asString(airport?.iata) || asString(airport?.icao)) score += 2
  if (asString(airport?.name) || asString(airport?.municipalityName)) score += 1
  if (pickLocalTime(movement)) score += 4
  if (asString(movement.terminal)) score += 1
  return score
}
function mergeMovement(primary: unknown, secondary: unknown): Json | null {
  const a = asObj(primary)
  const b = asObj(secondary)
  if (!a && !b) return null
  if (!a) return b
  if (!b) return a
  if (movementCompleteness(b) > movementCompleteness(a)) {
    return {
      ...a,
      ...b,
      airport: { ...(asObj(a.airport) || {}), ...(asObj(b.airport) || {}) },
      scheduledTime: asObj(b.scheduledTime) || asObj(a.scheduledTime),
      terminal: asString(b.terminal) || asString(a.terminal),
    }
  }
  return {
    ...b,
    ...a,
    airport: { ...(asObj(b.airport) || {}), ...(asObj(a.airport) || {}) },
    scheduledTime: asObj(a.scheduledTime) || asObj(b.scheduledTime),
    terminal: asString(a.terminal) || asString(b.terminal),
  }
}
function airportFromMovement(movement: Json | null): FlightInfo['from'] {
  if (!movement) return undefined
  const airport = asObj(movement.airport)
  return {
    code: asString(airport?.iata) || asString(airport?.icao),
    name: asString(airport?.name),
    city: asString(airport?.municipalityName) || asString(airport?.shortName),
    terminal: asString(movement.terminal),
    scheduled: pickLocalTime(movement),
    actual: pickRevisedTime(movement),
    timeZone: asString(airport?.timeZone) || asString(airport?.timezone),
  }
}
function formatDurationMinutes(totalMin: number): string {
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h <= 0) return `${m}m`
  if (m <= 0) return `${h}h`
  return `${h}h ${String(m).padStart(2, '0')}m`
}
function durationFromFlight(flight: Json): string | undefined {
  const minutes = typeof flight.flightTime === 'number' ? flight.flightTime : undefined
  if (typeof minutes === 'number' && minutes > 0) {
    return formatDurationMinutes(minutes)
  }
  const dep = movementUtc(asObj(flight.departure))
  const arr = movementUtc(asObj(flight.arrival))
  if (dep != null && arr != null && arr > dep) {
    return formatDurationMinutes(Math.round((arr - dep) / 60000))
  }
  return undefined
}
function aircraftFromFlight(flight: Json): string | undefined {
  const aircraft = asObj(flight.aircraft)
  const model =
    asString(aircraft?.model) ||
    asString(aircraft?.shortModelName) ||
    asString(aircraft?.name)
  return model ? cleanAircraftName(model) : undefined
}
function airlineFromFlight(flight: Json): string | undefined {
  const airline = asObj(flight.airline)
  return asString(airline?.name) || asString(airline?.iata)
}
function flightNumberFromFlight(flight: Json, fallback: string): string {
  const number = asObj(flight.number)
  return (
    asString(number?.iata) ||
    asString(number?.default) ||
    asString(flight.number) ||
    fallback
  )
}
function scoreSegment(flight: Json, direction?: FlightLookupDirection): number {
  const dep = asString(asObj(asObj(flight.departure)?.airport)?.iata)?.toUpperCase()
  const arr = asString(asObj(asObj(flight.arrival)?.airport)?.iata)?.toUpperCase()
  let score = 0
  if (direction === 'outbound') {
    if (dep === 'YVR') score += 3
    if (arr === 'CDG' || arr === 'ORY') score += 3
  } else if (direction === 'return') {
    if (dep === 'CDG' || dep === 'ORY') score += 3
    if (arr === 'YVR') score += 3
  }
  if (pickLocalTime(asObj(flight.departure)) && pickLocalTime(asObj(flight.arrival))) {
    score += 1
  }
  return score
}
/**
 * AeroDataBox sometimes returns two partial rows for one flight (dep-only + arr-only).
 * Merge them into a single usable schedule.
 */
function mergeFlightRecords(
  flights: Json[],
  direction?: FlightLookupDirection,
): Json | null {
  if (!flights.length) return null
  const sorted = [...flights].sort(
    (a, b) => scoreSegment(b, direction) - scoreSegment(a, direction),
  )
  const base: Json = { ...sorted[0] }
  for (const other of sorted.slice(1)) {
    base.departure = mergeMovement(base.departure, other.departure)
    base.arrival = mergeMovement(base.arrival, other.arrival)
    if (!aircraftFromFlight(base) && aircraftFromFlight(other)) {
      base.aircraft = other.aircraft
    }
    if (!airlineFromFlight(base) && airlineFromFlight(other)) {
      base.airline = other.airline
    }
    if (!base.greatCircleDistance && other.greatCircleDistance) {
      base.greatCircleDistance = other.greatCircleDistance
    }
  }
  return base
}
/** Marketing codeshares → known operating flights on YVR↔CDG (fallback aliases). */
const OPERATING_FLIGHT_ALIASES: Record<string, string> = {
  DL8676: 'AF375',
  DL8675: 'AF374',
  KL6823: 'AF375',
  KL6822: 'AF374',
}
function operatingFlightCandidates(flightNumber: string): string[] {
  const iata = normalizeFlightNumber(flightNumber)
  const alias = OPERATING_FLIGHT_ALIASES[iata]
  return alias && alias !== iata ? [iata, alias] : [iata]
}

function splitFlightNumber(flightNumber: string): { airline: string; number: string } | null {
  const iata = normalizeFlightNumber(flightNumber)
  const m = iata.match(/^([A-Z0-9]{2})(\d{1,4})([A-Z]?)$/)
  if (!m) return null
  return { airline: m[1], number: `${Number(m[2])}${m[3] || ''}` }
}

function normalizeFlightDigits(num: string): string {
  const m = num.trim().toUpperCase().match(/^0*(\d+)([A-Z]?)$/)
  if (!m) return num.trim().toUpperCase()
  return `${Number(m[1])}${m[2] || ''}`
}

function toCompactFlightId(airline: string, number: string): string {
  return `${airline.trim().toUpperCase()}${normalizeFlightDigits(number)}`
}

const AIRPORT_TZ: Record<string, string> = {
  YVR: 'America/Vancouver',
  CDG: 'Europe/Paris',
  ORY: 'Europe/Paris',
}

function toYyyymmdd(isoDate: string): string {
  return isoDate.replace(/-/g, '')
}

function formatOffsetForDisplay(offset: string | undefined): string {
  if (!offset) return ''
  const m = offset.trim().match(/^([+-])(\d{2}):?(\d{2})$/)
  if (!m) return ''
  return `${m[1]}${m[2]}:${m[3]}`
}

/** Build `YYYY-MM-DD HH:mm±HH:mm` for formatAirportLocalTime. */
function localScheduledDisplay(dateTime: string | undefined, offset: string | undefined): string | undefined {
  if (!dateTime) return undefined
  const m = dateTime.trim().match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/)
  if (!m) return undefined
  const off = formatOffsetForDisplay(offset)
  return off ? `${m[1]} ${m[2]}${off}` : `${m[1]} ${m[2]}`
}

function durationFromIso8601(raw?: string): string | undefined {
  if (!raw) return undefined
  const m = raw.trim().match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i)
  if (!m) return undefined
  const h = Number(m[1] || 0)
  const min = Number(m[2] || 0)
  if (!h && !min) return undefined
  return formatDurationMinutes(h * 60 + min)
}

function routesForDirection(direction?: FlightLookupDirection): Array<[string, string]> {
  if (direction === 'return') {
    return [
      ['CDG', 'YVR'],
      ['ORY', 'YVR'],
    ]
  }
  return [
    ['YVR', 'CDG'],
    ['YVR', 'ORY'],
  ]
}

type TimetableLeg = {
  marketingAirline: string
  marketingNumber: string
  marketingName?: string
  operatingAirline?: string
  operatingNumber?: string
  operatingName?: string
  depCode: string
  arrCode: string
  depName?: string
  arrName?: string
  depTerminal?: string
  arrTerminal?: string
  depDateTime?: string
  arrDateTime?: string
  depOffset?: string
  arrOffset?: string
  duration?: string
  aircraft?: string
  flightType?: string
}

function attr(el: Element | null | undefined, name: string): string | undefined {
  if (!el) return undefined
  const v = el.getAttribute(name)?.trim()
  return v || undefined
}

function firstChild(el: Element, tag: string): Element | null {
  return el.getElementsByTagName(tag)[0] || null
}

function parseTimetableXml(xml: string): TimetableLeg[] {
  if (/FLSWarningName\s*=\s*"No flights found"/i.test(xml) || /No flights found/i.test(xml)) {
    return []
  }
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  if (doc.querySelector('parsererror')) {
    throw new Error('TimeTable 返回的 XML 无法解析')
  }
  const details = Array.from(doc.getElementsByTagName('FlightDetails'))
  const legs: TimetableLeg[] = []
  for (const detail of details) {
    const flightLegs = Array.from(detail.getElementsByTagName('FlightLegDetails'))
    // Prefer nonstop / single-leg rows that match origin→destination on the detail
    const candidates =
      flightLegs.length === 1
        ? flightLegs
        : flightLegs.filter((leg) => {
            const dep = attr(firstChild(leg, 'DepartureAirport'), 'LocationCode')
            const arr = attr(firstChild(leg, 'ArrivalAirport'), 'LocationCode')
            return (
              dep === attr(detail, 'FLSDepartureCode') &&
              arr === attr(detail, 'FLSArrivalCode')
            )
          })
    const chosen = candidates[0] || flightLegs[0]
    if (!chosen) continue
    const marketing = firstChild(chosen, 'MarketingAirline')
    const operating = firstChild(chosen, 'OperatingAirline')
    const depAirport = firstChild(chosen, 'DepartureAirport')
    const arrAirport = firstChild(chosen, 'ArrivalAirport')
    const equipment = firstChild(chosen, 'Equipment')
    const marketingAirline = attr(marketing, 'Code')
    const marketingNumber = attr(chosen, 'FlightNumber')
    if (!marketingAirline || !marketingNumber) continue
    legs.push({
      marketingAirline,
      marketingNumber,
      marketingName: attr(marketing, 'CompanyShortName'),
      operatingAirline: attr(operating, 'Code'),
      operatingNumber: attr(operating, 'FlightNumber'),
      operatingName: attr(operating, 'CompanyShortName'),
      depCode: attr(depAirport, 'LocationCode') || attr(detail, 'FLSDepartureCode') || '',
      arrCode: attr(arrAirport, 'LocationCode') || attr(detail, 'FLSArrivalCode') || '',
      depName: attr(depAirport, 'FLSLocationName') || attr(detail, 'FLSDepartureName'),
      arrName: attr(arrAirport, 'FLSLocationName') || attr(detail, 'FLSArrivalName'),
      depTerminal: attr(depAirport, 'Terminal')?.trim() || undefined,
      arrTerminal: attr(arrAirport, 'Terminal')?.trim() || undefined,
      depDateTime: attr(chosen, 'DepartureDateTime') || attr(detail, 'FLSDepartureDateTime'),
      arrDateTime: attr(chosen, 'ArrivalDateTime') || attr(detail, 'FLSArrivalDateTime'),
      depOffset: attr(chosen, 'FLSDepartureTimeOffset') || attr(detail, 'FLSDepartureTimeOffset'),
      arrOffset: attr(chosen, 'FLSArrivalTimeOffset') || attr(detail, 'FLSArrivalTimeOffset'),
      duration:
        durationFromIso8601(attr(chosen, 'JourneyDuration')) ||
        durationFromIso8601(attr(detail, 'TotalFlightTime')) ||
        durationFromIso8601(attr(detail, 'TotalTripTime')),
      aircraft: attr(equipment, 'AirEquipType'),
      flightType: attr(detail, 'FLSFlightType'),
    })
  }
  return legs
}

function scoreTimetableMatch(leg: TimetableLeg, want: string): number {
  const marketingId = toCompactFlightId(leg.marketingAirline, leg.marketingNumber)
  const operatingId =
    leg.operatingAirline && leg.operatingNumber
      ? toCompactFlightId(leg.operatingAirline, leg.operatingNumber)
      : null
  let score = 0
  if (marketingId === want) score += 10
  if (operatingId === want) score += 8
  if (leg.flightType?.toLowerCase() === 'nonstop') score += 2
  if (leg.depDateTime && leg.arrDateTime) score += 1
  return score
}

function pickMatchingTimetableLeg(legs: TimetableLeg[], flightNumber: string): TimetableLeg | null {
  const want = normalizeFlightNumber(flightNumber)
  const ranked = legs
    .map((leg) => ({ leg, score: scoreTimetableMatch(leg, want) }))
    .filter((x) => x.score >= 8)
    .sort((a, b) => b.score - a.score)
  return ranked[0]?.leg || null
}

function mapTimetableLeg(leg: TimetableLeg, displayFlightNumber: string): FlightInfo {
  const display = normalizeFlightNumber(displayFlightNumber)
  const marketingId = toCompactFlightId(leg.marketingAirline, leg.marketingNumber)
  const operatingId =
    leg.operatingAirline && leg.operatingNumber
      ? toCompactFlightId(leg.operatingAirline, leg.operatingNumber)
      : null
  const airlineName = leg.marketingName || leg.operatingName || leg.marketingAirline
  const operatedNote =
    operatingId && operatingId !== display
      ? `实际承运 ${operatingId}${leg.operatingName ? `（${leg.operatingName}）` : ''}`
      : marketingId !== display && marketingId
        ? `时刻表班次 ${marketingId}`
        : null
  return {
    flightNumber: display,
    airline:
      operatingId && operatingId !== display && airlineName
        ? `${airlineName}（票面 ${display}）`
        : airlineName,
    from: {
      code: leg.depCode || undefined,
      name: leg.depName,
      city:
        leg.depCode === 'YVR'
          ? 'Vancouver'
          : leg.depCode === 'CDG' || leg.depCode === 'ORY'
            ? 'Paris'
            : undefined,
      terminal: leg.depTerminal,
      scheduled: localScheduledDisplay(leg.depDateTime, leg.depOffset),
      timeZone: AIRPORT_TZ[leg.depCode],
    },
    to: {
      code: leg.arrCode || undefined,
      name: leg.arrName,
      city:
        leg.arrCode === 'YVR'
          ? 'Vancouver'
          : leg.arrCode === 'CDG' || leg.arrCode === 'ORY'
            ? 'Paris'
            : undefined,
      terminal: leg.arrTerminal,
      scheduled: localScheduledDisplay(leg.arrDateTime, leg.arrOffset),
      timeZone: AIRPORT_TZ[leg.arrCode],
    },
    duration: leg.duration,
    aircraft: leg.aircraft ? cleanAircraftName(leg.aircraft) : undefined,
    source: 'timetable',
    rawNote: [
      '计划时刻来自 TimeTable Lookup（可能与 Expedia 等订票站不完全一致）',
      operatedNote,
      '请以机票为准',
    ]
      .filter(Boolean)
      .join(' · '),
  }
}

async function fetchTimetableXml(
  origin: string,
  destination: string,
  yyyymmdd: string,
  query?: Record<string, string>,
): Promise<string> {
  const params = new URLSearchParams({
    CodeShare: 'Y',
    TRC: 'N',
    Connection: 'NONSTOP',
    ...query,
  })
  const path = `/api/timetable-lookup/TimeTable/${encodeURIComponent(origin)}/${encodeURIComponent(destination)}/${encodeURIComponent(yyyymmdd)}/?${params.toString()}`
  const { authFetch } = await import('./authFetch')
  const res = await authFetch(path)
  const text = await res.text().catch(() => '')
  if (!res.ok) {
    throw new Error(
      `TimeTable 查询失败 (${res.status})${text ? `: ${text.slice(0, 120)}` : ''}`,
    )
  }
  return text
}

async function lookupFlightViaTimeTable(
  flightNumber: string,
  lookupDate: string,
  direction?: FlightLookupDirection,
): Promise<FlightInfo> {
  const dateKey = toYyyymmdd(lookupDate)
  if (!/^\d{8}$/.test(dateKey)) {
    throw new Error('行程日期格式无效')
  }
  const candidates = operatingFlightCandidates(flightNumber)
  const routes = routesForDirection(direction)
  let lastError: Error | null = null

  // 1) Targeted Airline+FlightNumber (best for codeshares like DL8676 → AF375)
  for (const candidate of candidates) {
    const parts = splitFlightNumber(candidate)
    if (!parts) continue
    for (const [origin, destination] of routes) {
      try {
        const xml = await fetchTimetableXml(origin, destination, dateKey, {
          Airline: parts.airline,
          FlightNumber: parts.number,
        })
        const match = pickMatchingTimetableLeg(parseTimetableXml(xml), candidate)
        if (!match) continue
        const mapped = mapTimetableLeg(match, flightNumber)
        if (!mapped.from?.scheduled || !mapped.to?.scheduled) {
          throw new Error('TimeTable 返回的计划起降时间不完整')
        }
        return mapped
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e))
      }
    }
  }

  // 2) Broad NONSTOP route scan — match marketing or operating number in XML
  for (const [origin, destination] of routes) {
    try {
      const xml = await fetchTimetableXml(origin, destination, dateKey, { Count: '100' })
      const legs = parseTimetableXml(xml)
      for (const candidate of candidates) {
        const match = pickMatchingTimetableLeg(legs, candidate)
        if (!match) continue
        const mapped = mapTimetableLeg(match, flightNumber)
        if (!mapped.from?.scheduled || !mapped.to?.scheduled) {
          throw new Error('TimeTable 返回的计划起降时间不完整')
        }
        return mapped
      }
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e))
    }
  }

  throw (
    lastError ||
    new Error(
      `未在 TimeTable 找到 ${flightNumber}（${lookupDate}，航线 ${routes.map((r) => r.join('→')).join(' / ')}）`,
    )
  )
}
function mapAeroDataBoxFlight(
  flight: Json,
  displayFlightNumber: string,
  operatingNumber?: string,
): FlightInfo {
  const operating = operatingNumber
    ? normalizeFlightNumber(operatingNumber)
    : normalizeFlightNumber(flightNumberFromFlight(flight, displayFlightNumber))
  const display = normalizeFlightNumber(displayFlightNumber)
  const airline = airlineFromFlight(flight)
  const operatedNote =
    operating && operating !== display
      ? `实际承运 ${operating}${airline ? `（${airline}）` : ''}`
      : null
  return {
    flightNumber: display,
    airline:
      operating !== display && airline
        ? `${airline}（票面 ${display}）`
        : airline,
    status: meaningfulFlightStatus(asString(flight.status)),
    from: airportFromMovement(asObj(flight.departure)),
    to: airportFromMovement(asObj(flight.arrival)),
    duration: durationFromFlight(flight),
    aircraft: aircraftFromFlight(flight),
    source: 'aerodatabox',
    rawNote: [
      '计划时刻来自 AeroDataBox（可能与 Expedia 等订票站不完全一致）',
      operatedNote,
      '请以机票为准',
    ]
      .filter(Boolean)
      .join(' · '),
  }
}
function parseApiUtc(raw?: string): number | null {
  if (!raw) return null
  const normalized = raw.trim().replace(' ', 'T')
  const withZ = /Z$/i.test(normalized) || /[+-]\d{2}:\d{2}$/.test(normalized)
    ? normalized
    : `${normalized}Z`
  const ms = Date.parse(withZ)
  return Number.isFinite(ms) ? ms : null
}

function localDatePrefix(local?: string): string | null {
  if (!local) return null
  const m = local.trim().match(/^(\d{4}-\d{2}-\d{2})/)
  return m?.[1] || null
}

function addDaysIso(isoDate: string, delta: number): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + delta)
  return dt.toISOString().slice(0, 10)
}

function movementUtc(movement: Json | null): number | null {
  if (!movement) return null
  return (
    parseApiUtc(asString(asObj(movement.scheduledTime)?.utc)) ||
    parseApiUtc(asString(movement.scheduledTimeUtc))
  )
}

function isChronological(flight: Json): boolean {
  const dep = movementUtc(asObj(flight.departure))
  const arr = movementUtc(asObj(flight.arrival))
  if (dep == null || arr == null) return false
  return arr > dep
}

function recordFreshness(flight: Json): number {
  return parseApiUtc(asString(flight.lastUpdatedUtc)) || 0
}

/**
 * Prefer a single complete AeroDataBox row (dep+arr, chronological).
 * Only merge partials when no complete row exists, and never keep arr-before-dep frankenstein.
 */
function selectFlightRecord(
  flights: Json[],
  lookupDate: string,
  direction?: FlightLookupDirection,
): Json | null {
  const complete = flights
    .filter((f) => pickLocalTime(asObj(f.departure)) && pickLocalTime(asObj(f.arrival)))
    .filter(isChronological)
    .filter((f) => {
      const depDay = localDatePrefix(pickLocalTime(asObj(f.departure)) || undefined)
      return !depDay || depDay === lookupDate
    })
    .sort((a, b) => {
      const fresh = recordFreshness(b) - recordFreshness(a)
      if (fresh) return fresh
      return scoreSegment(b, direction) - scoreSegment(a, direction)
    })

  if (complete.length) return complete[0]

  // Last resort: merge partials but drop result if timeline is impossible
  const merged = mergeFlightRecords(flights, direction)
  if (merged && isChronological(merged)) return merged
  return complete[0] || merged
}

async function fetchAeroDataBoxRaw(
  flightNumber: string,
  lookupDate: string,
): Promise<Json[]> {
  // Date-range endpoint returns complete overnight legs; single-day often splits dep/arr.
  const from = addDaysIso(lookupDate, -1)
  const to = addDaysIso(lookupDate, 1)
  const path = `/api/aerodatabox/flights/Number/${encodeURIComponent(flightNumber)}/${encodeURIComponent(from)}/${encodeURIComponent(to)}?withAircraftImage=false&withLocation=false`
  const { authFetch } = await import('./authFetch')
  const res = await authFetch(path)
  if (res.status === 204 || res.status === 404) {
    return []
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(
      `AeroDataBox 查询失败 (${res.status})${text ? `: ${text.slice(0, 120)}` : ''}`,
    )
  }
  const data: unknown = await res.json()
  const list = Array.isArray(data)
    ? data.filter((x): x is Json => Boolean(asObj(x)))
    : asObj(data)
      ? [data as Json]
      : []

  // Keep rows that depart on the requested local date (or have no dep date yet).
  const onDay = list.filter((f) => {
    const depDay = localDatePrefix(pickLocalTime(asObj(f.departure)) || undefined)
    return !depDay || depDay === lookupDate
  })
  return onDay.length ? onDay : list
}
/** Optional RapidAPI fallback (kept for future use; primary path is TimeTable). */
export async function lookupFlightViaAeroDataBox(
  flightNumber: string,
  lookupDate: string,
  direction?: FlightLookupDirection,
): Promise<FlightInfo> {
  const candidates = operatingFlightCandidates(flightNumber)
  let lastList: Json[] = []
  let usedNumber = candidates[0]
  for (const candidate of candidates) {
    const list = await fetchAeroDataBoxRaw(candidate, lookupDate)
    if (list.length) {
      lastList = list
      usedNumber = candidate
      break
    }
  }
  const best = selectFlightRecord(lastList, lookupDate, direction)
  if (!best) {
    throw new Error(
      `未找到 ${flightNumber} 在 ${lookupDate} 的计划时刻（已尝试：${candidates.join('、')}）`,
    )
  }
  const mapped = mapAeroDataBoxFlight(
    best,
    flightNumber,
    usedNumber !== normalizeFlightNumber(flightNumber) ? usedNumber : undefined,
  )
  if (!mapped.from?.scheduled || !mapped.to?.scheduled) {
    throw new Error('AeroDataBox 返回的计划起降时间不完整')
  }
  return mapped
}
/**
 * Lookup flight schedule by IATA number via TimeTable Lookup only.
 * Same flight+date is served from local cache when times are complete.
 */
export async function lookupFlight(
  flightNumber: string,
  travel?: FlightTravelContext,
  options?: { forceRefresh?: boolean },
): Promise<FlightInfo> {
  const iata = normalizeFlightNumber(flightNumber)
  if (!/^[A-Z0-9]{2}\d{1,4}[A-Z]?$/.test(iata)) {
    throw new Error('请输入有效航班号，例如 AF375 或 AF374')
  }
  const lookupDate = resolveLookupDate(travel)
  if (!lookupDate) {
    throw new Error('请先选择行程日期，再查询航班计划时刻')
  }
  if (options?.forceRefresh) {
    clearCachedFlight(iata, lookupDate)
  } else {
    const cached = getCachedFlight(iata, lookupDate)
    if (cached) return cached
  }
  return withFlightLookupLock(iata, lookupDate, async () => {
    return lookupFlightViaTimeTable(iata, lookupDate, travel?.direction)
  })
}
/**
 * Route fallback without LLM: for CDG→YVR prefer AF374 schedule on the return date.
 */
export async function lookupRouteFlight(
  depIata: string,
  arrIata: string,
  preferAirline = 'AF',
  travel?: FlightTravelContext,
  options?: { forceRefresh?: boolean },
): Promise<FlightInfo> {
  const dep = depIata.trim().toUpperCase()
  const arr = arrIata.trim().toUpperCase()
  let fallbackNumber = `${preferAirline}?`
  if (dep === 'YVR' && (arr === 'CDG' || arr === 'ORY')) {
    fallbackNumber = 'AF375'
  } else if ((dep === 'CDG' || dep === 'ORY') && arr === 'YVR') {
    fallbackNumber = 'AF374'
  } else {
    throw new Error(`暂不支持按航线 ${dep}→${arr} 自动查询，请直接输入航班号`)
  }
  return lookupFlight(fallbackNumber, travel, options)
}
