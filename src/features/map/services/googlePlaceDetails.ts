import type { Coordinates } from '../../../types'
import {
  getLlmArtifact,
  removeLlmArtifact,
  setLlmArtifact,
} from '../../../shared/services/llm/llmArtifactStore'
import {
  placeIdentitySimilarity,
  PLACE_NAME_MATCH_MIN,
} from '../../../shared/utils/placeTitle'
import {
  getGoogleRequestBudgetSnapshot,
  tryConsumeGoogleRequest,
} from './googleRequestBudget'
import {
  withGoogleMapsPhotoKey,
  withoutGoogleMapsPhotoKey,
} from './googleMapsKey'

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
  /** Place Photo media URLs built from `photos[].name` already in the Place payload. */
  photos: string[]
  reviews: GoogleReview[]
  summary?: string
  phone?: string
  website?: string
  openingHours?: string[]
  priceLevel?: string
  location?: Coordinates
  query: string
  /** True after the one-shot photos/reviews detail response is cached. */
  fullDetails?: true
}

export interface GooglePlaceSearchOptions {
  /** Reject candidates farther than this from `location`. */
  maxDistanceMeters?: number
  /** Exact Places identity; uses one details request when not cached. */
  placeId?: string
  /** Legacy option retained for call-site compatibility. */
  recoverFromLocation?: boolean
  /**
   * When a cached search hit has no website, try Place Details once so we can
   * scrape official photos. Never retry on later opens — missing website is a
   * stable Google field, and retries burn the daily Places quota.
   */
  recoverPhotos?: boolean
  /** Expanded photos/reviews mode; reserved for an explicit provider fallback. */
  requireFullDetails?: boolean
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
  photos?: Array<{
    name?: string
    photoUri?: string
    uri?: string
    url?: string
    photoUrl?: string
    photo_url?: string
    imageUrl?: string
    image_url?: string
    thumbnailUrl?: string
    thumbnail_url?: string
    photo_reference?: string
    photoReference?: string
  }>
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

type RapidPhoto = NonNullable<RapidPlace['photos']>[number]

const DETAILS_PREFIX = 'rapid-google-place:v4:'
const CANDIDATES_PREFIX = 'rapid-google-candidates:v3:'
const PHOTO_URI_PREFIX = 'rapid-google-photo-uri:v1:'
const WEBSITE_RECOVERY_PREFIX = 'rapid-google-website-recovery:v1:'
const RAPID_DETAILS_FALLBACK_PREFIX = 'rapid-google-details-fallback:v1:'
const RAPID_PHOTO_FALLBACK_PREFIX = 'rapid-google-photo-fallback:v1:'
const MAX_PLACE_PHOTOS = 8
const PLACE_PHOTO_MAX_PX = 900
const detailMemory = new Map<string, GooglePlaceDetails>()
const candidateMemory = new Map<string, NearbyGooglePlaceCandidate[]>()
const inflight = new Map<string, Promise<GooglePlaceDetails | null>>()
const photoUriMemory = new Map<string, string>()
const photoInflight = new Map<string, Promise<string | null>>()
const websiteRecoveryMemory = new Set<string>()
const rapidDetailsFallbackMemory = new Set<string>()
// `null` is a confirmed provider miss. Persist both hits and misses so opening
// the same place on another device does not spend the two-call photo fallback
// again. The explicit no-photo retry clears this entry first.
const rapidPhotoFallbackCache = new Map<string, string | null>()

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

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value)
}

function isResolvedPhotoUri(value: string): boolean {
  return (
    isHttpUrl(value) &&
    !value.includes('places.googleapis.com') &&
    !value.includes('maps.googleapis.com/maps/api/place/photo')
  )
}

/** Parse a Place Photo (New) resource from a name, media URL, or legacy photo URL. */
export function parseGooglePhotoResource(
  value: string,
  placeId?: string,
): { placeId: string; photoResource: string } | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const fallbackId = placeId?.replace(/^places\//, '').trim()

  if (trimmed.includes('maps.googleapis.com/maps/api/place/photo')) {
    try {
      const ref = new URL(trimmed).searchParams.get('photoreference')
      if (ref && fallbackId) return { placeId: fallbackId, photoResource: ref }
    } catch {
      /* ignore */
    }
    return null
  }

  const fromPath = trimmed.match(/places\/([^/]+)\/photos\/([^/?]+)/)
  if (fromPath) {
    return {
      placeId: fromPath[1],
      photoResource: fromPath[2].replace(/\/media$/, ''),
    }
  }

  if (fallbackId && !trimmed.includes('/') && !isHttpUrl(trimmed)) {
    return { placeId: fallbackId, photoResource: trimmed }
  }
  return null
}

function storedPhotoRef(
  parsed: { placeId: string; photoResource: string },
): string {
  return `places/${parsed.placeId}/photos/${parsed.photoResource}`
}

/** @deprecated Kept for tests; photos no longer resolve through Place Photo. */
export function googlePlacePhotoMediaUrl(
  photoName: string,
  maxPx = PLACE_PHOTO_MAX_PX,
): string | null {
  const parsed = parseGooglePhotoResource(photoName)
  if (!parsed) {
    return isHttpUrl(photoName) ? withoutGoogleMapsPhotoKey(photoName) : null
  }
  return `https://places.googleapis.com/v1/${storedPhotoRef(parsed)}/media?maxHeightPx=${maxPx}&maxWidthPx=${maxPx}`
}

function photoResourceName(photo: {
  name?: string
  photo_reference?: string
  photoReference?: string
}): string | null {
  const named = [photo.name, photo.photo_reference, photo.photoReference].find(
    (value) => typeof value === 'string' && value.trim(),
  )
  return named?.trim() || null
}

function photoAspectFromSize(photo: RapidPhoto): {
  width: number
  height: number
} | null {
  const candidate = photo as {
    widthPx?: number
    heightPx?: number
    maxWidthPx?: number
    maxHeightPx?: number
  }
  const width = Number(candidate.widthPx ?? candidate.maxWidthPx) || 0
  const height = Number(candidate.heightPx ?? candidate.maxHeightPx) || 0
  if (width > 0 && height > 0) return { width, height }
  return null
}

function scoreGooglePhotoForHero(
  photo: NonNullable<RapidPlace['photos']>[number],
): number {
  const size = photoAspectFromSize(photo)
  const area = size ? size.width * size.height : 0
  let score = area
  if (size) {
    if (size.width >= 1600) score += 4_000_000
    else if (size.width >= 1200) score += 2_000_000
    else if (size.width >= 800) score += 500_000
    if (size.width >= size.height) score += 200_000
  }
  const direct = [
    photo.photoUri,
    photo.uri,
    photo.url,
    photo.photoUrl,
    photo.photo_url,
    photo.imageUrl,
    photo.image_url,
    photo.thumbnailUrl,
    photo.thumbnail_url,
  ].some((value) => typeof value === 'string' && value.length)
  if (direct) score += 50_000
  return score
}

function pickTopGooglePhoto(photos: RapidPlace['photos'] | undefined): {
  photo: NonNullable<RapidPlace['photos']>[number]
  url: string
} | null {
  if (!Array.isArray(photos) || !photos.length) return null
  let best: NonNullable<RapidPlace['photos']>[number] | null = null
  let bestUrl: string | null = null
  let bestScore = Number.NEGATIVE_INFINITY
  for (const photo of photos) {
    if (!photo) continue
    const url = extractSingleGooglePhoto(photo)
    if (!url) continue
    const score = scoreGooglePhotoForHero(photo)
    if (score > bestScore) {
      best = photo
      bestUrl = url
      bestScore = score
    }
  }
  return best && bestUrl ? { photo: best, url: bestUrl } : null
}

function extractSingleGooglePhoto(
  photo: RapidPhoto,
): string | null {
  const id = photo.name?.replace(/^places\//, '').trim()
  const direct = [
    photo.photoUri,
    photo.uri,
    photo.url,
    photo.photoUrl,
    photo.photo_url,
    photo.imageUrl,
    photo.image_url,
    photo.thumbnailUrl,
    photo.thumbnail_url,
  ].find(
    (value): value is string => typeof value === 'string' && isResolvedPhotoUri(value),
  )
  if (direct) return withoutGoogleMapsPhotoKey(direct)
  if (photo.photo_reference || photo.photoReference) {
    const ref = (photo.photo_reference || photo.photoReference || '').trim()
    if (ref && id) return `places/${id}/photos/${ref.replace(/\/media$/, '')}`
  }
  const name = photoResourceName(photo)
  if (name && id) return name
  return null
}

function extractPlacePhotoUrls(
  photos: RapidPlace['photos'] | string[] | undefined,
  placeId?: string,
): string[] {
  if (!Array.isArray(photos)) return []
  const urls: string[] = []
  const seen = new Set<string>()
  const id = placeId?.replace(/^places\//, '').trim()
  for (const photo of photos) {
    let url: string | null = null
    if (typeof photo === 'string') {
      if (isResolvedPhotoUri(photo)) url = withoutGoogleMapsPhotoKey(photo)
      else {
        const parsed = parseGooglePhotoResource(photo, id)
        url = parsed ? storedPhotoRef(parsed) : null
      }
    } else if (photo && typeof photo === 'object') {
      const direct = [
        photo.photoUri,
        photo.uri,
        photo.url,
        photo.photoUrl,
        photo.photo_url,
        photo.imageUrl,
        photo.image_url,
        photo.thumbnailUrl,
        photo.thumbnail_url,
      ].find(
        (value) => typeof value === 'string' && isResolvedPhotoUri(value),
      )
      if (direct) {
        url = withoutGoogleMapsPhotoKey(direct)
      } else {
        const parsed = parseGooglePhotoResource(photoResourceName(photo) || '', id)
        url = parsed ? storedPhotoRef(parsed) : null
      }
    }
    if (!url || seen.has(url)) continue
    seen.add(url)
    urls.push(url)
    if (urls.length >= MAX_PLACE_PHOTOS) break
  }
  return urls
}

function photoCacheKey(photoName: string, placeId?: string): string | null {
  if (isResolvedPhotoUri(photoName)) return null
  const parsed = parseGooglePhotoResource(photoName, placeId)
  return parsed ? `${parsed.placeId}/${parsed.photoResource}` : null
}

function readStoredPhotoUri(cacheKey: string): string | null {
  const memory = photoUriMemory.get(cacheKey)
  if (memory) return memory
  const stored = getLlmArtifact<{ photoUri: string }>(`${PHOTO_URI_PREFIX}${cacheKey}`)
  if (stored?.photoUri) {
    photoUriMemory.set(cacheKey, stored.photoUri)
    return stored.photoUri
  }
  return null
}

/** Sync cache read — cards must not start a Place Photo request. */
export function peekGooglePlacePhotoMedia(
  photoName: string,
  placeId?: string,
): string | null {
  if (isResolvedPhotoUri(photoName)) return photoName
  const cacheKey = photoCacheKey(photoName, placeId)
  return cacheKey ? readStoredPhotoUri(cacheKey) : null
}

/**
 * Place Photo (New) is no longer used. Search/Details photo resource names
 * are not display URLs; Tripadvisor listing photos supply the album.
 */
export async function fetchGooglePlacePhotoMedia(
  photoName: string,
  placeId?: string,
): Promise<string | null> {
  return peekGooglePlacePhotoMedia(photoName, placeId)
}

function withDisplayPhotos(details: GooglePlaceDetails): GooglePlaceDetails {
  if (!details.photos.length) return details
  return {
    ...details,
    photos: details.photos.map((url) =>
      isResolvedPhotoUri(url) ? withGoogleMapsPhotoKey(url) : url,
    ),
  }
}

function forStorage(details: GooglePlaceDetails): GooglePlaceDetails {
  if (!details.photos.length) return details
  return {
    ...details,
    photos: details.photos.map((url) =>
      isResolvedPhotoUri(url) ? withoutGoogleMapsPhotoKey(url) : url,
    ),
  }
}

function reviveDetails(value: unknown): GooglePlaceDetails | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Partial<GooglePlaceDetails>
  if (!item.name?.trim() || typeof item.query !== 'string') return null
  return {
    ...item,
    name: item.name,
    query: item.query,
    photos: extractPlacePhotoUrls(
      item.photos as RapidPlace['photos'] | string[] | undefined,
      item.id,
    ),
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
    if (memory) return withDisplayPhotos(memory)
    const stored = reviveDetails(getLlmArtifact<GooglePlaceDetails>(key))
    if (stored) {
      detailMemory.set(key, stored)
      return withDisplayPhotos(stored)
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
): GooglePlaceDetails {
  const incoming = forStorage(details)
  const keys = aliasesFor(incoming, query, location)
  if (!keys.length) return withDisplayPhotos(incoming)
  const existing = readDetails(keys)
  const stored = existing
    ? forStorage(mergeGooglePlaceDetails(existing, incoming))
    : incoming
  for (const key of keys) detailMemory.set(key, stored)
  setLlmArtifact(keys[0], stored, {
    aliases: keys.slice(1),
  })
  return withDisplayPhotos(stored)
}

function mergeGoogleReviews(current: GoogleReview[], incoming: GoogleReview[]): GoogleReview[] {
  const seen = new Set<string>()
  const out: GoogleReview[] = []
  for (const review of [...incoming, ...current]) {
    const key = `${review.author || ''}|${review.rating || ''}|${review.text.trim()}`
    if (!review.text.trim() || seen.has(key)) continue
    seen.add(key)
    out.push(review)
    if (out.length >= 8) break
  }
  return out
}

/** Merge partial Search/Details responses without erasing previously paid fields. */
function mergeGooglePlaceDetails(
  current: GooglePlaceDetails,
  incoming: GooglePlaceDetails,
): GooglePlaceDetails {
  return {
    ...current,
    ...incoming,
    id: incoming.id || current.id,
    name: incoming.name || current.name,
    nameOriginal: incoming.nameOriginal || current.nameOriginal,
    address: incoming.address || current.address,
    rating: incoming.rating ?? current.rating,
    userRatingCount: incoming.userRatingCount ?? current.userRatingCount,
    photos: [...new Set([...(incoming.photos || []), ...(current.photos || [])])].slice(
      0,
      MAX_PLACE_PHOTOS,
    ),
    reviews: mergeGoogleReviews(current.reviews || [], incoming.reviews || []),
    summary: incoming.summary || current.summary,
    phone: incoming.phone || current.phone,
    website: incoming.website || current.website,
    openingHours: incoming.openingHours?.length
      ? incoming.openingHours
      : current.openingHours,
    priceLevel: incoming.priceLevel || current.priceLevel,
    location: incoming.location || current.location,
    query: incoming.query || current.query,
    fullDetails:
      incoming.fullDetails || current.fullDetails ? true : undefined,
  }
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
    photos: extractPlacePhotoUrls(
      place.photos,
      place.id || place.name?.replace(/^places\//, ''),
    ),
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
  kind: 'place-search' | 'place-details' | 'place-photo',
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
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    const budget = getGoogleRequestBudgetSnapshot()
    const provider = response.headers.get('x-paristour-places-provider') || 'unknown'
    console.info(
      `[places] ${kind} ${path} via ${provider} (${response.status}) used ${budget.used} ${kind}`,
    )
  }
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
  for (const item of details) storeDetails(item)
  return details
}

async function detailsById(
  placeId: string,
  query: string,
  fullDetails = false,
  rapidApiNewOnly = false,
): Promise<GooglePlaceDetails | null> {
  const id = placeId.replace(/^places\//, '').trim()
  if (!id) return null
  const raw = await rapidRequest<RapidPlace>(
    'place-details',
    `v1/places/${encodeURIComponent(id)}?languageCode=${rapidApiNewOnly ? 'en' : 'fr'}&regionCode=FR${fullDetails ? `&detailsMode=${rapidApiNewOnly ? 'reviews' : 'full'}` : ''}${rapidApiNewOnly ? '&provider=rapidapi-new' : ''}`,
  )
  const details = raw ? normalizeRapidPlace(raw, query) : null
  // The Tripadvisor fallback owns reviews only. Never leak an unexpected photo
  // field from the gateway into the website-photo fallback path.
  if (details && rapidApiNewOnly) details.photos = []
  if (details && fullDetails) details.fullDetails = true
  return details ? storeDetails(details, query) : null
}

function hasAttemptedRapidDetailsFallback(placeId: string): boolean {
  if (rapidDetailsFallbackMemory.has(placeId)) return true
  const stored = getLlmArtifact<{ done: true }>(
    `${RAPID_DETAILS_FALLBACK_PREFIX}${placeId}`,
  )
  if (!stored?.done) return false
  rapidDetailsFallbackMemory.add(placeId)
  return true
}

function markRapidDetailsFallbackAttempted(placeId: string) {
  rapidDetailsFallbackMemory.add(placeId)
  setLlmArtifact(
    `${RAPID_DETAILS_FALLBACK_PREFIX}${placeId}`,
    { done: true },
  )
}

/**
 * Final one-shot fallback when Tripadvisor and the official site have no usable
 * photos and a `place_id` is known. Calls RapidAPI Google Place Details (New V2)
 * with the `photos` field mask and returns the single best display URL.
 * Caches the outcome per place so later opens cost zero requests.
 */
export async function fetchRapidApiGooglePhotoFallbackById(
  placeId: string,
): Promise<string | null> {
  const id = placeId.replace(/^places\//, '').trim()
  if (!id) return null
  if (rapidPhotoFallbackCache.has(id)) {
    return rapidPhotoFallbackCache.get(id) || null
  }
  const stored = getLlmArtifact<{ done?: boolean; url?: string | null }>(
    `${RAPID_PHOTO_FALLBACK_PREFIX}${id}`,
  )
  if (stored?.done || stored?.url) {
    const cached = stored.url || null
    rapidPhotoFallbackCache.set(id, cached)
    return cached
  }
  const inflightKey = `rapidapi-new-photo:${id}`
  const pending = photoInflight.get(inflightKey)
  if (pending) return pending
  const task = (async () => {
    let raw: RapidPlace | null = null
    try {
      raw = await rapidRequest<RapidPlace>(
        'place-details',
        `v1/places/${encodeURIComponent(id)}?languageCode=fr&regionCode=FR&detailsMode=photos&provider=rapidapi-new`,
      )
    } catch {
      // Tripadvisor and website photos already failed; do not surface this error.
      raw = null
    }
    const top = raw ? pickTopGooglePhoto(raw.photos) : null
    let url: string | null = null
    if (top) {
      const photoUri = top.url
      // `photoUri` from Places (New) is already a signed GCS URL; nothing to do.
      if (isResolvedPhotoUri(photoUri)) {
        url = withoutGoogleMapsPhotoKey(photoUri)
      } else {
        // Otherwise it is a `places/{id}/photos/{resource}` reference; fetch the
        // media URL via the second RapidAPI Place Photo (New) request.
        const parsed = parseGooglePhotoResource(photoUri, id)
        if (parsed) {
          try {
            const media = await rapidRequest<{ photoUri?: string; name?: string }>(
              'place-photo',
              `v1/places/${encodeURIComponent(id)}/photos/${encodeURIComponent(parsed.photoResource)}/media?maxWidthPx=${PLACE_PHOTO_MAX_PX}&maxHeightPx=${PLACE_PHOTO_MAX_PX}&skipHttpRedirect=true`,
            )
            const resolved = media?.photoUri || media?.name
            if (resolved && isResolvedPhotoUri(resolved)) {
              url = withoutGoogleMapsPhotoKey(resolved)
            } else if (resolved) {
              url = resolved
            }
          } catch {
            // Final fallback path stays best-effort.
          }
        }
      }
    }
    // A non-null Details response means the provider lookup really ran. Cache
    // its result even when no usable image exists; a budget-denied null is not
    // treated as a permanent miss.
    if (raw) {
      rapidPhotoFallbackCache.set(id, url)
      setLlmArtifact(`${RAPID_PHOTO_FALLBACK_PREFIX}${id}`, { done: true, url })
    }
    return url
  })()
  photoInflight.set(inflightKey, task)
  try {
    return await task
  } finally {
    photoInflight.delete(inflightKey)
  }
}

/** Sync read of the cached URL (positive results only). Returns null when uncached. */
export function peekRapidApiGooglePhotoFallback(
  placeId: string,
): string | null {
  const id = placeId.replace(/^places\//, '').trim()
  if (!id) return null
  const memory = rapidPhotoFallbackCache.get(id)
  if (memory) return memory
  try {
    const stored = getLlmArtifact<{ done?: boolean; url?: string | null }>(
      `${RAPID_PHOTO_FALLBACK_PREFIX}${id}`,
    )
    const url = stored?.url
    if (url) {
      rapidPhotoFallbackCache.set(id, url)
      return url
    }
  } catch {
    /* localStorage unavailable */
  }
  return null
}

/** Allow the explicit no-photo recovery action to bypass a persisted miss. */
export function invalidateRapidApiGooglePhotoFallback(placeId?: string): void {
  const id = placeId?.replace(/^places\//, '').trim()
  if (!id) return
  rapidPhotoFallbackCache.delete(id)
  removeLlmArtifact(`${RAPID_PHOTO_FALLBACK_PREFIX}${id}`)
}

/** Tripadvisor-miss fallback. Uses the cached Place ID and exactly one request
 * to RapidAPI Google Place API (New V2); it never performs Text Search or the
 * legacy-host retry.
 */
export async function fetchRapidApiGooglePlaceDetailsById(
  placeId: string,
  query: string,
): Promise<GooglePlaceDetails | null> {
  const id = placeId.replace(/^places\//, '').trim()
  if (!id) return null
  const cached = readDetails([detailKey('id', id)])
  if (cached?.fullDetails) return cached
  if (hasAttemptedRapidDetailsFallback(id)) return cached

  const inflightKey = `rapidapi-new-fallback:${id}`
  const pending = inflight.get(inflightKey)
  if (pending) return pending

  markRapidDetailsFallbackAttempted(id)
  const task = detailsById(id, originalSearchLabel(query), true, true)
  inflight.set(inflightKey, task)
  try {
    return (await task) || cached
  } finally {
    inflight.delete(inflightKey)
  }
}

/**
 * Explicit legacy-data repair. Called only when the user asks to refresh a
 * missing cached Google address; core details exclude reviews and photos.
 */
export async function refreshGooglePlaceCoreDetailsById(
  placeId: string,
  query: string,
): Promise<GooglePlaceDetails | null> {
  const id = placeId.replace(/^places\//, '').trim()
  if (!id) return null
  const inflightKey = `manual-core-refresh:${id}`
  const pending = inflight.get(inflightKey)
  if (pending) return pending
  const task = detailsById(id, originalSearchLabel(query), false)
  inflight.set(inflightKey, task)
  try {
    return await task
  } finally {
    inflight.delete(inflightKey)
  }
}

export async function searchNearbyGooglePlaceCandidates(input: {
  textQuery: string
  location: Coordinates
  maxDistanceMeters: number
  limit?: number
}): Promise<NearbyGooglePlaceCandidate[]> {
  const textQuery = originalSearchLabel(input.textQuery)
  if (!textQuery) return []
  const limit = Math.max(1, Math.min(15, input.limit || 5))
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

function hasAttemptedWebsiteRecovery(placeId: string): boolean {
  if (websiteRecoveryMemory.has(placeId)) return true
  const stored = getLlmArtifact<{ done: true }>(`${WEBSITE_RECOVERY_PREFIX}${placeId}`)
  if (stored?.done) {
    websiteRecoveryMemory.add(placeId)
    return true
  }
  return false
}

function markWebsiteRecoveryAttempted(placeId: string) {
  websiteRecoveryMemory.add(placeId)
  setLlmArtifact(`${WEBSITE_RECOVERY_PREFIX}${placeId}`, { done: true })
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
  const detailPlaceId = placeId || cached?.id?.trim()
  const requireFullDetails = options.requireFullDetails === true
  const upgradeToFull =
    Boolean(cached) &&
    requireFullDetails &&
    !cached?.fullDetails &&
    Boolean(detailPlaceId)
  const recoverWebsite =
    Boolean(cached) &&
    !upgradeToFull &&
    !cached?.website &&
    Boolean(detailPlaceId) &&
    options.recoverPhotos !== false &&
    !hasAttemptedWebsiteRecovery(detailPlaceId!)
  if (cached && !recoverWebsite && !upgradeToFull) return cached
  if (!placeId && !lookupQuery) return null

  const detailMode = requireFullDetails ? 'full' : 'core'
  const inflightKey = detailPlaceId
    ? `id:${detailPlaceId}:${detailMode}`
    : `query:${lookupQuery}|${location?.lat},${location?.lng}:${detailMode}`
  const pending = inflight.get(inflightKey)
  if (pending) return pending

  const task = (async () => {
    if (cached && upgradeToFull && detailPlaceId) {
      const complete = await detailsById(detailPlaceId, lookupQuery, true)
      return complete || cached
    }
    if (cached && recoverWebsite && detailPlaceId) {
      markWebsiteRecoveryAttempted(detailPlaceId)
      const recovered = await detailsById(detailPlaceId, lookupQuery, false)
      return recovered || cached
    }
    if (detailPlaceId) {
      return detailsById(detailPlaceId, lookupQuery, requireFullDetails)
    }
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
    if (requireFullDetails && best.id) {
      const complete = await detailsById(best.id, lookupQuery, true)
      if (complete) return complete
    }
    return withDisplayPhotos(best)
  })()

  inflight.set(inflightKey, task)
  try {
    return await task
  } finally {
    inflight.delete(inflightKey)
  }
}

export function hasFullGooglePlaceDetails(
  details: GooglePlaceDetails | null | undefined,
): boolean {
  return details?.fullDetails === true
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
  placeId?: string,
): GooglePlaceDetails | null {
  const query = placeDetailsQuery(name, nameLocal)
  const id = placeId?.trim()
  if (!query && !id) return null
  return readDetails([
    ...(id ? [detailKey('id', id)] : []),
    ...(query && location ? [detailKey('query', query, location)] : []),
    ...(query && location
      ? [
          detailKey(
            'name',
            originalSearchLabel(nameLocal) || originalSearchLabel(name),
            location,
          ),
        ]
      : []),
    ...(query ? [detailKey('query', query)] : []),
    ...(query
      ? [detailKey('name', originalSearchLabel(nameLocal) || originalSearchLabel(name))]
      : []),
  ])
}

export function resetGooglePlaceDetailsCacheForTests() {
  detailMemory.clear()
  candidateMemory.clear()
  inflight.clear()
  photoUriMemory.clear()
  photoInflight.clear()
  websiteRecoveryMemory.clear()
  rapidDetailsFallbackMemory.clear()
  rapidPhotoFallbackCache.clear()
}
