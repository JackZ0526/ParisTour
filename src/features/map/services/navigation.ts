import type { Coordinates } from '../../../types'
import { authFetch } from '../../auth/services/authFetch'

export type NavMode = 'WALKING' | 'DRIVING' | 'TRANSIT'
export type PathMode =
  | 'WALKING'
  | 'DRIVING'
  | 'SUBWAY'
  | 'BUS'
  | 'TRAM'
  | 'RAIL'
  | 'TRANSIT'

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
  path: Coordinates[]
  color: string
  label?: string
  distanceMeters?: number
  durationSeconds?: number
}

export interface TransitLineInfo {
  mode: PathMode
  label: string
  shortName?: string
  color?: string
}

export interface NavLegResult {
  mode: NavMode
  path: Coordinates[]
  distanceMeters: number
  durationSeconds: number
  distanceText: string
  durationText: string
  segments: RouteSegment[]
  transitLines: TransitLineInfo[]
  transitSummary?: string
}

export interface ResolvedDayLeg extends NavLegResult {
  displayMode: NavMode
  label: string
}

export interface DayNavPlan {
  hotelToFirst: ResolvedDayLeg | null
  betweenStops: Array<ResolvedDayLeg | null>
  lastToDestination: ResolvedDayLeg | null
  walkDistanceMeters: number
  walkDurationSeconds: number
  walkSummaryText: string
  hotelToFirstText: string
  lastToDestinationText: string
  segments: RouteSegment[]
  routePath: Coordinates[]
  hotelLinkPath: Coordinates[]
  stopsKey?: string
  error?: string
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} 米`
  return `${(meters / 1000).toFixed(meters >= 10_000 ? 0 : 1)} 公里`
}

function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60))
  if (minutes < 60) return `${minutes} 分钟`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`
}

export function formatWalkSummary(distanceMeters: number, durationSeconds: number): string {
  if (distanceMeters <= 0 && durationSeconds <= 0) return '今日行程点之间几乎无需步行'
  return `步行约 ${formatDistance(distanceMeters)} · ${formatDuration(durationSeconds)}`
}

function normalizeHexColor(raw?: string): string | undefined {
  if (!raw) return undefined
  const color = raw.trim()
  if (/^#[0-9a-f]{6}$/i.test(color)) return color
  if (/^[0-9a-f]{6}$/i.test(color)) return `#${color}`
  return undefined
}

function formatTransitLineLabel(
  mode: PathMode,
  shortName?: string,
  longName?: string,
): string {
  const name = (shortName || longName || '').trim()
  if (mode === 'SUBWAY') return name ? `地铁 ${name} 号线` : '地铁'
  if (mode === 'BUS') return name ? `公交 ${name}` : '公交'
  if (mode === 'TRAM') return name ? `有轨电车 ${name}` : '有轨电车'
  if (mode === 'RAIL') return name ? (name.startsWith('RER') ? name : `RER/火车 ${name}`) : '火车/RER'
  return name || '公共交通'
}

function buildLegLabel(leg: NavLegResult, displayMode: NavMode): string {
  if (displayMode === 'WALKING') return `步行 ${leg.durationText} · ${leg.distanceText}`
  if (displayMode === 'DRIVING') return `驾车 ${leg.durationText} · ${leg.distanceText}`
  const lines = leg.transitLines.map((line) => line.label).filter(Boolean).slice(0, 3)
  return `${lines.join(' · ') || leg.transitSummary || '公共交通'} · ${leg.durationText}`
}

function parisDateParts(date: Date) {
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
    Number(parts.find((part) => part.type === type)?.value || 0)
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute') }
}

function parisWallTimeToDate(year: number, month: number, day: number, hour: number): Date {
  let utc = Date.UTC(year, month - 1, day, hour - 2, 0, 0)
  for (let index = 0; index < 4; index += 1) {
    const got = parisDateParts(new Date(utc))
    const dayDelta = Date.UTC(got.year, got.month - 1, got.day) - Date.UTC(year, month - 1, day)
    utc += hour * 3_600_000 - (got.hour * 60 + got.minute) * 60_000 - dayDelta
  }
  return new Date(utc)
}

function transitDepartureTime(): Date {
  const now = new Date()
  const paris = parisDateParts(now)
  if (paris.hour >= 7 && paris.hour < 22) return now
  const next = paris.hour >= 22 ? parisDateParts(new Date(now.getTime() + 12 * 3_600_000)) : paris
  return parisWallTimeToDate(next.year, next.month, next.day, 10)
}

function mergeAdjacentSegments(segments: RouteSegment[]): RouteSegment[] {
  if (!segments.length) return []
  const output: RouteSegment[] = [{ ...segments[0], path: [...segments[0].path] }]
  for (const current of segments.slice(1)) {
    const previous = output[output.length - 1]
    if (previous.mode === current.mode && previous.label === current.label && previous.color === current.color) {
      previous.path.push(...current.path.slice(1))
    } else {
      output.push({ ...current, path: [...current.path] })
    }
  }
  return output
}

type GeoJsonRoute = {
  geometry?: { coordinates?: Array<[number, number]> }
  properties?: { summary?: { distance?: number; duration?: number } }
}
type OsrmRoute = {
  geometry?: { coordinates?: Array<[number, number]> }
  distance?: number
  duration?: number
}

function streetRouteResult(
  mode: 'WALKING' | 'DRIVING',
  coordinates?: Array<[number, number]>,
  distanceMeters?: number,
  durationSeconds?: number,
): NavLegResult | null {
  const path = (coordinates || [])
    .map(([lng, lat]) => ({ lat: Number(lat), lng: Number(lng) }))
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng))
  if (path.length < 2) return null
  const distance = Number(distanceMeters) || 0
  const duration = Number(durationSeconds) || 0
  return {
    mode,
    path,
    distanceMeters: distance,
    durationSeconds: duration,
    distanceText: formatDistance(distance),
    durationText: formatDuration(duration),
    segments: [{
      mode,
      path,
      color: PATH_MODE_COLORS[mode],
      label: PATH_MODE_LABELS[mode],
      distanceMeters: distance,
      durationSeconds: duration,
    }],
    transitLines: [],
  }
}

async function computeStreetRoute(
  origin: Coordinates,
  destination: Coordinates,
  mode: 'WALKING' | 'DRIVING',
  intermediates: Coordinates[] = [],
): Promise<NavLegResult | null> {
  const coordinates = [origin, ...intermediates, destination].map(
    (point) => [point.lng, point.lat] as [number, number],
  )
  const profile = mode === 'WALKING' ? 'foot-walking' : 'driving-car'
  try {
    const response = await authFetch(`/api/openrouteservice/v2/directions/${profile}/geojson`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/geo+json' },
      body: JSON.stringify({ coordinates, instructions: false }),
    })
    if (response.ok) {
      const payload = (await response.json()) as { features?: GeoJsonRoute[] }
      const route = payload.features?.[0]
      const result = streetRouteResult(
        mode,
        route?.geometry?.coordinates,
        route?.properties?.summary?.distance,
        route?.properties?.summary?.duration,
      )
      if (result) return result
    }
  } catch {
    /* use no-key OSM fallback */
  }

  try {
    const endpoint = mode === 'WALKING' ? 'routed-foot' : 'routed-car'
    const path = coordinates.map(([lng, lat]) => `${lng},${lat}`).join(';')
    const response = await authFetch(
      `/api/osm-route/${endpoint}/route/v1/driving/${path}?overview=full&geometries=geojson&steps=false`,
      { headers: { Accept: 'application/json' } },
    )
    if (!response.ok) return null
    const payload = (await response.json()) as { routes?: OsrmRoute[] }
    const route = payload.routes?.[0]
    return streetRouteResult(mode, route?.geometry?.coordinates, route?.distance, route?.duration)
  } catch {
    return null
  }
}

type MotisLeg = {
  mode?: string
  duration?: number
  distance?: number
  routeShortName?: string
  routeLongName?: string
  displayName?: string
  routeColor?: string
  legGeometry?: { points?: string }
}
type MotisItinerary = { duration?: number; legs?: MotisLeg[] }

function decodePolyline6(encoded?: string): Coordinates[] {
  if (!encoded) return []
  const path: Coordinates[] = []
  let index = 0
  let lat = 0
  let lng = 0
  const nextValue = () => {
    let result = 0
    let shift = 0
    let byte = 0
    do {
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20 && index < encoded.length)
    return result & 1 ? ~(result >> 1) : result >> 1
  }
  while (index < encoded.length) {
    lat += nextValue()
    lng += nextValue()
    path.push({ lat: lat / 1e6, lng: lng / 1e6 })
  }
  return path
}

function transitPathMode(mode?: string): PathMode {
  const value = (mode || '').toUpperCase()
  if (value === 'WALK') return 'WALKING'
  if (value === 'BUS' || value === 'COACH') return 'BUS'
  if (value === 'TRAM') return 'TRAM'
  if (value === 'SUBWAY') return 'SUBWAY'
  if (value.includes('RAIL') || ['SUBURBAN', 'HIGHSPEED', 'LONG_DISTANCE', 'REGIONAL', 'REGIONAL_FAST'].includes(value)) return 'RAIL'
  return 'TRANSIT'
}

async function computeTransitRoute(origin: Coordinates, destination: Coordinates): Promise<NavLegResult | null> {
  const params = new URLSearchParams({
    fromPlace: `${origin.lat},${origin.lng}`,
    toPlace: `${destination.lat},${destination.lng}`,
    time: transitDepartureTime().toISOString(),
    transitModes: 'TRANSIT',
    directModes: '',
    numItineraries: '1',
    maxItineraries: '2',
    timetableView: 'false',
    detailedLegs: 'true',
    language: 'fr',
  })
  try {
    const response = await authFetch(`/api/transitous/api/v6/plan?${params}`, {
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) return null
    const payload = (await response.json()) as { itineraries?: MotisItinerary[] }
    const itinerary = payload.itineraries?.find((row) =>
      row.legs?.some((leg) => transitPathMode(leg.mode) !== 'WALKING'),
    )
    if (!itinerary?.legs?.length) return null
    const segments: RouteSegment[] = []
    const path: Coordinates[] = []
    const transitLines: TransitLineInfo[] = []
    let distanceMeters = 0
    for (const leg of itinerary.legs) {
      const mode = transitPathMode(leg.mode)
      const legPath = decodePolyline6(leg.legGeometry?.points)
      if (legPath.length) path.push(...(path.length ? legPath.slice(1) : legPath))
      const shortName = leg.routeShortName || leg.displayName
      const label = mode === 'WALKING' ? '步行' : formatTransitLineLabel(mode, shortName, leg.routeLongName)
      const color = normalizeHexColor(leg.routeColor) || PATH_MODE_COLORS[mode]
      const distance = Number(leg.distance) || 0
      const duration = Number(leg.duration) || 0
      distanceMeters += distance
      if (legPath.length >= 2) {
        segments.push({ mode, path: legPath, color, label, distanceMeters: distance, durationSeconds: duration })
      }
      if (mode !== 'WALKING' && !transitLines.some((line) => line.label === label)) {
        transitLines.push({ mode, label, shortName, color })
      }
    }
    if (path.length < 2 || !transitLines.length) return null
    const durationSeconds = Number(itinerary.duration) || itinerary.legs.reduce(
      (sum, leg) => sum + (Number(leg.duration) || 0),
      0,
    )
    return {
      mode: 'TRANSIT',
      path,
      distanceMeters,
      durationSeconds,
      distanceText: formatDistance(distanceMeters),
      durationText: formatDuration(durationSeconds),
      segments: mergeAdjacentSegments(segments),
      transitLines,
      transitSummary: transitLines.map((line) => line.label).slice(0, 3).join(' / '),
    }
  } catch {
    return null
  }
}

const WALK_MAX_SECONDS = 18 * 60
const WALK_MAX_METERS = 1400

function asResolved(leg: NavLegResult, displayMode: NavMode): ResolvedDayLeg {
  return { ...leg, displayMode, label: buildLegLabel(leg, displayMode) }
}

async function resolveTravelLeg(
  origin: Coordinates,
  destination: Coordinates,
  pace: string,
): Promise<ResolvedDayLeg | null> {
  const walk = await computeStreetRoute(origin, destination, 'WALKING')
  if (walk && (walk.durationSeconds <= WALK_MAX_SECONDS || walk.distanceMeters <= WALK_MAX_METERS)) {
    return asResolved(walk, 'WALKING')
  }
  if (pace === '自驾日' || pace === '乐园日') {
    const drive = await computeStreetRoute(origin, destination, 'DRIVING')
    if (drive) return asResolved(drive, 'DRIVING')
  }
  const transit = await computeTransitRoute(origin, destination)
  if (transit) return asResolved(transit, 'TRANSIT')
  return walk ? asResolved(walk, 'WALKING') : null
}

function walkingStats(legs: Array<ResolvedDayLeg | null>) {
  let distanceMeters = 0
  let durationSeconds = 0
  for (const leg of legs) {
    if (!leg) continue
    const walking = leg.segments.filter((segment) => segment.mode === 'WALKING')
    if (walking.length) {
      for (const segment of walking) {
        distanceMeters += segment.distanceMeters || 0
        durationSeconds += segment.durationSeconds || 0
      }
    } else if (leg.displayMode === 'WALKING') {
      distanceMeters += leg.distanceMeters
      durationSeconds += leg.durationSeconds
    }
  }
  return { distanceMeters, durationSeconds }
}

function describeLeg(leg: ResolvedDayLeg | null): string {
  if (!leg) return '请根据地图出发'
  if (leg.displayMode === 'WALKING') return `步行 · ${leg.distanceText} · ${leg.durationText}`
  if (leg.displayMode === 'DRIVING') return `驾车 · ${leg.distanceText} · ${leg.durationText}`
  const lines = leg.transitLines.map((line) => line.label).filter(Boolean)
  return `${lines.join(' · ') || leg.transitSummary || '公共交通'} · ${leg.durationText}`
}

function roughlySamePoint(a: Coordinates, b: Coordinates, withinMeters = 500): boolean {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h)) <= withinMeters
}

function collectSegments(legs: Array<ResolvedDayLeg | null>): RouteSegment[] {
  return legs.flatMap((leg) => leg?.segments || [])
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
      lastToDestinationText: destination ? `添加地点后显示前往${destinationLabel}的方式` : '',
      segments: [],
      routePath: [],
      hotelLinkPath: [],
      stopsKey,
    }
  }
  const originIsFirst = roughlySamePoint(origin, stops[0], 80)
  const hotelToFirst = originIsFirst ? null : await resolveTravelLeg(origin, stops[0], pace)
  const betweenStops: Array<ResolvedDayLeg | null> = []
  for (let index = 0; index < stops.length - 1; index += 1) {
    betweenStops.push(await resolveTravelLeg(stops[index], stops[index + 1], pace))
  }
  const lastStop = stops[stops.length - 1]
  const lastIsDestination = Boolean(destination && roughlySamePoint(lastStop, destination))
  const lastToDestination = destination && !lastIsDestination
    ? await resolveTravelLeg(lastStop, destination, pace)
    : null
  const allLegs = [hotelToFirst, ...betweenStops, lastToDestination]
  const walk = walkingStats(allLegs)
  const routePath: Coordinates[] = []
  betweenStops.forEach((leg, index) => {
    if (!leg?.path.length) {
      if (index === 0) routePath.push({ ...stops[0] })
      routePath.push({ ...stops[index + 1] })
      return
    }
    routePath.push(...(index === 0 ? leg.path : leg.path.slice(1)))
  })
  const hotelLinkPath = hotelToFirst?.path.length
    ? hotelToFirst.path
    : originIsFirst
      ? []
      : [origin, stops[0]]
  const anyLeg = allLegs.some(Boolean)
  return {
    hotelToFirst,
    betweenStops,
    lastToDestination,
    walkDistanceMeters: walk.distanceMeters,
    walkDurationSeconds: walk.durationSeconds,
    walkSummaryText: formatWalkSummary(walk.distanceMeters, walk.durationSeconds),
    hotelToFirstText: originIsFirst ? '本日出发' : describeLeg(hotelToFirst),
    lastToDestinationText: lastIsDestination ? `本日终点：${destinationLabel}` : describeLeg(lastToDestination),
    segments: collectSegments(allLegs),
    routePath,
    hotelLinkPath,
    stopsKey,
    error: anyLeg || originIsFirst || lastIsDestination ? undefined : '暂时无法获取导航路线。',
  }
}
