import type { FlightInfo, FlightLegTemplate } from '../types'
import {
  extractLlmJsonObject,
  isLlmConfigured,
  openaiResponsesWithWebSearch,
} from './llm'
import { memoizeLlmCall } from './llmMemo'

/** Your AviationStack access key */
export const AVIATIONSTACK_API_KEY = '4ac8bfff8df177e9d912defdd239f699'

function normalizeFlightNumber(input: string): string {
  return input.replace(/\s+/g, '').toUpperCase()
}

function minutesBetween(dep?: string, arr?: string): string | undefined {
  if (!dep || !arr) return undefined
  const a = Date.parse(dep)
  const b = Date.parse(arr)
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return undefined
  const mins = Math.round((b - a) / 60000)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `约 ${h} 小时 ${m} 分`
}

/** AviationStack often labels local airport times with a misleading +00:00 offset. */
export function formatAirportTime(iso?: string, timezone?: string): string {
  if (!iso) return '—'
  const m = iso.match(/(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/)
  if (m) {
    const tz = timezone ? ` · ${timezone}` : ''
    return `${m[1]} ${m[2]}${tz}`
  }
  const d = Date.parse(iso)
  if (Number.isNaN(d)) return iso
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d)
}

export function templateToFlightInfo(template: FlightLegTemplate): FlightInfo {
  return {
    flightNumber: template.flightNumber,
    airline: template.airline,
    status: '推荐班次（加载中…）',
    from: {
      code: template.from.code,
      city: template.from.city,
      scheduled: template.departLocal,
    },
    to: {
      code: template.to.code,
      city: template.to.city,
      scheduled: template.arriveLocal,
    },
    duration: template.duration,
    aircraft: template.aircraft,
    source: 'recommended',
    rawNote: template.notes,
  }
}

export function getAviationStackKey(): string {
  return (import.meta.env.VITE_AVIATIONSTACK_KEY || AVIATIONSTACK_API_KEY).trim()
}

type AviationStackFlight = {
  flight_date?: string
  flight_status?: string
  departure?: {
    airport?: string
    timezone?: string
    iata?: string
    terminal?: string
    gate?: string
    delay?: number | null
    scheduled?: string
    estimated?: string
    actual?: string
  }
  arrival?: {
    airport?: string
    timezone?: string
    iata?: string
    terminal?: string
    gate?: string
    baggage?: string
    delay?: number | null
    scheduled?: string
    estimated?: string
    actual?: string
  }
  airline?: { name?: string; iata?: string }
  flight?: { iata?: string; number?: string }
  aircraft?: { iata?: string; registration?: string; icao?: string }
}

type AviationStackResponse = {
  data?: AviationStackFlight[]
  error?: { message?: string; code?: string; info?: string }
}

function pickBestFlight(rows: AviationStackFlight[]): AviationStackFlight | undefined {
  if (!rows.length) return undefined
  const rank = (status?: string) => {
    switch (status) {
      case 'active':
        return 0
      case 'scheduled':
        return 1
      case 'landed':
        return 2
      default:
        return 3
    }
  }
  return [...rows].sort((a, b) => {
    const byStatus = rank(a.flight_status) - rank(b.flight_status)
    if (byStatus !== 0) return byStatus
    return (b.flight_date || '').localeCompare(a.flight_date || '')
  })[0]
}

function mapRow(row: AviationStackFlight, fallbackIata: string): FlightInfo {
  const delayBits = [
    row.departure?.delay != null ? `出发延误 ${row.departure.delay} 分` : null,
    row.arrival?.delay != null ? `到达延误 ${row.arrival.delay} 分` : null,
  ].filter(Boolean)

  const gateBits = [
    row.departure?.gate ? `出发登机口 ${row.departure.gate}` : null,
    row.arrival?.gate ? `到达登机口 ${row.arrival.gate}` : null,
    row.arrival?.baggage ? `行李转盘 ${row.arrival.baggage}` : null,
  ].filter(Boolean)

  return {
    flightNumber: row.flight?.iata || fallbackIata,
    airline: row.airline?.name,
    status: row.flight_status,
    from: {
      code: row.departure?.iata,
      name: row.departure?.airport,
      city: row.departure?.timezone,
      terminal: row.departure?.terminal,
      scheduled: formatAirportTime(row.departure?.scheduled, row.departure?.timezone),
      actual: row.departure?.actual
        ? formatAirportTime(row.departure.actual, row.departure.timezone)
        : row.departure?.estimated
          ? formatAirportTime(row.departure.estimated, row.departure.timezone)
          : undefined,
    },
    to: {
      code: row.arrival?.iata,
      name: row.arrival?.airport,
      city: row.arrival?.timezone,
      terminal: row.arrival?.terminal,
      scheduled: formatAirportTime(row.arrival?.scheduled, row.arrival?.timezone),
      actual: row.arrival?.actual
        ? formatAirportTime(row.arrival.actual, row.arrival.timezone)
        : row.arrival?.estimated
          ? formatAirportTime(row.arrival.estimated, row.arrival.timezone)
          : undefined,
    },
    duration: minutesBetween(row.departure?.scheduled, row.arrival?.scheduled),
    aircraft: row.aircraft?.iata || row.aircraft?.icao || row.aircraft?.registration,
    source: 'live',
    rawNote: [
      `AviationStack 实时数据${row.flight_date ? ` · ${row.flight_date}` : ''}`,
      ...delayBits,
      ...gateBits,
      '请以机票与机场大屏为准',
    ]
      .filter(Boolean)
      .join(' · '),
  }
}

async function fetchAviationStack(params: URLSearchParams): Promise<AviationStackResponse> {
  const key = getAviationStackKey()
  params.set('access_key', key)

  // Dev: Vite proxy avoids CORS. Prod: direct HTTPS.
  const url = import.meta.env.DEV
    ? `/api/aviationstack/flights?${params}`
    : `https://api.aviationstack.com/v1/flights?${params}`

  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`查询失败（HTTP ${res.status}）`)
  }
  return (await res.json()) as AviationStackResponse
}

function asString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function asEndpoint(value: unknown): FlightInfo['from'] {
  if (!value || typeof value !== 'object') return undefined
  const obj = value as Record<string, unknown>
  return {
    code: asString(obj.code),
    name: asString(obj.name),
    city: asString(obj.city),
    terminal: asString(obj.terminal),
    scheduled: asString(obj.scheduled),
    actual: asString(obj.actual),
  }
}

function mapLlmFlight(parsed: Record<string, unknown>, fallbackIata: string): FlightInfo {
  const flightNumber = asString(parsed.flightNumber) || fallbackIata
  const note = asString(parsed.note)
  return {
    flightNumber,
    airline: asString(parsed.airline),
    status: asString(parsed.status),
    from: asEndpoint(parsed.from),
    to: asEndpoint(parsed.to),
    duration: asString(parsed.duration),
    aircraft: asString(parsed.aircraft),
    source: 'llm',
    rawNote: [
      'AviationStack 不可用，已用大模型联网检索公开航班信息',
      note,
      '请以机票与机场大屏为准',
    ]
      .filter(Boolean)
      .join(' · '),
  }
}

async function lookupFlightViaLlm(query: {
  flightNumber?: string
  depIata?: string
  arrIata?: string
  preferAirline?: string
}): Promise<FlightInfo> {
  if (!isLlmConfigured()) {
    throw new Error('未配置 OpenAI，无法联网补查航班。')
  }

  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Vancouver',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())

  const subject = query.flightNumber
    ? `flight ${query.flightNumber}`
    : `${query.preferAirline || ''} route ${query.depIata} → ${query.arrIata}`.trim()

  const cacheKey = query.flightNumber
    ? `flight-llm:${normalizeFlightNumber(query.flightNumber)}:${today}`
    : `flight-llm-route:${query.depIata}-${query.arrIata}-${query.preferAirline || ''}:${today}`

  return memoizeLlmCall(cacheKey, async () => {
    const text = await openaiResponsesWithWebSearch({
      instructions:
        'You look up public flight schedules and status on the web. Prefer FlightStats, FlightAware, airline sites, or airport boards. Reply with a single JSON object only — no markdown fences.',
      user: [
        `Today (Vancouver calendar): ${today}.`,
        `Look up the latest useful info for ${subject}.`,
        query.depIata && query.arrIata
          ? `Route context: ${query.depIata} → ${query.arrIata}${query.preferAirline ? ` · prefer airline ${query.preferAirline}` : ''}.`
          : '',
        'If the exact date is unknown, use the most recent or next scheduled departure for this flight/route.',
        'Return JSON with keys:',
        '{"flightNumber":"","airline":"","status":"","from":{"code":"","name":"","city":"","terminal":"","scheduled":"","actual":""},"to":{"code":"","name":"","city":"","terminal":"","scheduled":"","actual":""},"duration":"","aircraft":"","note":""}',
        'Use local airport times with timezone abbreviations when possible. Put source/gate/baggage hints in note.',
      ]
        .filter(Boolean)
        .join('\n'),
    })

    const parsed = extractLlmJsonObject(text)
    if (!parsed) {
      throw new Error('联网查询返回了无法解析的航班信息。')
    }

    const mapped = mapLlmFlight(parsed, query.flightNumber || `${query.preferAirline || '?'}?`)
    if (!mapped.flightNumber || mapped.flightNumber === '?') {
      throw new Error('联网查询未找到有效航班号。')
    }
    return mapped
  })
}

async function withLlmFallback(
  primary: () => Promise<FlightInfo>,
  fallback: () => Promise<FlightInfo>,
): Promise<FlightInfo> {
  try {
    return await primary()
  } catch (primaryError) {
    if (!isLlmConfigured()) throw primaryError
    try {
      return await fallback()
    } catch (fallbackError) {
      const primaryMsg =
        primaryError instanceof Error ? primaryError.message : 'AviationStack 查询失败'
      const fallbackMsg =
        fallbackError instanceof Error ? fallbackError.message : '联网查询失败'
      throw new Error(`${primaryMsg}；联网补查也失败：${fallbackMsg}`)
    }
  }
}

async function lookupFlightFromAviationStack(flightNumber: string): Promise<FlightInfo> {
  const iata = normalizeFlightNumber(flightNumber)
  if (!/^[A-Z0-9]{2}\d{1,4}[A-Z]?$/.test(iata)) {
    throw new Error('请输入有效航班号，例如 AF375 或 AF374')
  }

  const params = new URLSearchParams({
    flight_iata: iata,
    limit: '5',
  })

  const json = await fetchAviationStack(params)
  if (json.error?.message || json.error?.info) {
    throw new Error(json.error.message || json.error.info || 'AviationStack 返回错误')
  }

  const row = pickBestFlight(json.data || [])
  if (!row) {
    throw new Error('未查到该航班近期数据。可核对航班号后再试。')
  }

  return mapRow(row, iata)
}

/**
 * Lookup real flight data by IATA flight number via AviationStack,
 * falling back to OpenAI web search when AviationStack fails.
 */
export async function lookupFlight(flightNumber: string): Promise<FlightInfo> {
  const iata = normalizeFlightNumber(flightNumber)
  if (!/^[A-Z0-9]{2}\d{1,4}[A-Z]?$/.test(iata)) {
    throw new Error('请输入有效航班号，例如 AF375 或 AF374')
  }

  return withLlmFallback(
    () => lookupFlightFromAviationStack(iata),
    () => lookupFlightViaLlm({ flightNumber: iata }),
  )
}

async function lookupRouteFromAviationStack(
  depIata: string,
  arrIata: string,
  preferAirline = 'AF',
): Promise<FlightInfo> {
  const params = new URLSearchParams({
    dep_iata: depIata,
    arr_iata: arrIata,
    limit: '10',
  })
  const json = await fetchAviationStack(params)
  if (json.error?.message || json.error?.info) {
    throw new Error(json.error.message || json.error.info || 'AviationStack 返回错误')
  }
  const rows = json.data || []
  const preferred =
    rows.find((r) => r.airline?.iata === preferAirline && !r.flight?.iata?.includes('null')) ||
    rows.find((r) => r.airline?.iata === preferAirline) ||
    pickBestFlight(rows)
  if (!preferred) {
    throw new Error(`未查到 ${depIata} → ${arrIata} 的近期航班`)
  }
  return mapRow(preferred, preferred.flight?.iata || `${preferAirline}?`)
}

/** Lookup by route when a specific flight number has no recent records. */
export async function lookupRouteFlight(depIata: string, arrIata: string, preferAirline = 'AF') {
  return withLlmFallback(
    () => lookupRouteFromAviationStack(depIata, arrIata, preferAirline),
    () =>
      lookupFlightViaLlm({
        depIata,
        arrIata,
        preferAirline,
      }),
  )
}
