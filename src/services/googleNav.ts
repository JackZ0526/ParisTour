import type { Coordinates } from '../types'

export type NavMode = 'WALKING' | 'DRIVING' | 'TRANSIT'

/** Finer modes for map coloring / UI labels */
export type PathMode = 'WALKING' | 'DRIVING' | 'SUBWAY' | 'BUS' | 'TRAM' | 'RAIL' | 'TRANSIT'

export const PATH_MODE_COLORS: Record<PathMode, string> = {
  WALKING: '#4a6356',
  DRIVING: '#b56a3c',
  SUBWAY: '#2563a8',
  BUS: '#d97706',
  TRAM: '#7c3aed',
  RAIL: '#0f766e',
  TRANSIT: '#2563a8',
}

export const PATH_MODE_LABELS: Record<PathMode, string> = {
  WALKING: '步行',
  DRIVING: '自驾',
  SUBWAY: '地铁',
  BUS: '公交',
  TRAM: '有轨电车',
  RAIL: '火车/RER',
  TRANSIT: '公共交通',
}

export interface RouteSegment {
  mode: PathMode
  path: google.maps.LatLngLiteral[]
  color: string
  label?: string
  distanceMeters?: number
  durationSeconds?: number
}

export interface TransitLineInfo {
  mode: PathMode
  /** e.g. 地铁 1 号线 / 公交 69 */
  label: string
  shortName?: string
  color?: string
}

export interface NavLegResult {
  mode: NavMode
  path: google.maps.LatLngLiteral[]
  distanceMeters: number
  durationSeconds: number
  distanceText: string
  durationText: string
  /** Step-level colored segments for the map */
  segments: RouteSegment[]
  transitLines: TransitLineInfo[]
  /** Compact text like 地铁 1 号线 / 公交 69 */
  transitSummary?: string
  /** Raw Google Directions result for DirectionsRenderer */
  directionsResult?: google.maps.DirectionsResult
}

export interface ResolvedDayLeg extends NavLegResult {
  displayMode: NavMode
  label: string
}

function toLiteral(p: google.maps.LatLng | google.maps.LatLngLiteral): google.maps.LatLngLiteral {
  if (typeof (p as google.maps.LatLng).lat === 'function') {
    const ll = p as google.maps.LatLng
    return { lat: ll.lat(), lng: ll.lng() }
  }
  return p as google.maps.LatLngLiteral
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} 米`
  return `${(meters / 1000).toFixed(meters >= 10000 ? 0 : 1)} 公里`
}

function formatDuration(seconds: number): string {
  const mins = Math.max(1, Math.round(seconds / 60))
  if (mins < 60) return `${mins} 分钟`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h} 小时 ${m} 分钟` : `${h} 小时`
}

export function formatWalkSummary(distanceMeters: number, durationSeconds: number): string {
  if (distanceMeters <= 0 && durationSeconds <= 0) return '今日行程点之间几乎无需步行'
  return `步行约 ${formatDistance(distanceMeters)} · ${formatDuration(durationSeconds)}`
}

function normalizeHexColor(raw?: string): string | undefined {
  if (!raw) return undefined
  const c = raw.trim()
  if (/^#[0-9a-fA-F]{6}$/.test(c)) return c
  if (/^[0-9a-fA-F]{6}$/.test(c)) return `#${c}`
  return undefined
}

function vehicleToPathMode(vehicleType?: string): PathMode {
  const t = (vehicleType || '').toUpperCase()
  if (
    t.includes('SUBWAY') ||
    t.includes('METRO') ||
    t.includes('UNDERGROUND') ||
    t === 'METRO_RAIL'
  ) {
    return 'SUBWAY'
  }
  if (t.includes('BUS') || t.includes('TROLLEYBUS')) return 'BUS'
  if (t.includes('TRAM')) return 'TRAM'
  if (
    t.includes('RAIL') ||
    t.includes('TRAIN') ||
    t.includes('COMMUTER') ||
    t.includes('HEAVY')
  ) {
    return 'RAIL'
  }
  return 'TRANSIT'
}

function formatTransitLineLabel(
  pathMode: PathMode,
  shortName?: string,
  longName?: string,
  vehicleName?: string,
): string {
  const name = (shortName || longName || '').trim()
  if (pathMode === 'SUBWAY') {
    if (!name) return vehicleName || '地铁'
    if (/^\d+[A-Za-z]?$/.test(name)) return `地铁 ${name} 号线`
    if (/^M?\d+/i.test(name)) return `地铁 ${name}`
    return `地铁 ${name}`
  }
  if (pathMode === 'BUS') {
    return name ? `公交 ${name}` : vehicleName || '公交'
  }
  if (pathMode === 'TRAM') {
    return name ? `有轨电车 ${name}` : vehicleName || '有轨电车'
  }
  if (pathMode === 'RAIL') {
    return name ? (name.startsWith('RER') ? name : `RER/火车 ${name}`) : vehicleName || '火车'
  }
  return name || vehicleName || '公共交通'
}

function buildLegLabel(leg: NavLegResult, displayMode: NavMode): string {
  if (displayMode === 'WALKING') {
    return `步行 ${leg.durationText} · ${leg.distanceText}`
  }
  if (displayMode === 'TRANSIT') {
    const lines =
      leg.transitLines.map((l) => l.label).filter(Boolean).slice(0, 3).join(' → ') ||
      leg.transitSummary ||
      '公共交通'
    return `${lines} · ${leg.durationText}`
  }
  return `驾车 ${leg.durationText} · ${leg.distanceText}`
}

/** Paris wall-clock parts for a UTC instant (itinerary destination TZ). */
function parisDateParts(date: Date): {
  year: number
  month: number
  day: number
  hour: number
  minute: number
} {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value || 0)
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
  }
}

/** Convert a Europe/Paris civil datetime to a Date (UTC instant). */
function parisWallTimeToDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0,
): Date {
  // Iterate from a CET/CEST guess until wall time matches Paris.
  let utc = Date.UTC(year, month - 1, day, hour - 2, minute, 0)
  for (let i = 0; i < 4; i++) {
    const got = parisDateParts(new Date(utc))
    const gotMins = got.hour * 60 + got.minute
    const wantMins = hour * 60 + minute
    const dayDelta =
      Date.UTC(got.year, got.month - 1, got.day) - Date.UTC(year, month - 1, day)
    utc += wantMins * 60_000 - gotMins * 60_000 - dayDelta
  }
  return new Date(utc)
}

/**
 * Directions needs a departure time for transit. Using "now" overnight in Paris
 * often returns walk-only routes (no line names). Prefer live daytime departures;
 * overnight, plan mid-morning so metro/bus lines still appear for itinerary legs.
 */
function transitDepartureTime(): Date {
  const now = new Date()
  const paris = parisDateParts(now)
  if (paris.hour >= 7 && paris.hour < 22) return now

  // Overnight / late evening: plan mid-morning so metro & daytime buses appear.
  let year = paris.year
  let month = paris.month
  let day = paris.day
  if (paris.hour >= 22) {
    const nextParisDay = parisDateParts(new Date(now.getTime() + 12 * 3600 * 1000))
    year = nextParisDay.year
    month = nextParisDay.month
    day = nextParisDay.day
  }
  return parisWallTimeToDate(year, month, day, 10, 0)
}

type DirectionsStepLike = google.maps.DirectionsStep & {
  transit_details?: google.maps.TransitDetails
  transitDetails?: google.maps.TransitDetails
  travelMode?: google.maps.TravelMode | string
}

type TransitLineLike = google.maps.TransitLine & {
  shortName?: string
  textColor?: string
}

function stepTravelMode(step: DirectionsStepLike): string {
  return String(step.travel_mode || step.travelMode || '').toUpperCase()
}

function stepTransitDetails(step: DirectionsStepLike): google.maps.TransitDetails | null {
  return step.transit || step.transit_details || step.transitDetails || null
}

function readTransitLine(line?: google.maps.TransitLine | null): {
  shortName?: string
  longName?: string
  vehicleName?: string
  vehicleType?: string
  color?: string
} {
  if (!line) return {}
  const anyLine = line as TransitLineLike
  return {
    shortName: (line.short_name || anyLine.shortName || '').trim() || undefined,
    longName: (line.name || '').trim() || undefined,
    vehicleName: (line.vehicle?.name || '').trim() || undefined,
    vehicleType: line.vehicle?.type ? String(line.vehicle.type) : undefined,
    color: line.color || undefined,
  }
}

function stepPath(step: google.maps.DirectionsStep): google.maps.LatLngLiteral[] {
  const raw = step.path?.length ? step.path : step.lat_lngs
  if (raw?.length) return raw.map(toLiteral)
  return []
}

function segmentsFromDirectionsResult(
  result: google.maps.DirectionsResult,
  fallbackMode: NavMode,
): {
  segments: RouteSegment[]
  transitLines: TransitLineInfo[]
  path: google.maps.LatLngLiteral[]
  distanceMeters: number
  durationSeconds: number
  /** Official Google Maps text (localized) */
  distanceText: string
  durationText: string
} {
  const segments: RouteSegment[] = []
  const transitLines: TransitLineInfo[] = []
  const seenLine = new Set<string>()
  let distanceMeters = 0
  let durationSeconds = 0
  const distanceTexts: string[] = []
  const durationTexts: string[] = []
  const fullPath: google.maps.LatLngLiteral[] = []

  for (const leg of result.routes[0].legs) {
    distanceMeters += leg.distance?.value ?? 0
    durationSeconds += leg.duration?.value ?? 0
    if (leg.distance?.text) distanceTexts.push(leg.distance.text)
    if (leg.duration?.text) durationTexts.push(leg.duration.text)

    for (const step of (leg.steps || []) as DirectionsStepLike[]) {
      const path = stepPath(step)
      if (path.length >= 2) {
        if (!fullPath.length) fullPath.push(...path)
        else fullPath.push(...path.slice(1))
      }

      const travelMode = stepTravelMode(step)
      const transit = stepTransitDetails(step)

      if (travelMode === 'WALKING' || travelMode === String(google.maps.TravelMode.WALKING)) {
        if (path.length >= 2) {
          segments.push({
            mode: 'WALKING',
            path,
            color: PATH_MODE_COLORS.WALKING,
            label: step.duration?.text ? `步行 ${step.duration.text}` : '步行',
            distanceMeters: step.distance?.value,
            durationSeconds: step.duration?.value,
          })
        }
        continue
      }

      if (travelMode === 'DRIVING' || travelMode === String(google.maps.TravelMode.DRIVING)) {
        if (path.length >= 2) {
          segments.push({
            mode: 'DRIVING',
            path,
            color: PATH_MODE_COLORS.DRIVING,
            label: step.duration?.text ? `驾车 ${step.duration.text}` : '自驾',
            distanceMeters: step.distance?.value,
            durationSeconds: step.duration?.value,
          })
        }
        continue
      }

      if (travelMode === 'TRANSIT' || transit) {
        const lineInfo = readTransitLine(transit?.line)
        const pathMode = vehicleToPathMode(lineInfo.vehicleType)
        const label = formatTransitLineLabel(
          pathMode,
          lineInfo.shortName,
          lineInfo.longName,
          lineInfo.vehicleName,
        )
        const color =
          normalizeHexColor(lineInfo.color) ||
          PATH_MODE_COLORS[pathMode] ||
          PATH_MODE_COLORS.TRANSIT

        if (path.length >= 2) {
          segments.push({
            mode: pathMode,
            path,
            color,
            label: step.duration?.text ? `${label} · ${step.duration.text}` : label,
            distanceMeters: step.distance?.value,
            durationSeconds: step.duration?.value,
          })
        }

        // Chips only when Google provided a real line id/name — never invent routes.
        if (lineInfo.shortName || lineInfo.longName) {
          const key = `${pathMode}:${lineInfo.shortName || lineInfo.longName}`
          if (!seenLine.has(key)) {
            seenLine.add(key)
            transitLines.push({
              mode: pathMode,
              label,
              shortName: lineInfo.shortName,
              color,
            })
          }
        }
        continue
      }

      if (path.length >= 2) {
        const mode: PathMode =
          fallbackMode === 'DRIVING'
            ? 'DRIVING'
            : fallbackMode === 'WALKING'
              ? 'WALKING'
              : 'TRANSIT'
        segments.push({
          mode,
          path,
          color: PATH_MODE_COLORS[mode],
          label: PATH_MODE_LABELS[mode],
          distanceMeters: step.distance?.value,
          durationSeconds: step.duration?.value,
        })
      }
    }
  }

  if (!segments.length && fullPath.length >= 2) {
    const mode: PathMode =
      fallbackMode === 'DRIVING' ? 'DRIVING' : fallbackMode === 'WALKING' ? 'WALKING' : 'TRANSIT'
    segments.push({
      mode,
      path: fullPath,
      color: PATH_MODE_COLORS[mode],
      label: PATH_MODE_LABELS[mode],
    })
  }

  if (!fullPath.length && result.routes[0].overview_path?.length) {
    fullPath.push(...result.routes[0].overview_path.map(toLiteral))
  }

  return {
    segments,
    transitLines,
    path: fullPath,
    distanceMeters,
    durationSeconds,
    distanceText:
      distanceTexts.length === 1 ? distanceTexts[0] : formatDistance(distanceMeters),
    durationText:
      durationTexts.length === 1 ? durationTexts[0] : formatDuration(durationSeconds),
  }
}

function mergeAdjacentSegments(segments: RouteSegment[]): RouteSegment[] {
  if (!segments.length) return []
  const out: RouteSegment[] = [{ ...segments[0], path: [...segments[0].path] }]
  for (let i = 1; i < segments.length; i++) {
    const prev = out[out.length - 1]
    const cur = segments[i]
    if (prev.mode === cur.mode && prev.label === cur.label && prev.color === cur.color) {
      prev.path.push(...cur.path.slice(1))
    } else {
      out.push({ ...cur, path: [...cur.path] })
    }
  }
  return out
}

/** Directions Service — live Google navigation + DirectionsRenderer payload. */
function computeViaDirectionsService(
  origin: Coordinates,
  destination: Coordinates,
  mode: NavMode,
  intermediates: Coordinates[] = [],
): Promise<NavLegResult | null> {
  return new Promise((resolve) => {
    const service = new google.maps.DirectionsService()
    const request: google.maps.DirectionsRequest = {
      origin,
      destination,
      waypoints: intermediates.map((location) => ({ location, stopover: true })),
      travelMode: google.maps.TravelMode[mode],
      optimizeWaypoints: false,
      provideRouteAlternatives: false,
      language: 'zh-CN',
      region: 'fr',
    }
    // Transit schedules need a departure; overnight "now" often yields walk-only
    // routes with no line names — prefer Paris daytime for itinerary planning.
    if (mode === 'TRANSIT') {
      request.transitOptions = {
        departureTime: transitDepartureTime(),
        modes: [
          google.maps.TransitMode.BUS,
          google.maps.TransitMode.RAIL,
          google.maps.TransitMode.SUBWAY,
          google.maps.TransitMode.TRAM,
        ],
      }
    }

    service.route(request, (result, status) => {
      if (status !== google.maps.DirectionsStatus.OK || !result?.routes[0]?.legs?.length) {
        resolve(null)
        return
      }

      const parsed = segmentsFromDirectionsResult(result, mode)
      const segments = mergeAdjacentSegments(parsed.segments)
      resolve({
        mode,
        path: parsed.path,
        distanceMeters: parsed.distanceMeters,
        durationSeconds: parsed.durationSeconds,
        distanceText: parsed.distanceText,
        durationText: parsed.durationText,
        segments,
        transitLines: parsed.transitLines,
        transitSummary: parsed.transitLines.map((l) => l.label).slice(0, 3).join(' / ') || undefined,
        directionsResult: result,
      })
    })
  })
}

/** New Routes library (path only). */
async function computeViaRoutesApi(
  origin: Coordinates,
  destination: Coordinates,
  mode: NavMode,
  intermediates: Coordinates[] = [],
): Promise<google.maps.LatLngLiteral[] | null> {
  const lib = (await google.maps.importLibrary('routes')) as unknown as {
    Route: {
      computeRoutes: (req: Record<string, unknown>) => Promise<{
        routes?: Array<{
          path?: Array<google.maps.LatLng | google.maps.LatLngLiteral>
        }>
      }>
    }
  }

  const { routes } = await lib.Route.computeRoutes({
    origin,
    destination,
    intermediates: intermediates.length ? intermediates : undefined,
    travelMode: mode,
    fields: ['path'],
  })

  const path = routes?.[0]?.path
  if (!path?.length) return null
  return path.map(toLiteral)
}

/**
 * Fetch a Google navigation path between two points (and optional stops).
 */
export async function fetchGoogleNavPath(
  origin: Coordinates,
  destination: Coordinates,
  mode: NavMode,
  intermediates: Coordinates[] = [],
): Promise<{ path: google.maps.LatLngLiteral[] | null; error?: string }> {
  try {
    const path = await computeViaRoutesApi(origin, destination, mode, intermediates)
    if (path?.length) return { path }
  } catch {
    // continue
  }

  try {
    const leg = await computeViaDirectionsService(origin, destination, mode, intermediates)
    if (leg?.path?.length) return { path: leg.path }
    return {
      path: null,
      error: '暂时无法获取导航路线。',
    }
  } catch {
    return {
      path: null,
      error: '暂时无法获取导航路线。',
    }
  }
}

export async function fetchGoogleNavLeg(
  origin: Coordinates,
  destination: Coordinates,
  mode: NavMode,
): Promise<NavLegResult | null> {
  try {
    return await computeViaDirectionsService(origin, destination, mode)
  } catch {
    return null
  }
}

const WALK_MAX_SECONDS = 18 * 60
const WALK_MAX_METERS = 1400

function isWalkOnlyLeg(leg: NavLegResult): boolean {
  if (!leg.segments.length) return false
  return leg.segments.every((s) => s.mode === 'WALKING')
}

function asResolved(leg: NavLegResult, displayMode: NavMode): ResolvedDayLeg {
  // Ensure walking/driving legs have at least one colored segment
  let segments = leg.segments
  if (!segments.length && leg.path.length >= 2) {
    const mode: PathMode =
      displayMode === 'DRIVING' ? 'DRIVING' : displayMode === 'WALKING' ? 'WALKING' : 'TRANSIT'
    segments = [
      {
        mode,
        path: leg.path,
        color: PATH_MODE_COLORS[mode],
        label: PATH_MODE_LABELS[mode],
      },
    ]
  }
  const enriched = { ...leg, segments }
  return {
    ...enriched,
    displayMode,
    label: buildLegLabel(enriched, displayMode),
  }
}

/**
 * Choose walk vs transit (or drive on outing days) for a single pair of points.
 */
export async function resolveTravelLeg(
  origin: Coordinates,
  destination: Coordinates,
  pace: string,
): Promise<ResolvedDayLeg | null> {
  const preferDrive = pace === '自驾日' || pace === '乐园日'

  const walk = await fetchGoogleNavLeg(origin, destination, 'WALKING')
  if (
    walk &&
    (walk.durationSeconds <= WALK_MAX_SECONDS || walk.distanceMeters <= WALK_MAX_METERS)
  ) {
    return asResolved(walk, 'WALKING')
  }

  if (preferDrive) {
    const drive = await fetchGoogleNavLeg(origin, destination, 'DRIVING')
    if (drive) return asResolved(drive, 'DRIVING')
  }

  const transit = await fetchGoogleNavLeg(origin, destination, 'TRANSIT')
  if (transit) {
    // Walk-only "transit" responses (common overnight) must not show「公共交通」.
    if (!transit.transitLines.length && isWalkOnlyLeg(transit)) {
      if (walk) return asResolved(walk, 'WALKING')
      return asResolved(transit, 'WALKING')
    }
    return asResolved(transit, 'TRANSIT')
  }

  if (walk) return asResolved(walk, 'WALKING')
  return null
}

function walkingStatsFromLegs(legs: Array<ResolvedDayLeg | null>): {
  distanceMeters: number
  durationSeconds: number
} {
  let distanceMeters = 0
  let durationSeconds = 0
  for (const leg of legs) {
    if (!leg) continue
    const walkSegs = (leg.segments || []).filter((s) => s.mode === 'WALKING')
    if (walkSegs.length) {
      for (const s of walkSegs) {
        distanceMeters += s.distanceMeters || 0
        durationSeconds += s.durationSeconds || 0
      }
    } else if (leg.displayMode === 'WALKING') {
      distanceMeters += leg.distanceMeters
      durationSeconds += leg.durationSeconds
    }
  }
  return { distanceMeters, durationSeconds }
}

export function describeHotelToFirst(
  leg: ResolvedDayLeg | null,
  _originKind: 'hotel' | 'airport' = 'hotel',
): string {
  // Origin place (酒店/机场) is shown as a LegConnector cue chip — keep text cue-free.
  if (!leg) return '请根据地图出发'
  const walk = walkingStatsFromLegs([leg])
  const walkBit =
    walk.distanceMeters > 0
      ? `步行 ${formatDistance(walk.distanceMeters)}`
      : ''

  if (leg.displayMode === 'WALKING') {
    return `步行 · ${leg.distanceText} · ${leg.durationText}`
  }
  if (leg.displayMode === 'DRIVING') {
    return walkBit
      ? `驾车 · ${leg.durationText}（含 ${walkBit}）`
      : `驾车 · ${leg.distanceText} · ${leg.durationText}`
  }
  const lines = leg.transitLines.map((l) => l.label).filter(Boolean)
  const lineBit = lines.length ? lines.join(' → ') : leg.transitSummary || '公共交通'
  return walkBit
    ? `${lineBit} · ${leg.durationText}（含 ${walkBit}）`
    : `${lineBit} · ${leg.durationText}`
}

function roughlySamePoint(
  a: Coordinates,
  b: Coordinates,
  withinMeters = 500,
): boolean {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h)) <= withinMeters
}

export interface DayNavPlan {
  hotelToFirst: ResolvedDayLeg | null
  betweenStops: Array<ResolvedDayLeg | null>
  /** Last stop → day destination (e.g. hotel on day 1) */
  lastToDestination: ResolvedDayLeg | null
  walkDistanceMeters: number
  walkDurationSeconds: number
  walkSummaryText: string
  /** Origin → first stop, including mode + walking distance */
  hotelToFirstText: string
  lastToDestinationText: string
  /** All colored route segments for the map */
  segments: RouteSegment[]
  routePath: google.maps.LatLngLiteral[]
  hotelLinkPath: google.maps.LatLngLiteral[]
  /** Fingerprint of stops used to build this plan */
  stopsKey?: string
  error?: string
}

function collectSegments(legs: Array<ResolvedDayLeg | null>): RouteSegment[] {
  const out: RouteSegment[] = []
  for (const leg of legs) {
    if (!leg) continue
    if (leg.segments?.length) out.push(...leg.segments)
    else if (leg.path.length >= 2) {
      const mode: PathMode =
        leg.displayMode === 'DRIVING'
          ? 'DRIVING'
          : leg.displayMode === 'WALKING'
            ? 'WALKING'
            : 'TRANSIT'
      out.push({
        mode,
        path: leg.path,
        color: PATH_MODE_COLORS[mode],
        label: PATH_MODE_LABELS[mode],
        distanceMeters: leg.distanceMeters,
        durationSeconds: leg.durationSeconds,
      })
    }
  }
  return out
}

export async function planDayNavigation(
  origin: Coordinates,
  stops: Coordinates[],
  pace: string,
  stopsKey = '',
  options?: {
    originKind?: 'hotel' | 'airport'
    destination?: Coordinates | null
    destinationLabel?: string
  },
): Promise<DayNavPlan> {
  const originKind = options?.originKind || 'hotel'
  const destination = options?.destination || null
  const destinationLabel = options?.destinationLabel || '酒店'

  if (!stops.length) {
    return {
      hotelToFirst: null,
      betweenStops: [],
      lastToDestination: null,
      walkDistanceMeters: 0,
      walkDurationSeconds: 0,
      walkSummaryText: '今天还没有行程点',
      hotelToFirstText: '添加地点后显示出发方式',
      lastToDestinationText: destination
        ? `添加地点后显示前往${destinationLabel}的方式`
        : '',
      segments: [],
      routePath: [],
      hotelLinkPath: [],
      stopsKey,
    }
  }

  // Skip only a true null trip (same pin). Do NOT use the 500m "same place"
  // threshold here — mid-day first stops are often a café within ~500m of the
  // hotel, and those must still get walking/transit (otherwise the timeline
  // shows only「本日出发」with no route).
  const ORIGIN_NULL_TRIP_METERS = 80
  const originIsFirst = roughlySamePoint(
    origin,
    stops[0],
    ORIGIN_NULL_TRIP_METERS,
  )
  const hotelToFirst = originIsFirst
    ? null
    : await resolveTravelLeg(origin, stops[0], pace)
  const betweenStops: Array<ResolvedDayLeg | null> = []

  for (let i = 0; i < stops.length - 1; i++) {
    betweenStops.push(await resolveTravelLeg(stops[i], stops[i + 1], pace))
  }

  const lastStop = stops[stops.length - 1]
  const lastIsDestination =
    Boolean(destination) && destination != null && roughlySamePoint(lastStop, destination)
  const lastToDestination =
    destination && !lastIsDestination
      ? await resolveTravelLeg(lastStop, destination, pace)
      : null

  const allLegs = [hotelToFirst, ...betweenStops, lastToDestination].filter(
    Boolean,
  ) as ResolvedDayLeg[]
  const walk = walkingStatsFromLegs(allLegs)

  const routePath: google.maps.LatLngLiteral[] = []
  betweenStops.forEach((leg, i) => {
    if (!leg?.path?.length) {
      if (i === 0) routePath.push({ ...stops[0] })
      routePath.push({ ...stops[i + 1] })
      return
    }
    const chunk = i === 0 ? leg.path : leg.path.slice(1)
    routePath.push(...chunk)
  })

  const hotelLinkPath =
    hotelToFirst?.path?.length && hotelToFirst.path.length >= 2
      ? hotelToFirst.path
      : originIsFirst
        ? []
        : [
            { lat: origin.lat, lng: origin.lng },
            { lat: stops[0].lat, lng: stops[0].lng },
          ]

  const segments = collectSegments([hotelToFirst, ...betweenStops, lastToDestination])
  const anyLeg = hotelToFirst || betweenStops.some(Boolean) || lastToDestination

  return {
    hotelToFirst,
    betweenStops,
    lastToDestination,
    walkDistanceMeters: walk.distanceMeters,
    walkDurationSeconds: walk.durationSeconds,
    walkSummaryText: formatWalkSummary(walk.distanceMeters, walk.durationSeconds),
    // Cue chip carries 「从酒店」/「从机场」 — status text stays cue-free.
    hotelToFirstText: originIsFirst
      ? '本日出发'
      : describeHotelToFirst(hotelToFirst, originKind),
    lastToDestinationText: lastIsDestination
      ? `本日终点：${destinationLabel}`
      : describeHotelToFirst(lastToDestination, 'hotel'),
    segments,
    routePath,
    hotelLinkPath,
    stopsKey,
    error:
      anyLeg || originIsFirst || lastIsDestination
        ? undefined
        : '暂时无法获取导航路线。',
  }
}

export async function fetchGoogleNavPathChain(
  points: Coordinates[],
  mode: NavMode,
): Promise<{ path: google.maps.LatLngLiteral[]; error?: string; usedNav: boolean }> {
  if (points.length < 2) {
    return { path: points.map((p) => ({ ...p })), usedNav: false }
  }

  const merged: google.maps.LatLngLiteral[] = []
  let usedNav = false
  let lastError: string | undefined

  for (let i = 0; i < points.length - 1; i++) {
    const { path, error } = await fetchGoogleNavPath(points[i], points[i + 1], mode)
    if (path?.length) {
      usedNav = true
      const chunk = i === 0 ? path : path.slice(1)
      merged.push(...chunk)
    } else {
      lastError = error
      const a = points[i]
      const b = points[i + 1]
      if (i === 0) merged.push({ lat: a.lat, lng: a.lng })
      merged.push({ lat: b.lat, lng: b.lng })
    }
  }

  return {
    path: merged,
    usedNav,
    error: usedNav ? undefined : lastError,
  }
}

export function pickTravelMode(points: Coordinates[], pace: string): NavMode {
  if (pace === '自驾日' || pace === '乐园日') return 'DRIVING'
  let maxGap = 0
  for (let i = 1; i < points.length; i++) {
    const R = 6371000
    const toRad = (d: number) => (d * Math.PI) / 180
    const a = points[i - 1]
    const b = points[i]
    const dLat = toRad(b.lat - a.lat)
    const dLng = toRad(b.lng - a.lng)
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
    maxGap = Math.max(maxGap, 2 * R * Math.asin(Math.sqrt(h)))
  }
  if (maxGap > 15000) return 'DRIVING'
  return 'WALKING'
}
