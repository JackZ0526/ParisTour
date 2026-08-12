import type { Coordinates } from '../../../types'
import { getLlmArtifact, setLlmArtifact } from '../../../shared/services/llm/llmArtifactStore'

export interface PlaceReview {
  text: string
  rating?: number
  author?: string
  relativeTime?: string
}

/** Provider-neutral place payload. Empty rating/review fields are intentional for OSM. */
export interface PlaceDetails {
  id?: string
  name: string
  nameOriginal?: string
  address?: string
  rating?: number
  userRatingCount?: number
  photos: string[]
  reviews: PlaceReview[]
  summary?: string
  phone?: string
  website?: string
  openingHours?: string[]
  priceLevel?: string
  location?: Coordinates
  query: string
}

export interface PlaceSearchOptions {
  maxDistanceMeters?: number
  /** Provider-neutral stable id. New ids use `osm:<type>:<number>`. */
  placeId?: string
  recoverFromLocation?: boolean
}

export interface NearbyPlaceCandidate {
  id?: string
  name: string
  address?: string
  rating?: number
  userRatingCount?: number
  priceLevel?: string
  location: Coordinates
  distanceMeters: number
}

type NominatimRow = {
  osm_type?: 'node' | 'way' | 'relation'
  osm_id?: number
  lat?: string
  lon?: string
  display_name?: string
  name?: string
  type?: string
  category?: string
  importance?: number
  address?: Record<string, string>
  extratags?: Record<string, string>
  namedetails?: Record<string, string>
}

const detailsCache = new Map<string, PlaceDetails>()
const inflight = new Map<string, Promise<PlaceDetails | null>>()
const DETAILS_ARTIFACT_PREFIX = 'place-details:osm:v1:'
const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org'
const MIN_REQUEST_GAP_MS = 1100
let nominatimQueue: Promise<unknown> = Promise.resolve()
let lastNominatimRequestAt = 0

function normalizeQuery(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function originalSearchLabel(label?: string): string {
  const value = label?.trim()
  if (!value) return ''
  const withoutCjk = value
    .replace(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return /\p{Script=Latin}/u.test(withoutCjk) ? withoutCjk : value
}

function haversineMeters(a: Coordinates, b: Coordinates): number {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180
  const radius = 6_371_000
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * radius * Math.asin(Math.sqrt(h))
}

function coordinatesOf(row: NominatimRow): Coordinates | undefined {
  const lat = Number(row.lat)
  const lng = Number(row.lon)
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : undefined
}

function stableId(row: NominatimRow): string | undefined {
  return row.osm_type && Number.isFinite(row.osm_id)
    ? `osm:${row.osm_type}:${row.osm_id}`
    : undefined
}

function osmLookupId(value?: string): string | undefined {
  const match = value?.match(/^osm:(node|way|relation):(\d+)$/)
  if (!match) return undefined
  const prefix = match[1] === 'node' ? 'N' : match[1] === 'way' ? 'W' : 'R'
  return `${prefix}${match[2]}`
}

function photoUrls(row: NominatimRow): string[] {
  const tags = row.extratags || {}
  const out: string[] = []
  const image = tags.image?.trim()
  if (image && /^https:\/\//i.test(image)) out.push(image)
  const commons = tags.wikimedia_commons?.trim()
  if (commons) {
    const fileName = commons.replace(/^File:/i, '')
    out.push(
      `https://commons.wikimedia.org/wiki/Special:Redirect/file/${encodeURIComponent(fileName)}`,
    )
  }
  return Array.from(new Set(out))
}

function preferredName(row: NominatimRow): { name: string; original?: string } {
  const names = row.namedetails || {}
  const original =
    names['name:fr'] || names['name:en'] || names.name || row.name || row.display_name?.split(',')[0] || ''
  const chinese = names['name:zh'] || names['name:zh-Hans']
  return {
    name: chinese || original,
    original: chinese && original !== chinese ? original : undefined,
  }
}

function detailsFromRow(row: NominatimRow, query: string): PlaceDetails | null {
  const location = coordinatesOf(row)
  const names = preferredName(row)
  if (!location || !names.name) return null
  const tags = row.extratags || {}
  const opening = tags.opening_hours?.trim()
  return {
    id: stableId(row),
    name: names.name,
    nameOriginal: names.original,
    address: row.display_name,
    photos: photoUrls(row),
    reviews: [],
    summary: tags.description || tags['description:en'] || tags['description:fr'],
    phone: tags.phone || tags['contact:phone'],
    website: tags.website || tags['contact:website'] || tags.url,
    openingHours: opening ? [opening] : undefined,
    location,
    query,
  }
}

function cacheKey(query: string, location?: Coordinates, options?: PlaceSearchOptions): string {
  const id = options?.placeId?.trim()
  const identity = id?.startsWith('osm:') ? id : normalizeQuery(query).toLowerCase()
  const point = location ? `|${location.lat.toFixed(4)},${location.lng.toFixed(4)}` : ''
  const max = options?.maxDistanceMeters ? `|max:${Math.round(options.maxDistanceMeters)}` : ''
  return `${identity}${point}${max}`
}

function reviveStored(value: unknown): PlaceDetails | null {
  if (!value || typeof value !== 'object') return null
  const stored = value as Partial<PlaceDetails>
  if (!stored.name?.trim() || typeof stored.query !== 'string') return null
  return {
    ...stored,
    name: stored.name,
    query: stored.query,
    photos: Array.isArray(stored.photos) ? stored.photos.filter((url): url is string => typeof url === 'string') : [],
    reviews: Array.isArray(stored.reviews)
      ? stored.reviews.filter((review): review is PlaceReview => Boolean(review?.text?.trim()))
      : [],
  }
}

async function nominatimFetch(path: string, params: URLSearchParams): Promise<unknown> {
  const run = async () => {
    const waitMs = Math.max(0, MIN_REQUEST_GAP_MS - (Date.now() - lastNominatimRequestAt))
    if (waitMs) await new Promise((resolve) => window.setTimeout(resolve, waitMs))
    lastNominatimRequestAt = Date.now()
    const response = await fetch(`${NOMINATIM_BASE}${path}?${params.toString()}`, {
      headers: { Accept: 'application/json', 'Accept-Language': 'fr,en;q=0.8,zh-CN;q=0.6' },
    })
    if (!response.ok) throw new Error(`OpenStreetMap 查询失败（${response.status}）`)
    return response.json()
  }
  const task = nominatimQueue.then(run, run)
  nominatimQueue = task.catch(() => undefined)
  return task
}

function commonParams(): Record<string, string> {
  return {
    format: 'jsonv2',
    addressdetails: '1',
    extratags: '1',
    namedetails: '1',
    countrycodes: 'fr',
  }
}

async function lookupByOsmId(id: string): Promise<NominatimRow | null> {
  const payload = (await nominatimFetch(
    '/lookup',
    new URLSearchParams({ ...commonParams(), osm_ids: id }),
  )) as NominatimRow[]
  return payload[0] || null
}

async function reverseLocation(location: Coordinates): Promise<NominatimRow | null> {
  const payload = (await nominatimFetch(
    '/reverse',
    new URLSearchParams({
      ...commonParams(),
      lat: String(location.lat),
      lon: String(location.lng),
      zoom: '18',
    }),
  )) as NominatimRow
  return payload?.lat ? payload : null
}

async function searchRows(query: string, limit: number, location?: Coordinates): Promise<NominatimRow[]> {
  const params = new URLSearchParams({
    ...commonParams(),
    q: query,
    limit: String(Math.min(40, Math.max(1, limit))),
    dedupe: '1',
  })
  if (location) {
    const lngSpan = 0.18
    const latSpan = 0.13
    params.set(
      'viewbox',
      `${location.lng - lngSpan},${location.lat + latSpan},${location.lng + lngSpan},${location.lat - latSpan}`,
    )
  }
  return (await nominatimFetch('/search', params)) as NominatimRow[]
}

function rowScore(row: NominatimRow, location?: Coordinates): number {
  const coords = coordinatesOf(row)
  const distancePenalty = location && coords ? haversineMeters(location, coords) / 1_000 : 0
  return (row.importance || 0) * 100 - distancePenalty
}

export async function searchNearbyPlaceCandidates(input: {
  textQuery: string
  location: Coordinates
  maxDistanceMeters: number
  limit?: number
}): Promise<NearbyPlaceCandidate[]> {
  const rows = await searchRows(input.textQuery, Math.max(12, (input.limit || 5) * 3), input.location)
  return rows
    .map((row): NearbyPlaceCandidate | null => {
      const location = coordinatesOf(row)
      const name = preferredName(row).original || preferredName(row).name
      if (!location || !name) return null
      const distanceMeters = haversineMeters(input.location, location)
      if (distanceMeters > input.maxDistanceMeters) return null
      return {
        id: stableId(row),
        name,
        address: row.display_name,
        location,
        distanceMeters,
      }
    })
    .filter((row): row is NearbyPlaceCandidate => Boolean(row))
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, Math.max(1, input.limit || 5))
}

export async function fetchPlaceDetails(
  query: string,
  location?: Coordinates,
  options?: PlaceSearchOptions,
): Promise<PlaceDetails | null> {
  const lookupQuery = normalizeQuery(originalSearchLabel(query))
  const key = cacheKey(lookupQuery, location, options)
  const memory = detailsCache.get(key)
  if (memory) return memory
  const stored = reviveStored(getLlmArtifact<PlaceDetails>(`${DETAILS_ARTIFACT_PREFIX}${key}`))
  if (stored) {
    detailsCache.set(key, stored)
    return stored
  }
  const pending = inflight.get(key)
  if (pending) return pending

  const task = (async () => {
    let row: NominatimRow | null = null
    const osmId = osmLookupId(options?.placeId)
    if (osmId) row = await lookupByOsmId(osmId)
    if (!row && lookupQuery) {
      const rows = await searchRows(lookupQuery, 8, location)
      row = rows
        .filter((candidate) => {
          if (!location || !options?.maxDistanceMeters) return true
          const coords = coordinatesOf(candidate)
          return Boolean(coords && haversineMeters(location, coords) <= options.maxDistanceMeters)
        })
        .sort((a, b) => rowScore(b, location) - rowScore(a, location))[0] || null
    }
    if (!row && location && options?.recoverFromLocation) row = await reverseLocation(location)
    if (!row) return null
    const details = detailsFromRow(row, lookupQuery)
    if (!details) return null
    detailsCache.set(key, details)
    setLlmArtifact(`${DETAILS_ARTIFACT_PREFIX}${key}`, details)
    return details
  })()
  inflight.set(key, task)
  try {
    return await task
  } finally {
    inflight.delete(key)
  }
}

export function placeDetailsQuery(name: string, nameLocal?: string): string {
  const label = originalSearchLabel(nameLocal) || originalSearchLabel(name)
  if (!label) return ''
  if (/paris|france|cdg|airport/i.test(label)) return label
  return `${label} Paris`
}

export function peekPlaceDetails(
  name: string,
  nameLocal?: string,
  location?: Coordinates,
): PlaceDetails | null {
  const key = cacheKey(placeDetailsQuery(name, nameLocal), location)
  const memory = detailsCache.get(key)
  if (memory) return memory
  const stored = reviveStored(getLlmArtifact<PlaceDetails>(`${DETAILS_ARTIFACT_PREFIX}${key}`))
  if (stored) detailsCache.set(key, stored)
  return stored
}
