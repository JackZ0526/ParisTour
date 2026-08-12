import type { Coordinates } from '../../../types'
import { getLlmArtifact, setLlmArtifact } from '../../../shared/services/llm/llmArtifactStore'
import {
  placeIdentitySimilarity,
  PLACE_NAME_MATCH_MIN,
} from '../../../shared/utils/placeTitle'
import { tryConsumeGoogleRequest } from './googleRequestBudget'

export interface GoogleReview {
  text: string
  rating?: number
  author?: string
  relativeTime?: string
}

export interface GooglePlaceDetails {
  id?: string
  /** The provider's original/local display name (requests use French). */
  name: string
  /** Kept for the existing bilingual UI contract. */
  nameOriginal?: string
  address?: string
  rating?: number
  userRatingCount?: number
  /** Empty unless a previously persisted image is available; photo media costs another request. */
  photos: string[]
  reviews: GoogleReview[]
  summary?: string
  phone?: string
  website?: string
  openingHours?: string[]
  priceLevel?: string
  location?: Coordinates
  query: string
}

export interface GooglePlaceSearchOptions {
  /** Reject candidates farther than this from `location`. */
  maxDistanceMeters?: number
  /** Exact Places identity; uses one details request when not cached. */
  placeId?: string
  /** Legacy option retained for call-site compatibility. */
  recoverFromLocation?: boolean
}

export interface NearbyGooglePlaceCandidate {
  id?: string
  name: string
  address?: string
  rating?: number
  userRatingCount?: number
  priceLevel?: string
  location: Coordinates
  distanceMeters: number
}

type LocalizedText =
  | string
  | { text?: string; languageCode?: string }
  | null
  | undefined

interface RapidPlace {
  id?: string
  name?: string
  displayName?: LocalizedText
  formattedAddress?: string
  shortFormattedAddress?: string
  location?: {
    latitude?: number
    longitude?: number
    lat?: number
    lng?: number
  }
  rating?: number
  userRatingCount?: number
  editorialSummary?: LocalizedText
  nationalPhoneNumber?: string
  internationalPhoneNumber?: string
  websiteUri?: string
  websiteURI?: string
  regularOpeningHours?: { weekdayDescriptions?: string[] }
  currentOpeningHours?: { weekdayDescriptions?: string[] }
  priceLevel?: string
  photos?: Array<{ name?: string }>
  reviews?: Array<{
    text?: LocalizedText
    originalText?: LocalizedText
    rating?: number
    relativePublishTimeDescription?: string
    authorAttribution?: { displayName?: string }
  }>
}

interface RapidSearchResponse {
  places?: RapidPlace[]
}

const DETAILS_PREFIX = 'rapid-google-place:v1:'
const CANDIDATES_PREFIX = 'rapid-google-candidates:v2:'
const detailMemory = new Map<string, GooglePlaceDetails>()
const candidateMemory = new Map<string, NearbyGooglePlaceCandidate[]>()
const inflight = new Map<string, Promise<GooglePlaceDetails | null>>()

function textOf(value: LocalizedText): string {
  if (typeof value === 'string') return value.trim()
  return value?.text?.trim() || ''
}

function normalizeLookup(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, ' ')
}

/** Never send a translated CJK name to Places text search. */
function originalSearchLabel(label?: string): string {
  const value = label?.trim()
  if (!value) return ''
  const latinOnly = value
    .replace(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,，、·|—–-]+|[\s,，、·|—–-]+$/g, '')
    .trim()
  const meaningful = latinOnly
    .replace(/\b(?:paris|france)\b/gi, '')
    .replace(/[^\p{Script=Latin}\p{M}]/gu, '')
  return meaningful ? latinOnly : ''
}

function detailKey(kind: 'id' | 'query' | 'name', value: string, location?: Coordinates) {
  const suffix = location
    ? `|${location.lat.toFixed(4)},${location.lng.toFixed(4)}`
    : ''
  return `${DETAILS_PREFIX}${kind}:${normalizeLookup(value)}${suffix}`
}

function reviveDetails(value: unknown): GooglePlaceDetails | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Partial<GooglePlaceDetails>
  if (!item.name?.trim() || typeof item.query !== 'string') return null
  return {
    ...item,
    name: item.name,
    query: item.query,
    photos: Array.isArray(item.photos)
      ? item.photos.filter((url): url is string => typeof url === 'string' && Boolean(url))
      : [],
    reviews: Array.isArray(item.reviews)
      ? item.reviews.filter(
          (review): review is GoogleReview =>
            Boolean(review && typeof review.text === 'string' && review.text.trim()),
        )
      : [],
  }
}

function readDetails(keys: string[]): GooglePlaceDetails | null {
  for (const key of keys) {
    const memory = detailMemory.get(key)
    if (memory) return memory
    const stored = reviveDetails(getLlmArtifact<GooglePlaceDetails>(key))
    if (stored) {
      detailMemory.set(key, stored)
      return stored
    }
  }
  return null
}

function aliasesFor(details: GooglePlaceDetails, query?: string, location?: Coordinates) {
  const aliases = new Set<string>()
  if (details.id) aliases.add(detailKey('id', details.id))
  if (details.name && details.location) {
    aliases.add(detailKey('name', details.name, details.location))
    aliases.add(detailKey('query', details.name, details.location))
    aliases.add(detailKey('query', `${details.name} Paris`, details.location))
  }
  if (query) {
    aliases.add(detailKey('name', details.name))
    aliases.add(detailKey('query', details.name))
    aliases.add(detailKey('query', `${details.name} Paris`))
    aliases.add(detailKey('query', query))
    if (location) aliases.add(detailKey('query', query, location))
  }
  return [...aliases]
}

function storeDetails(
  details: GooglePlaceDetails,
  query?: string,
  location?: Coordinates,
  options?: { silent?: boolean },
) {
  const keys = aliasesFor(details, query, location)
  if (!keys.length) return
  for (const key of keys) detailMemory.set(key, details)
  setLlmArtifact(keys[0], details, {
    aliases: keys.slice(1),
    silent: options?.silent,
  })
}

function toCoords(place: RapidPlace): Coordinates | undefined {
  const lat = place.location?.latitude ?? place.location?.lat
  const lng = place.location?.longitude ?? place.location?.lng
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined
  return { lat: Number(lat), lng: Number(lng) }
}

function normalizeRapidPlace(place: RapidPlace, query: string): GooglePlaceDetails | null {
  const name = textOf(place.displayName)
  if (!name) return null
  const reviews = (place.reviews || [])
    .map((review): GoogleReview | null => {
      const text = textOf(review.text) || textOf(review.originalText)
      if (!text) return null
      return {
        text,
        rating: review.rating,
        author: review.authorAttribution?.displayName,
        relativeTime: review.relativePublishTimeDescription,
      }
    })
    .filter((review): review is GoogleReview => Boolean(review))
    .slice(0, 8)

  return {
    id: place.id || place.name?.replace(/^places\//, ''),
    name,
    nameOriginal: name,
    address: place.formattedAddress || place.shortFormattedAddress,
    rating: place.rating,
    userRatingCount: place.userRatingCount,
    // The response sample confirms `photos[].name` is only a media handle.
    // Following it would be another endpoint call, so UI images remain cached/fallback.
    photos: [],
    reviews,
    summary: textOf(place.editorialSummary) || undefined,
    phone: place.nationalPhoneNumber || place.internationalPhoneNumber,
    website: place.websiteUri || place.websiteURI,
    openingHours:
      place.regularOpeningHours?.weekdayDescriptions ||
      place.currentOpeningHours?.weekdayDescriptions,
    priceLevel: place.priceLevel,
    location: toCoords(place),
    query,
  }
}

function haversineMeters(a: Coordinates, b: Coordinates): number {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180
  const earthRadius = 6_371_000
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * earthRadius * Math.asin(Math.sqrt(h))
}

function candidateScore(
  details: GooglePlaceDetails,
  query: string,
  location?: Coordinates,
  maxDistanceMeters?: number,
): number {
  const similarity = placeIdentitySimilarity(query, details.name)
  if (similarity < PLACE_NAME_MATCH_MIN) return Number.NEGATIVE_INFINITY
  let score = similarity * 70
  if (details.rating != null) score += details.rating
  if (details.userRatingCount) {
    score += Math.min(Math.log10(details.userRatingCount + 1) * 6, 20)
  }
  if (location && details.location) {
    const distance = haversineMeters(location, details.location)
    if (maxDistanceMeters && distance > maxDistanceMeters) {
      return Number.NEGATIVE_INFINITY
    }
    score -= Math.min(distance / 400, 25)
  }
  return score
}

async function rapidRequest<T>(
  kind: 'place-search' | 'place-details',
  rest: string,
  init?: RequestInit,
): Promise<T | null> {
  if (!tryConsumeGoogleRequest(kind)) return null
  const { authFetch } = await import('../../auth/services/authFetch')
  const [path, upstreamSearch] = rest.split('?', 2)
  const response = await authFetch(
    `/api/google-places?rest=${encodeURIComponent(path)}${upstreamSearch ? `&${upstreamSearch}` : ''}`,
    init,
  )
  if (!response.ok) {
    const message = await response.text().catch(() => '')
    throw new Error(`Places request failed (${response.status})${message ? `: ${message}` : ''}`)
  }
  return (await response.json()) as T
}

async function searchFullPlaces(
  textQuery: string,
  location?: Coordinates,
  maxDistanceMeters?: number,
  pageSize = 8,
): Promise<GooglePlaceDetails[]> {
  const body: Record<string, unknown> = {
    textQuery,
    languageCode: 'fr',
    regionCode: 'FR',
    pageSize: Math.max(1, Math.min(20, pageSize)),
  }
  if (location) {
    body.locationBias = {
      circle: {
        center: { latitude: location.lat, longitude: location.lng },
        radius: Math.max(100, Math.min(50_000, maxDistanceMeters || 10_000)),
      },
    }
  }
  const payload = await rapidRequest<RapidSearchResponse>(
    'place-search',
    'v1/places:searchText',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
  )
  const details = (payload?.places || [])
    .map((place) => normalizeRapidPlace(place, textQuery))
    .filter((item): item is GooglePlaceDetails => Boolean(item))
  // One search response often contains several complete places. Save all of
  // them now so clicking any returned candidate later costs zero requests.
  for (const item of details) storeDetails(item, undefined, undefined, { silent: true })
  return details
}

async function detailsById(placeId: string, query: string): Promise<GooglePlaceDetails | null> {
  const raw = await rapidRequest<RapidPlace>(
    'place-details',
    `v1/places/${encodeURIComponent(placeId)}?languageCode=fr&regionCode=FR`,
  )
  const details = raw ? normalizeRapidPlace(raw, query) : null
  if (details) storeDetails(details, query)
  return details
}

export async function searchNearbyGooglePlaceCandidates(input: {
  textQuery: string
  location: Coordinates
  maxDistanceMeters: number
  limit?: number
}): Promise<NearbyGooglePlaceCandidate[]> {
  const textQuery = originalSearchLabel(input.textQuery)
  if (!textQuery) return []
  const limit = Math.max(1, Math.min(10, input.limit || 5))
  const key = `${CANDIDATES_PREFIX}${normalizeLookup(textQuery)}|${input.location.lat.toFixed(4)},${input.location.lng.toFixed(4)}|${Math.round(input.maxDistanceMeters)}|${limit}`
  const memory = candidateMemory.get(key)
  if (memory) return memory
  const stored = getLlmArtifact<NearbyGooglePlaceCandidate[]>(key)
  if (Array.isArray(stored)) {
    candidateMemory.set(key, stored)
    return stored
  }

  const places = await searchFullPlaces(
    textQuery,
    input.location,
    input.maxDistanceMeters,
    Math.max(8, limit * 2),
  )
  const result = places
    .map((place): NearbyGooglePlaceCandidate | null => {
      if (!place.location) return null
      const distanceMeters = haversineMeters(input.location, place.location)
      if (distanceMeters > input.maxDistanceMeters) return null
      return {
        id: place.id,
        name: place.name,
        address: place.address,
        rating: place.rating,
        userRatingCount: place.userRatingCount,
        priceLevel: place.priceLevel,
        location: place.location,
        distanceMeters,
      }
    })
    .filter((item): item is NearbyGooglePlaceCandidate => Boolean(item))
    .sort((a, b) => {
      const quality = (item: NearbyGooglePlaceCandidate) =>
        (item.rating || 0) * 20 +
        Math.min(Math.log10((item.userRatingCount || 0) + 1), 4) * 5 -
        item.distanceMeters / 1_000
      return quality(b) - quality(a)
    })
    .slice(0, limit)

  candidateMemory.set(key, result)
  setLlmArtifact(key, result)
  return result
}

/**
 * Returns one complete shared place record. A cache miss costs exactly one
 * RapidAPI endpoint request: details when an ID is known, otherwise Text Search.
 */
export async function fetchGooglePlaceDetails(
  query: string,
  location: Coordinates | undefined,
  options: GooglePlaceSearchOptions = {},
): Promise<GooglePlaceDetails | null> {
  const lookupQuery = originalSearchLabel(query)
  const placeId = options.placeId?.trim()
  const keys = [
    ...(placeId ? [detailKey('id', placeId)] : []),
    ...(lookupQuery && location ? [detailKey('query', lookupQuery, location)] : []),
    ...(lookupQuery ? [detailKey('query', lookupQuery)] : []),
  ]
  const cached = readDetails(keys)
  if (cached) return cached
  if (!placeId && !lookupQuery) return null

  const inflightKey = placeId ? `id:${placeId}` : `query:${lookupQuery}|${location?.lat},${location?.lng}`
  const pending = inflight.get(inflightKey)
  if (pending) return pending

  const task = (async () => {
    if (placeId) return detailsById(placeId, lookupQuery)
    const places = await searchFullPlaces(
      lookupQuery,
      location,
      options.maxDistanceMeters,
      8,
    )
    let best: GooglePlaceDetails | null = null
    let bestScore = Number.NEGATIVE_INFINITY
    for (const place of places) {
      const score = candidateScore(
        place,
        lookupQuery,
        location,
        options.maxDistanceMeters,
      )
      if (score > bestScore) {
        best = place
        bestScore = score
      }
    }
    if (!best || !Number.isFinite(bestScore)) return null
    storeDetails(best, lookupQuery, location)
    return best
  })()

  inflight.set(inflightKey, task)
  try {
    return await task
  } finally {
    inflight.delete(inflightKey)
  }
}

export function placeDetailsQuery(name: string, nameLocal?: string): string {
  const label = originalSearchLabel(nameLocal) || originalSearchLabel(name)
  if (!label) return ''
  if (/\b(?:paris|france)\b|cdg|airport/i.test(label)) return label
  return `${label} Paris`
}

/** Synchronous read of the same durable payload used by every component. */
export function peekGooglePlaceDetails(
  name: string,
  nameLocal?: string,
  location?: Coordinates,
): GooglePlaceDetails | null {
  const query = placeDetailsQuery(name, nameLocal)
  if (!query) return null
  return readDetails([
    ...(location ? [detailKey('query', query, location)] : []),
    ...(location
      ? [
          detailKey(
            'name',
            originalSearchLabel(nameLocal) || originalSearchLabel(name),
            location,
          ),
        ]
      : []),
    detailKey('query', query),
    detailKey('name', originalSearchLabel(nameLocal) || originalSearchLabel(name)),
  ])
}
