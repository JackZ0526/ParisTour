/**
 * Serializable navigation display types retained for saved-trip compatibility.
 * Live route calculation has intentionally been removed; timeline connectors
 * now open key-free Google Maps URLs instead.
 */

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
  routePath: google.maps.LatLngLiteral[]
  hotelLinkPath: google.maps.LatLngLiteral[]
  stopsKey?: string
  error?: string
}
