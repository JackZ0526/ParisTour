import type { Coordinates } from '../../../types'
import {
  placeIdentitySimilarity,
  PLACE_NAME_MATCH_MIN,
} from '../../../utils/placeTitle'
import {
  getGoogleMapsApiKey,
  withGoogleMapsPhotoKey,
  withoutGoogleMapsPhotoKey,
} from './googleMapsKey'
import { getLlmArtifact, setLlmArtifact } from '../../../services/llmArtifactStore'

export interface GoogleReview {
  text: string
  rating?: number
  author?: string
  relativeTime?: string
}

export interface GooglePlaceDetails {
  id?: string
  /** Display name in UI language (zh-CN). */
  name: string
  /**
   * Local / original-language label when different from `name`
   * (e.g. Tour Eiffel for 埃菲尔铁塔). From a fr/en lookup.
   */
  nameOriginal?: string
  address?: string
  rating?: number
  userRatingCount?: number
  photos: string[]
  reviews: GoogleReview[]
  summary?: string
  phone?: string
  website?: string
  openingHours?: string[]
  priceLevel?: string
  location?: { lat: number; lng: number }
  query: string
}

export interface GooglePlaceSearchOptions {
  /** Reject candidates farther than this from `location` (locationBias alone is not a limit). */
  maxDistanceMeters?: number
  /** Exact Google Places identity; bypasses text search when present. */
  placeId?: string
  /** Resolve a legacy place without an id/original name from its saved coordinates. */
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

type PlacesLib = {
  Place: {
    new (opts: {
      id: string
      requestedLanguage?: string
      requestedRegion?: string
    }): PlaceLike
    searchByText: (req: Record<string, unknown>) => Promise<{ places?: PlaceLike[] }>
    searchNearby?: (req: Record<string, unknown>) => Promise<{ places?: PlaceLike[] }>
  }
}

type PlaceLike = {
  id?: string
  displayName?: unknown
  formattedAddress?: string
  rating?: number
  userRatingCount?: number
  editorialSummary?: unknown
  nationalPhoneNumber?: string
  websiteURI?: string
  priceLevel?: string
  regularOpeningHours?: { weekdayDescriptions?: string[] }
  location?: { lat: number | (() => number); lng: number | (() => number) }
  photos?: Array<{
    getURI: (opts?: { maxHeight?: number; maxWidth?: number }) => string
  }>
  reviews?: Array<{
    text?: unknown
    originalText?: unknown
    rating?: number
    relativePublishTimeDescription?: string
    authorAttribution?: { displayName?: string }
  }>
  fetchFields?: (req: { fields: string[] }) => Promise<unknown>
}

type LegacyReviewLike = {
  text?: string
  rating?: number
  author_name?: string
  relative_time_description?: string
}

type RestReviewLike = {
  text?: unknown
  originalText?: unknown
  rating?: number
  relativePublishTimeDescription?: string
  authorAttribution?: { displayName?: string }
}

const DETAIL_FIELDS = [
  'id',
  'displayName',
  'formattedAddress',
  'location',
  'rating',
  'userRatingCount',
  'photos',
  'reviews',
  'editorialSummary',
  'nationalPhoneNumber',
  'websiteURI',
  'regularOpeningHours',
  'priceLevel',
] as const

const SEARCH_MAX = 5

const detailsCache = new Map<string, GooglePlaceDetails>()
const inflight = new Map<string, Promise<GooglePlaceDetails | null>>()
const DETAILS_ARTIFACT_PREFIX = 'google-place-details:'

function cacheKey(
  query: string,
  location?: Coordinates,
  options?: GooglePlaceSearchOptions,
) {
  // Versioned because matching/review hydration changes must not reuse an older
  // thin or incorrectly matched payload.
  const placeId = options?.placeId?.trim()
  const identity = placeId ? `id:${placeId}` : query.trim().toLowerCase()
  const base = `v11|${identity}`
  if (!location) return base
  const maxDistance = options?.maxDistanceMeters
  const limit =
    Number.isFinite(maxDistance) && Number(maxDistance) > 0
      ? `|max:${Math.round(Number(maxDistance))}`
      : ''
  const recovery = options?.recoverFromLocation ? '|recover' : ''
  return `${base}|${location.lat.toFixed(4)},${location.lng.toFixed(4)}${limit}${recovery}`
}

function artifactKey(key: string) {
  return `${DETAILS_ARTIFACT_PREFIX}${key}`
}

function reviveStoredDetails(value: unknown): GooglePlaceDetails | null {
  if (!value || typeof value !== 'object') return null
  const stored = value as Partial<GooglePlaceDetails>
  if (
    typeof stored.name !== 'string' ||
    !stored.name.trim() ||
    typeof stored.query !== 'string'
  ) {
    return null
  }
  return {
    ...stored,
    name: stored.name,
    query: stored.query,
    photos: Array.isArray(stored.photos)
      ? stored.photos
          .filter((url): url is string => typeof url === 'string' && Boolean(url))
          .map(withGoogleMapsPhotoKey)
      : [],
    reviews: Array.isArray(stored.reviews)
      ? stored.reviews.filter(
          (review): review is GoogleReview =>
            Boolean(review && typeof review.text === 'string' && review.text.trim()),
        )
      : [],
  }
}

function getStoredDetails(key: string): GooglePlaceDetails | null {
  return reviveStoredDetails(
    getLlmArtifact<GooglePlaceDetails>(artifactKey(key)),
  )
}

function labelsEqual(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

function hasLatin(text: string) {
  return /[A-Za-zÀ-ÿ]/.test(text)
}

function hasCjkText(text: string) {
  return /[\u3400-\u9fff]/.test(text)
}

/** Keep automatic Google text searches in the place's original Latin script. */
function originalSearchLabel(label?: string): string {
  const value = label?.trim()
  if (!value) return ''
  const latinOnly = value
    .replace(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s·,，、:：;；/|—–-]+|[\s·,，、:：;；/|—–-]+$/g, '')
    .trim()
  const meaningful = latinOnly
    .replace(/\b(?:paris|france)\b/gi, ' ')
    .replace(/[^\p{Script=Latin}\p{M}]/gu, '')
  return meaningful ? latinOnly : ''
}

/** Prefer fr/en for Latin queries so scoring can match "Chez Paul", not zh-only garden names. */
function searchLanguage(query: string): string {
  return hasLatin(query) ? 'fr' : 'zh-CN'
}

function displayNameOf(value: unknown): string {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'object' && value && 'text' in value) {
    return String((value as { text?: string }).text || '')
  }
  return String(value)
}

function toCoords(
  loc?: { lat: number | (() => number); lng: number | (() => number) },
): { lat: number; lng: number } | undefined {
  if (!loc) return undefined
  const lat = typeof loc.lat === 'function' ? loc.lat() : loc.lat
  const lng = typeof loc.lng === 'function' ? loc.lng() : loc.lng
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined
  return { lat, lng }
}

function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const R = 6371000
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Prefer Latin / local catalog names for Maps text search. */
function preferSearchLabel(name: string, nameLocal?: string): string {
  return originalSearchLabel(nameLocal) || originalSearchLabel(name)
}

function usableReviews(place: PlaceLike): GoogleReview[] {
  return (place.reviews || [])
    .map((r) => ({
      // New Places may omit localized `text` while retaining `originalText`,
      // especially for landmark reviews under a non-local browser language.
      text: displayNameOf(r.text).trim() || displayNameOf(r.originalText).trim(),
      rating: r.rating,
      author: r.authorAttribution?.displayName,
      relativeTime: r.relativePublishTimeDescription,
    }))
    .filter((r) => r.text)
    .slice(0, 6)
}

/**
 * The new Place class occasionally returns a landmark's aggregate rating but no
 * review objects. The legacy details endpoint can still expose Google's review
 * sample for the exact same Place ID, so use it only as a text backfill.
 */
async function legacyReviewsById(placeId: string): Promise<GoogleReview[]> {
  const PlacesService = google.maps.places?.PlacesService
  if (!PlacesService) return []

  const fetchLanguage = (language: string) =>
    new Promise<GoogleReview[]>((resolve) => {
      const service = new PlacesService(document.createElement('div'))
      service.getDetails(
        {
          placeId,
          fields: ['reviews'],
          language,
          region: 'fr',
        },
        (result, status) => {
          if (
            status !== google.maps.places.PlacesServiceStatus.OK ||
            !result?.reviews?.length
          ) {
            resolve([])
            return
          }
          resolve(
            (result.reviews as LegacyReviewLike[])
              .map((review) => ({
                text: review.text?.trim() || '',
                rating: review.rating,
                author: review.author_name,
                relativeTime: review.relative_time_description,
              }))
              .filter((review) => review.text)
              .slice(0, 5),
          )
        },
      )
    })

  for (const language of ['fr', 'en', 'zh-CN']) {
    try {
      const reviews = await fetchLanguage(language)
      if (reviews.length) return reviews
    } catch {
      /* try the next language */
    }
  }
  return []
}

/** Last-resort Places API (New) lookup for the same identity. */
async function restReviewsById(placeId: string): Promise<GoogleReview[]> {
  const apiKey = getGoogleMapsApiKey()
  if (!apiKey) return []

  for (const languageCode of ['fr', 'en', 'zh-CN']) {
    try {
      const params = new URLSearchParams({
        key: apiKey,
        languageCode,
        regionCode: 'fr',
        fields: 'reviews',
      })
      const response = await fetch(
        `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?${params}`,
      )
      if (!response.ok) continue
      const payload = (await response.json()) as { reviews?: RestReviewLike[] }
      const reviews = (payload.reviews || [])
        .map((review) => ({
          text:
            displayNameOf(review.text).trim() ||
            displayNameOf(review.originalText).trim(),
          rating: review.rating,
          author: review.authorAttribution?.displayName,
          relativeTime: review.relativePublishTimeDescription,
        }))
        .filter((review) => review.text)
        .slice(0, 5)
      if (reviews.length) return reviews
    } catch {
      /* try the next language */
    }
  }
  return []
}

function expectsReviews(place: {
  rating?: number
  userRatingCount?: number
}): boolean {
  return (place.userRatingCount ?? 0) > 0 || place.rating != null
}

/** Cached payload that likely missed reviews Maps would show — allow refetch. */
function isIncompleteCacheHit(details: GooglePlaceDetails): boolean {
  const hasTextReviews = details.reviews.some((r) => r.text?.trim())
  return !hasTextReviews && expectsReviews(details)
}

function scoreCandidate(
  place: PlaceLike,
  query: string,
  bias?: Coordinates,
  maxDistanceMeters?: number,
): number {
  const name = displayNameOf(place.displayName)
  const sim = placeIdentitySimilarity(query, name)
  // Never let proximity/reviews crown a place whose name doesn't match the query
  // (Chez Paul + Eiffel bias → Jardins / Champ de Mars otherwise wins).
  if (sim < PLACE_NAME_MATCH_MIN) return Number.NEGATIVE_INFINITY

  const reviews = usableReviews(place)
  const photoCount = place.photos?.length ?? 0
  const ratingCount = place.userRatingCount ?? 0
  let score = 0

  score += sim * 60
  if (reviews.length) score += 35 + Math.min(reviews.length, 6)
  else if (expectsReviews(place)) score += 8
  if (photoCount) score += Math.min(photoCount, 8)
  if (ratingCount > 0) score += Math.min(Math.log10(ratingCount + 1) * 6, 18)
  if (place.rating != null) score += place.rating

  const coords = toCoords(place.location)
  if (bias && coords) {
    const meters = haversineMeters(bias, coords)
    if (
      Number.isFinite(maxDistanceMeters) &&
      Number(maxDistanceMeters) > 0 &&
      meters > Number(maxDistanceMeters)
    ) {
      return Number.NEGATIVE_INFINITY
    }
    if (meters < 80) score += 25
    else if (meters < 250) score += 18
    else if (meters < 800) score += 10
    else if (meters < 2000) score += 4
    else score -= Math.min(meters / 500, 20)
  }

  return score
}

async function enrichPlace(place: PlaceLike): Promise<void> {
  if (!place.fetchFields) return
  try {
    await place.fetchFields({ fields: [...DETAIL_FIELDS] })
  } catch {
    /* keep search fields */
  }
}

/** Re-fetch by place id when search returns a thin entity with rating but no reviews. */
async function backfillById(
  lib: PlacesLib,
  place: PlaceLike,
): Promise<PlaceLike> {
  if (!place.id || !expectsReviews(place) || usableReviews(place).length) {
    return place
  }
  // Make the preferred review language explicit. A Place created without it
  // inherits the browser language and can return an empty review selection for
  // high-volume landmarks even though the same Place ID has review text.
  for (const requestedLanguage of ['fr', 'en', 'zh-CN']) {
    try {
      const byId = new lib.Place({
        id: place.id,
        requestedLanguage,
        requestedRegion: 'fr',
      })
      if (!byId.fetchFields) continue
      await byId.fetchFields({ fields: [...DETAIL_FIELDS] })
      if (usableReviews(byId).length) return byId
      if ((byId.photos?.length ?? 0) > 0 && !expectsReviews(byId)) {
        return byId
      }
    } catch {
      /* try the next language */
    }
  }
  return place
}

async function fetchPlaceById(
  lib: PlacesLib,
  placeId: string,
  requestedLanguage = 'fr',
  fields: readonly string[] = DETAIL_FIELDS,
): Promise<PlaceLike | null> {
  try {
    const place = new lib.Place({
      id: placeId,
      requestedLanguage,
      requestedRegion: 'fr',
    })
    if (!place.fetchFields) return null
    await place.fetchFields({ fields: [...fields] })
    return place
  } catch {
    return null
  }
}

/**
 * Legacy migration path: the saved coordinates originally came from Google,
 * so an extremely close nearby result can safely restore the stable Place ID
 * without sending a translated name back to Google.
 */
async function recoverPlaceByLocation(
  lib: PlacesLib,
  location: Coordinates,
): Promise<PlaceLike | null> {
  if (!lib.Place.searchNearby) return null
  try {
    const { places } = await lib.Place.searchNearby({
      fields: [...DETAIL_FIELDS],
      locationRestriction: { center: location, radius: 40 },
      rankPreference: 'DISTANCE',
      language: 'fr',
      region: 'fr',
      maxResultCount: 5,
    })
    const nearest = (places || [])
      .map((place) => ({ place, coords: toCoords(place.location) }))
      .filter(
        (row): row is { place: PlaceLike; coords: Coordinates } =>
          Boolean(row.place.id && row.coords),
      )
      .sort(
        (a, b) =>
          haversineMeters(location, a.coords) -
          haversineMeters(location, b.coords),
      )[0]
    if (!nearest || haversineMeters(location, nearest.coords) > 25) return null
    await enrichPlace(nearest.place)
    return backfillById(lib, nearest.place)
  } catch {
    return null
  }
}

async function searchCandidates(
  lib: PlacesLib,
  textQuery: string,
  location?: Coordinates,
  language = 'zh-CN',
): Promise<PlaceLike[]> {
  const request: Record<string, unknown> = {
    textQuery,
    fields: [...DETAIL_FIELDS],
    language,
    region: 'fr',
    maxResultCount: SEARCH_MAX,
  }
  if (location) request.locationBias = location

  const { places } = await lib.Place.searchByText(request)
  return places || []
}

/**
 * Live, structured shortlist for assistant recommendations. Unlike a text-search
 * locationBias, the returned rows are post-filtered by a hard radius and ranked
 * using rating confidence plus proximity.
 */
export async function searchNearbyGooglePlaceCandidates(input: {
  textQuery: string
  location: Coordinates
  maxDistanceMeters: number
  limit?: number
}): Promise<NearbyGooglePlaceCandidate[]> {
  if (!window.google?.maps) return []
  const lib = (await google.maps.importLibrary('places')) as unknown as PlacesLib
  const request: Record<string, unknown> = {
    textQuery: input.textQuery,
    fields: [
      'id',
      'displayName',
      'formattedAddress',
      'location',
      'rating',
      'userRatingCount',
      'priceLevel',
    ],
    language: 'fr',
    region: 'fr',
    maxResultCount: Math.max(5, Math.min(20, (input.limit || 5) * 2)),
    locationBias: input.location,
  }
  const { places } = await lib.Place.searchByText(request)
  const rows = (places || [])
    .map((place): NearbyGooglePlaceCandidate | null => {
      const location = toCoords(place.location)
      const name = displayNameOf(place.displayName).trim()
      if (!location || !name) return null
      const distanceMeters = haversineMeters(input.location, location)
      if (distanceMeters > input.maxDistanceMeters) return null
      return {
        id: place.id,
        name,
        address: place.formattedAddress,
        rating: place.rating,
        userRatingCount: place.userRatingCount,
        priceLevel: place.priceLevel,
        location,
        distanceMeters,
      }
    })
    .filter((row): row is NearbyGooglePlaceCandidate => Boolean(row))

  const score = (row: NearbyGooglePlaceCandidate) => {
    const rating = row.rating || 0
    const reviews = row.userRatingCount || 0
    const confidence = Math.min(Math.log10(reviews + 1), 4)
    const distanceKm = row.distanceMeters / 1000
    return rating * 20 + confidence * 5 - distanceKm * 0.6
  }

  return rows
    .sort((a, b) => score(b) - score(a))
    .slice(0, Math.max(1, input.limit || 5))
}

/**
 * Alternate text queries when the primary label may match a thin / wrong entity
 * (e.g. Chinese-only landmark names).
 */
function queryFallbacks(primary: string): string[] {
  const q = primary.trim()
  const out: string[] = [q]
  const lower = q.toLowerCase()

  const aliases: Array<{ test: RegExp; alt: string }> = [
    { test: /埃菲尔|铁塔|eiffel|tour\s*eiffel/i, alt: 'Tour Eiffel Paris' },
    { test: /凯旋门|arc\s*de\s*triomphe/i, alt: 'Arc de Triomphe Paris' },
    { test: /卢浮宫|louvre/i, alt: 'Musée du Louvre Paris' },
    { test: /巴黎圣母院|notre[\s-]?dame/i, alt: 'Cathédrale Notre-Dame de Paris' },
    { test: /奥赛|orsay/i, alt: 'Musée d\'Orsay Paris' },
    { test: /圣心|sacré|sacre[\s-]?coeur/i, alt: 'Basilique du Sacré-Cœur Paris' },
  ]

  for (const { test, alt } of aliases) {
    if (test.test(q) && !out.some((x) => x.toLowerCase() === alt.toLowerCase())) {
      out.push(alt)
    }
  }

  if (!/\bparis\b/i.test(lower) && !/france|迪士尼|枫丹白露|cdg|airport/i.test(lower)) {
    out.push(`${q} Paris`)
  }

  return out
}

async function pickBestPlace(
  lib: PlacesLib,
  query: string,
  location?: Coordinates,
  options?: GooglePlaceSearchOptions,
): Promise<PlaceLike | null> {
  const placeId = options?.placeId?.trim()
  if (placeId) {
    const exact = await fetchPlaceById(lib, placeId, 'fr')
    if (exact) return backfillById(lib, exact)
  }
  if (!query.trim()) {
    return location && options?.recoverFromLocation
      ? recoverPlaceByLocation(lib, location)
      : null
  }

  let best: PlaceLike | null = null
  let bestScore = -Infinity
  const lang = searchLanguage(query)

  for (const textQuery of queryFallbacks(query)) {
    let candidates: PlaceLike[]
    try {
      candidates = await searchCandidates(lib, textQuery, location, lang)
    } catch {
      continue
    }
    if (!candidates.length) continue

    // Enrich top candidates before scoring (reviews often arrive only via fetchFields)
    const enriched: PlaceLike[] = []
    for (const raw of candidates.slice(0, SEARCH_MAX)) {
      await enrichPlace(raw)
      enriched.push(await backfillById(lib, raw))
    }

    for (const place of enriched) {
      const score = scoreCandidate(
        place,
        query,
        location,
        options?.maxDistanceMeters,
      )
      if (score > bestScore) {
        best = place
        bestScore = score
      }
    }

    if (best && Number.isFinite(bestScore) && usableReviews(best).length) break
  }

  return best && Number.isFinite(bestScore) ? best : null
}

/**
 * Load a Google Places "place page" payload for in-app display (no navigation away).
 */
export async function fetchGooglePlaceDetails(
  query: string,
  location?: Coordinates,
  options?: GooglePlaceSearchOptions,
): Promise<GooglePlaceDetails | null> {
  const lookupQuery = originalSearchLabel(query)
  const key = cacheKey(lookupQuery, location, options)
  const hit = detailsCache.get(key)
  if (hit && !isIncompleteCacheHit(hit)) return hit
  if (hit) detailsCache.delete(key)

  const stored = getStoredDetails(key)
  if (stored && !isIncompleteCacheHit(stored)) {
    detailsCache.set(key, stored)
    return stored
  }

  const pending = inflight.get(key)
  if (pending) return pending

  const task = (async (): Promise<GooglePlaceDetails | null> => {
    if (!window.google?.maps) return null

    const lib = (await google.maps.importLibrary('places')) as unknown as PlacesLib

    const place = await pickBestPlace(lib, lookupQuery, location, options)
    if (!place) return null

    const photos = (place.photos || [])
      .slice(0, 8)
      .map((p) => withGoogleMapsPhotoKey(p.getURI({ maxHeight: 1000, maxWidth: 1400 })))
      .filter(Boolean)

    let reviews = usableReviews(place)
    const searchName = displayNameOf(place.displayName) || lookupQuery
    const idHint = place.id

    if (!reviews.length && idHint && expectsReviews(place)) {
      reviews = await legacyReviewsById(idHint)
      if (!reviews.length) reviews = await restReviewsById(idHint)
    }

    // Latin / local title: prefer search language name when already Latin.
    let nameOriginal = hasLatin(searchName) ? searchName : undefined
    if (!nameOriginal && idHint) {
      for (const lang of ['fr', 'en'] as const) {
        const localized = await fetchPlaceById(lib, idHint, lang, [
          'displayName',
          'id',
        ])
        const alt = displayNameOf(localized?.displayName).trim()
        if (alt) nameOriginal = alt
        if (nameOriginal) break
      }
    }

    // zh-CN display name for bilingual UI (same place id only).
    let zhName = hasCjkText(searchName) ? searchName : undefined
    if (!zhName && idHint) {
      const localized = await fetchPlaceById(lib, idHint, 'zh-CN', [
        'displayName',
        'id',
        'reviews',
      ])
      const localizedReviews = localized ? usableReviews(localized) : []
      const chineseReviews = localizedReviews.filter((review) =>
        hasCjkText(review.text),
      )
      if (chineseReviews.length) {
        reviews = [
          ...chineseReviews,
          ...localizedReviews.filter((review) => !hasCjkText(review.text)),
        ].slice(0, 6)
      }
      zhName = displayNameOf(localized?.displayName).trim() || undefined
    }
    if (!zhName) zhName = searchName

    // Final identity check: Latin title must resemble the search query.
    const identity = nameOriginal || (hasLatin(zhName) ? zhName : '')
    const trustedId = Boolean(
      idHint &&
        (options?.placeId?.trim() === idHint ||
          (!lookupQuery && options?.recoverFromLocation)),
    )
    if (
      !trustedId &&
      identity &&
      placeIdentitySimilarity(lookupQuery, identity) < PLACE_NAME_MATCH_MIN
    ) {
      return null
    }
    if (!trustedId && !identity && hasLatin(lookupQuery)) {
      // No Latin Google title to verify — refuse rather than show wrong zh.
      return null
    }

    const details: GooglePlaceDetails = {
      id: place.id,
      name: zhName,
      nameOriginal:
        nameOriginal && !labelsEqual(nameOriginal, zhName)
          ? nameOriginal
          : undefined,
      address: place.formattedAddress,
      rating: place.rating,
      userRatingCount: place.userRatingCount,
      photos,
      reviews,
      summary: displayNameOf(place.editorialSummary),
      phone: place.nationalPhoneNumber,
      website: place.websiteURI,
      openingHours: place.regularOpeningHours?.weekdayDescriptions,
      priceLevel: place.priceLevel,
      location: toCoords(place.location),
      query: lookupQuery,
    }

    // Avoid locking the session on a thin "success" that Maps would still show reviews for.
    if (!isIncompleteCacheHit(details)) {
      detailsCache.set(key, details)
      setLlmArtifact(artifactKey(key), {
        ...details,
        photos: details.photos.map(withoutGoogleMapsPhotoKey),
      })
    }
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
  const label = preferSearchLabel(name, nameLocal)
  if (!label) return ''
  if (/paris|france|迪士尼|枫丹白露|cdg|airport/i.test(label)) return label
  return `${label} Paris`
}

/** Sync read of cached Google details (no network). */
export function peekGooglePlaceDetails(
  name: string,
  nameLocal?: string,
  location?: Coordinates,
): GooglePlaceDetails | null {
  const key = cacheKey(placeDetailsQuery(name, nameLocal), location)
  const memory = detailsCache.get(key)
  if (memory) return memory
  const stored = getStoredDetails(key)
  if (stored) detailsCache.set(key, stored)
  return stored
}
