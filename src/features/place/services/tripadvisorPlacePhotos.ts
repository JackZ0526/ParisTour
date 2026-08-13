import type { Coordinates, PlaceType } from '../../../types'
import { authFetch } from '../../auth/services/authFetch'
import {
  getLlmArtifact,
  setLlmArtifact,
} from '../../../shared/services/llm/llmArtifactStore'
import {
  placeIdentitySimilarity,
  placeSearchQuery,
  PLACE_NAME_MATCH_MIN,
} from '../../../shared/utils/placeTitle'
import {
  resolveAttractionCanonicalName,
  type AttractionCanonicalName,
} from '../../../shared/services/llm/llm'
import {
  tryConsumeTripadvisorRequest,
  type TripadvisorRequestKind,
} from './tripadvisorRequestBudget'

export type TripadvisorGalleryKind = 'attraction' | 'restaurant'

export interface TripadvisorCatalogItem {
  contentId: string
  name: string
  coverUrl?: string
  kind: TripadvisorGalleryKind
  location?: Coordinates
  aliases?: string[]
}

export interface TripadvisorPlaceGallery {
  contentId: string
  kind: TripadvisorGalleryKind
  name: string
  photos: string[]
}

export interface TripadvisorAttractionInfo {
  contentId: string
  name: string
  description?: string
  rating?: number
  userRatingCount?: number
  address?: string
  location?: Coordinates
  photos: string[]
}

const PARIS_GEO_ID = '187147'
const CATALOG_PREFIX = 'tripadvisor-catalog:v1:'
const GALLERY_PREFIX = 'tripadvisor-gallery:v4:'
const DETAILS_PREFIX = 'tripadvisor-attraction-details:v1:'
const QUERY_MATCH_PREFIX = 'tripadvisor-query-match:v1:'
const MAX_GALLERY_PHOTOS = 15
const MIN_GALLERY_WIDTH = 400
const DISPLAY_WIDTH = 1200
const DISPLAY_HEIGHT = 900

/**
 * Stable Tripadvisor location ids for well-known Paris attractions.
 * Used so the app never spends quota on city-wide attractions/search.
 */
const SEEDED_ATTRACTIONS: TripadvisorCatalogItem[] = [
  { contentId: '188151', name: 'Eiffel Tower', kind: 'attraction', location: { lat: 48.85837, lng: 2.294481 } },
  { contentId: '188757', name: 'Louvre Museum', kind: 'attraction', location: { lat: 48.860611, lng: 2.337644 } },
  { contentId: '188150', name: "Musée d'Orsay", kind: 'attraction', location: { lat: 48.86, lng: 2.3266 } },
  { contentId: '188679', name: 'Cathédrale Notre-Dame de Paris', kind: 'attraction', location: { lat: 48.853, lng: 2.3499 } },
  { contentId: '188709', name: 'Arc de Triomphe', kind: 'attraction', location: { lat: 48.8738, lng: 2.295 }, coverUrl: 'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/0e/53/47/52/arc-de-triomphe.jpg?w=1200&h=900&s=1' },
  { contentId: '209760', name: 'Champs-Elysees', kind: 'attraction', location: { lat: 48.8698, lng: 2.3075 }, coverUrl: 'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/0d/64/ec/ff/champs-elysees-from-the.jpg?w=1200&h=900&s=1' },
  { contentId: '189687', name: 'Luxembourg Gardens', kind: 'attraction', location: { lat: 48.8462, lng: 2.3372 } },
  { contentId: '190685', name: 'Basilique Du Sacre-Coeur De Montmartre', kind: 'attraction', location: { lat: 48.8867, lng: 2.3431 } },
  { contentId: '190204', name: 'Palais Garnier', kind: 'attraction', location: { lat: 48.8719, lng: 2.3316 } },
  { contentId: '189284', name: 'Montmartre', kind: 'attraction', location: { lat: 48.8867, lng: 2.3431 } },
  { contentId: '189683', name: 'The Seine', kind: 'attraction', location: { lat: 48.858, lng: 2.342 } },
  { contentId: '189193', name: 'Galeries Lafayette Paris Haussmann', kind: 'attraction', location: { lat: 48.8738, lng: 2.332 } },
  { contentId: '190202', name: 'Sainte-Chapelle', kind: 'attraction', location: { lat: 48.8554, lng: 2.345 } },
  { contentId: '292257', name: 'Le Marais', kind: 'attraction', location: { lat: 48.8575, lng: 2.3588 } },
  { contentId: '265635', name: 'Musée de l’Orangerie', kind: 'attraction', location: { lat: 48.8638, lng: 2.3226 } },
  { contentId: '188149', name: 'Musée Rodin', kind: 'attraction', location: { lat: 48.8553, lng: 2.3158 } },
  {
    contentId: '188486',
    name: "Musee d'Art Moderne de Paris",
    kind: 'attraction',
    location: { lat: 48.8644, lng: 2.2978 },
    coverUrl:
      'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/10/4b/8b/6d/les-collections-permanentes.jpg?w=1200&h=900&s=1',
  },
]
const catalogMemory = new Map<string, TripadvisorCatalogItem[]>()
const galleryMemory = new Map<string, TripadvisorPlaceGallery>()
const galleryInflight = new Map<string, Promise<TripadvisorPlaceGallery | null>>()
const detailsMemory = new Map<string, TripadvisorAttractionInfo>()
const infoInflight = new Map<string, Promise<TripadvisorAttractionInfo | null>>()
const matchLookup = new Map<string, string | 'miss'>()

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function textOf(value: unknown): string {
  if (typeof value === 'string') return value.replace(/<[^>]+>/g, '').trim()
  const record = asRecord(value)
  if (!record) return ''
  return (
    textOf(record.htmlString) ||
    textOf(record.string) ||
    textOf(record.text) ||
    ''
  )
}

function stripRankPrefix(name: string): string {
  return name.replace(/^\s*\d+\.\s*/, '').trim()
}

function num(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

export function tripadvisorPhotoUrl(value: unknown): string {
  if (typeof value !== 'string') return ''
  const url = value.trim()
  if (!url) return ''
  if (url.includes('{width}') || url.includes('{height}')) {
    return url
      .replaceAll('{width}', String(DISPLAY_WIDTH))
      .replaceAll('{height}', String(DISPLAY_HEIGHT))
  }
  return url
}

export function pickTripadvisorPhotoUrl(
  sizes: Array<{ width?: number; url?: string }> | undefined,
  template?: string,
): string {
  const ranked = (sizes || [])
    .map((size) => ({
      width: Number(size.width) || 0,
      url: tripadvisorPhotoUrl(size.url),
    }))
    .filter((size) => size.url)
    .sort((a, b) => a.width - b.width)
  const preferred =
    ranked.find((size) => size.width >= 800) || ranked[ranked.length - 1]
  return preferred?.url || tripadvisorPhotoUrl(template)
}

export interface TripadvisorGalleryPhotoCandidate {
  url: string
  maxWidth: number
  maxHeight: number
  identity: string
}

export function tripadvisorPhotoIdentity(url: string): string {
  try {
    const parsed = new URL(url)
    return parsed.pathname.replace(/\/media\/photo-[a-z]\//i, '/media/photo/')
  } catch {
    return url.split('?')[0] || url
  }
}

export function galleryPhotoScore(candidate: TripadvisorGalleryPhotoCandidate): number {
  const area = candidate.maxWidth * Math.max(candidate.maxHeight, candidate.maxWidth)
  let score = area
  if (candidate.maxWidth >= 1600) score += 2_000_000
  else if (candidate.maxWidth >= 1200) score += 1_000_000
  else if (candidate.maxWidth >= 800) score += 250_000
  // Listing heroes usually have a descriptive filename; traveler uploads are often caption.jpg.
  if (!/\/(?:caption|photo\d*jpg)\.jpg(?:$|\?)/i.test(candidate.url)) score += 400_000
  return score
}

/** Landscape and square first; unknown height is treated as landscape. */
export function isLandscapeGalleryPhoto(candidate: TripadvisorGalleryPhotoCandidate): boolean {
  if (candidate.maxHeight <= 0) return true
  return candidate.maxWidth >= candidate.maxHeight
}

function compareGalleryPhotos(
  a: TripadvisorGalleryPhotoCandidate,
  b: TripadvisorGalleryPhotoCandidate,
): number {
  const aLandscape = isLandscapeGalleryPhoto(a)
  const bLandscape = isLandscapeGalleryPhoto(b)
  if (aLandscape !== bLandscape) return aLandscape ? -1 : 1
  return galleryPhotoScore(b) - galleryPhotoScore(a) || b.maxWidth - a.maxWidth
}

export function selectBestTripadvisorGalleryPhotos(
  candidates: TripadvisorGalleryPhotoCandidate[],
  limit = MAX_GALLERY_PHOTOS,
  pinned: string[] = [],
): string[] {
  const bestByIdentity = new Map<string, TripadvisorGalleryPhotoCandidate>()
  for (const candidate of candidates) {
    if (!candidate.url || candidate.maxWidth < MIN_GALLERY_WIDTH) continue
    const current = bestByIdentity.get(candidate.identity)
    if (!current || compareGalleryPhotos(candidate, current) < 0) {
      bestByIdentity.set(candidate.identity, candidate)
    }
  }
  const ranked = [...bestByIdentity.values()]
    .sort(compareGalleryPhotos)
    .map((candidate) => candidate.url)
  const hero = pinned.map((url) => tripadvisorPhotoUrl(url)).filter(Boolean)
  const seen = new Set(hero.map((url) => tripadvisorPhotoIdentity(url)))
  const rest = ranked.filter((url) => {
    const identity = tripadvisorPhotoIdentity(url)
    if (seen.has(identity)) return false
    seen.add(identity)
    return true
  })
  return [...hero, ...rest].slice(0, limit)
}

export function galleryKindForPlaceType(
  type?: PlaceType,
): TripadvisorGalleryKind | null {
  if (type === 'attraction') return 'attraction'
  if (type === 'restaurant' || type === 'cafe') return 'restaurant'
  return null
}

export function tripadvisorContentIdFromCandidate(id?: string): string | undefined {
  const value = id?.trim() || ''
  if (value.startsWith('ta-')) return value.slice(3)
  if (/^\d{5,}$/.test(value)) return value
  return undefined
}

export function listSeededTripadvisorAttractions(): TripadvisorCatalogItem[] {
  return SEEDED_ATTRACTIONS.map((item) => ({ ...item }))
}

function catalogKey(kind: TripadvisorGalleryKind): string {
  return `${CATALOG_PREFIX}${kind}:${PARIS_GEO_ID}`
}

function galleryKey(kind: TripadvisorGalleryKind, contentId: string): string {
  return `${GALLERY_PREFIX}${kind}:${contentId}`
}

function detailsKey(contentId: string): string {
  return `${DETAILS_PREFIX}${contentId}`
}

function uniquePhotos(urls: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const url of urls) {
    const identity = tripadvisorPhotoIdentity(url)
    if (!url || seen.has(identity)) continue
    seen.add(identity)
    out.push(url)
    if (out.length >= MAX_GALLERY_PHOTOS) break
  }
  return out
}

function mediaEntryCandidate(entry: unknown): TripadvisorGalleryPhotoCandidate | null {
  const photo = asRecord(asRecord(asRecord(entry)?.item)?.data)
  if (!photo) return null
  const mediaType = String(photo.mediaType || photo.type || photo.mediaTypeName || '').toLowerCase()
  if (mediaType.includes('video')) return null
  const sizes = Array.isArray(photo.sizes)
    ? (photo.sizes as Array<{ width?: number; height?: number; url?: string }>)
    : []
  const maxWidth = Math.max(
    0,
    ...sizes.map((size) => Number(size.width) || 0),
    num(photo.maxWidth) || 0,
    num(photo.width) || 0,
  )
  const maxHeight = Math.max(
    0,
    ...sizes.map((size) => Number(size.height) || 0),
    num(photo.maxHeight) || 0,
    num(photo.height) || 0,
  )
  const nestedSizes = asRecord(photo.sizes)
  const url = pickTripadvisorPhotoUrl(
    sizes,
    typeof photo.urlTemplate === 'string'
      ? photo.urlTemplate
      : typeof nestedSizes?.urlTemplate === 'string'
        ? nestedSizes.urlTemplate
        : undefined,
  )
  if (!url) return null
  return {
    url,
    maxWidth,
    maxHeight,
    identity: tripadvisorPhotoIdentity(url),
  }
}

function walkRecords(
  value: unknown,
  visit: (row: Record<string, unknown>) => void,
  depth = 0,
) {
  if (depth > 8) return
  const row = asRecord(value)
  if (row) {
    visit(row)
    for (const nested of Object.values(row)) walkRecords(nested, visit, depth + 1)
    return
  }
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 50)) walkRecords(item, visit, depth + 1)
  }
}

function photoFromRecord(row: Record<string, unknown>): string {
  const sizes = Array.isArray(row.sizes)
    ? (row.sizes as Array<{ width?: number; url?: string }>)
    : undefined
  const nestedSizes = asRecord(row.sizes)
  if (!sizes && !nestedSizes?.urlTemplate && typeof row.urlTemplate !== 'string') {
    return ''
  }
  return pickTripadvisorPhotoUrl(
    sizes,
    typeof row.urlTemplate === 'string'
      ? row.urlTemplate
      : typeof nestedSizes?.urlTemplate === 'string'
        ? nestedSizes.urlTemplate
        : undefined,
  )
}

export function normalizeTripadvisorCatalog(
  payload: unknown,
  kind: TripadvisorGalleryKind,
): TripadvisorCatalogItem[] {
  const root = asRecord(payload)
  const data = asRecord(root?.data) || root
  const rows = Array.isArray(data?.[kind === 'attraction' ? 'attractions' : 'restaurants'])
    ? (data?.[kind === 'attraction' ? 'attractions' : 'restaurants'] as unknown[])
    : []
  const items: TripadvisorCatalogItem[] = []
  for (const raw of rows) {
    const row = asRecord(raw)
    if (!row) continue
    const name = stripRankPrefix(textOf(row.cardTitle))
    const contentId = String(
      asRecord(asRecord(asRecord(row.cardLink)?.route)?.typedParams)?.contentId ||
        asRecord(asRecord(asRecord(row.cardLink)?.route)?.params)?.contentId ||
        '',
    ).trim()
    if (!name || !contentId) continue
    const photo = asRecord(row.cardPhoto)
    const sizes = asRecord(photo?.sizes)
    items.push({
      contentId,
      name,
      coverUrl:
        pickTripadvisorPhotoUrl(
          Array.isArray(photo?.sizes) ? (photo?.sizes as Array<{ width?: number; url?: string }>) : undefined,
          typeof sizes?.urlTemplate === 'string' ? sizes.urlTemplate : undefined,
        ) || undefined,
      kind,
    })
  }
  return items
}

export function normalizeTripadvisorGallery(
  payload: unknown,
  kind: TripadvisorGalleryKind,
  contentId: string,
  name: string,
  coverUrl?: string,
): TripadvisorPlaceGallery {
  const root = asRecord(payload)
  const data = asRecord(root?.data) || root
  const sections = Array.isArray(data?.sections) ? data.sections : []
  const candidates: TripadvisorGalleryPhotoCandidate[] = []
  for (const section of sections) {
    const mediaList = asRecord(section)?.mediaList
    if (!Array.isArray(mediaList)) continue
    for (const entry of mediaList) {
      const candidate = mediaEntryCandidate(entry)
      if (candidate) candidates.push(candidate)
    }
  }
  return {
    contentId,
    kind,
    name,
    photos: selectBestTripadvisorGalleryPhotos(candidates, MAX_GALLERY_PHOTOS, coverUrl ? [coverUrl] : []),
  }
}

export function normalizeTripadvisorAutocomplete(
  payload: unknown,
  kind: TripadvisorGalleryKind = 'attraction',
): TripadvisorCatalogItem[] {
  const items: TripadvisorCatalogItem[] = []
  const seen = new Set<string>()
  const typePattern =
    kind === 'restaurant'
      ? /restaurant|eatery|cafe|bistro|food|dining/
      : /attraction|activity|poi|landmark|museum/
  walkRecords(payload, (row) => {
    const contentId = String(
      row.contentId ||
        row.locationId ||
        asRecord(asRecord(row.route)?.params)?.contentId ||
        asRecord(asRecord(row.route)?.params)?.locationId ||
        asRecord(asRecord(asRecord(row.cardLink)?.route)?.params)?.contentId ||
        '',
    ).trim()
    if (!/^\d{5,}$/.test(contentId) || seen.has(contentId)) return
    const typeBlob = `${row.type || ''} ${row.placeType || ''} ${row.category || ''}`.toLowerCase()
    if (typeBlob && !typePattern.test(typeBlob)) return
    const name = stripRankPrefix(
      textOf(row.localizedName) ||
        textOf(row.title) ||
        textOf(row.cardTitle) ||
        textOf(row.name),
    )
    if (!name) return
    seen.add(contentId)
    items.push({ contentId, name, kind })
  })
  return items
}

export function normalizeTripadvisorAttractionDetails(
  payload: unknown,
  contentId: string,
): TripadvisorAttractionInfo {
  const photos: string[] = []
  let name = ''
  let description = ''
  let rating: number | undefined
  let userRatingCount: number | undefined
  let address = ''
  let latitude: number | undefined
  let longitude: number | undefined

  walkRecords(payload, (row) => {
    if (!name) {
      name =
        textOf(row.localizedName) ||
        textOf(row.cardTitle) ||
        textOf(row.name) ||
        name
    }
    const about =
      textOf(row.about) ||
      textOf(row.description) ||
      textOf(row.overview) ||
      textOf(row.summary)
    if (about.length > description.length && about.length > 40) {
      description = about
    }
    rating = rating ?? num(row.rating) ?? num(row.averageRating) ?? num(asRecord(row.bubbleRating)?.rating)
    userRatingCount =
      userRatingCount ??
      num(row.numberOfReviews) ??
      num(row.reviewCount) ??
      num(row.num_reviews) ??
      num(row.userRatingCount)
    if (!address) {
      address =
        textOf(row.address) ||
        textOf(asRecord(row.address)?.address_string) ||
        textOf(row.addressString)
    }
    latitude =
      latitude ??
      num(row.latitude) ??
      num(asRecord(row.geoPoint)?.latitude) ??
      num(asRecord(row.location)?.latitude)
    longitude =
      longitude ??
      num(row.longitude) ??
      num(asRecord(row.geoPoint)?.longitude) ??
      num(asRecord(row.location)?.longitude)
    const photo = photoFromRecord(row)
    if (photo) photos.push(photo)
  })

  return {
    contentId,
    name: stripRankPrefix(name) || contentId,
    description: description || undefined,
    rating,
    userRatingCount,
    address: address || undefined,
    location:
      latitude != null && longitude != null
        ? { lat: latitude, lng: longitude }
        : undefined,
    photos: uniquePhotos(photos),
  }
}

function catalogItemLabels(item: TripadvisorCatalogItem): string[] {
  return [item.name, ...(item.aliases || [])]
    .map((value) => value.trim())
    .filter(Boolean)
}

export function matchTripadvisorCatalogItem(
  items: TripadvisorCatalogItem[],
  name: string,
  nameLocal?: string,
): TripadvisorCatalogItem | null {
  const queries = [name, nameLocal].map((value) => value?.trim() || '').filter(Boolean)
  let best: TripadvisorCatalogItem | null = null
  let bestScore = PLACE_NAME_MATCH_MIN
  for (const item of items) {
    const labels = catalogItemLabels(item)
    const score = Math.max(
      0,
      ...queries.flatMap((query) =>
        labels.map((label) => placeIdentitySimilarity(query, label)),
      ),
    )
    if (score > bestScore) {
      best = item
      bestScore = score
    }
  }
  return best
}

async function requestTripadvisor(
  kind: TripadvisorRequestKind,
  rest: string,
  params: Record<string, string>,
  timeoutMs = 12_000,
): Promise<unknown | null> {
  if (!tryConsumeTripadvisorRequest(kind)) return null
  const query = new URLSearchParams({ rest, language: 'en_US', ...params })
  const response = await authFetch(`/api/tripadvisor?${query}`, {
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!response.ok) {
    const message = await response.text().catch(() => '')
    throw new Error(
      `Tripadvisor request failed (${response.status})${message ? `: ${message}` : ''}`,
    )
  }
  return response.json() as Promise<unknown>
}

function mergeSeededAttractions(items: TripadvisorCatalogItem[]): TripadvisorCatalogItem[] {
  const byId = new Map(items.map((item) => [item.contentId, item]))
  for (const seed of SEEDED_ATTRACTIONS) {
    const current = byId.get(seed.contentId)
    if (!current) {
      byId.set(seed.contentId, { ...seed })
      continue
    }
    if (seed.coverUrl && !current.coverUrl) {
      byId.set(seed.contentId, { ...current, coverUrl: seed.coverUrl })
    }
  }
  return [...byId.values()]
}

function readCatalog(kind: TripadvisorGalleryKind): TripadvisorCatalogItem[] {
  const key = catalogKey(kind)
  const memory = catalogMemory.get(key)
  if (memory?.length) {
    if (kind !== 'attraction') return memory
    const merged = mergeSeededAttractions(memory)
    if (merged.length !== memory.length) catalogMemory.set(key, merged)
    return merged
  }
  const stored = getLlmArtifact<TripadvisorCatalogItem[]>(key)
  if (Array.isArray(stored) && stored.length) {
    const next = kind === 'attraction' ? mergeSeededAttractions(stored) : stored
    catalogMemory.set(key, next)
    return next
  }
  if (kind === 'attraction') {
    const seeded = SEEDED_ATTRACTIONS.map((item) => ({ ...item }))
    catalogMemory.set(key, seeded)
    return seeded
  }
  return []
}

async function loadCatalog(
  kind: TripadvisorGalleryKind,
): Promise<TripadvisorCatalogItem[]> {
  return readCatalog(kind)
}

function uniqueLabels(values: Array<string | undefined>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const label = value?.trim() || ''
    const key = label.toLowerCase()
    if (!label || seen.has(key)) continue
    seen.add(key)
    out.push(label)
  }
  return out
}

function rememberCatalogItem(
  item: TripadvisorCatalogItem,
  aliases: Array<string | undefined> = [],
) {
  const extra = uniqueLabels(aliases).filter(
    (label) => label.toLowerCase() !== item.name.trim().toLowerCase(),
  )
  const current = readCatalog(item.kind)
  const index = current.findIndex((row) => row.contentId === item.contentId)
  if (index >= 0) {
    const existing = current[index]
    const merged = uniqueLabels([...(existing.aliases || []), ...extra])
    if (merged.length === (existing.aliases || []).length) return
    const next = [...current]
    next[index] = { ...existing, aliases: merged }
    catalogMemory.set(catalogKey(item.kind), next)
    setLlmArtifact(catalogKey(item.kind), next, { silent: true })
    return
  }
  const nextItem = extra.length > 0 ? { ...item, aliases: extra } : item
  const next = [...current, nextItem]
  catalogMemory.set(catalogKey(item.kind), next)
  setLlmArtifact(catalogKey(item.kind), next, { silent: true })
}

function matchLookupKey(
  kind: TripadvisorGalleryKind,
  input: { name: string; nameLocal?: string; contentId?: string },
): string {
  return [
    kind,
    input.contentId?.trim() || '',
    input.name.trim().toLowerCase(),
    (input.nameLocal || '').trim().toLowerCase(),
  ].join('|')
}

function queryMatchKey(
  kind: TripadvisorGalleryKind,
  name: string,
  nameLocal?: string,
): string {
  return `${kind}|q:${tripadvisorAutocompleteQuery(name, nameLocal, kind).trim().toLowerCase()}`
}

function readMatchLookup(
  kind: TripadvisorGalleryKind,
  input: { name: string; nameLocal?: string; contentId?: string },
): string | 'miss' | undefined {
  const keys = [
    matchLookupKey(kind, input),
    queryMatchKey(kind, input.name, input.nameLocal),
  ]
  for (const key of keys) {
    const memory = matchLookup.get(key)
    if (memory !== undefined) return memory
    const stored = getLlmArtifact<string>(`${QUERY_MATCH_PREFIX}${key}`)
    if (stored === 'miss' || (typeof stored === 'string' && stored)) {
      matchLookup.set(key, stored as string | 'miss')
      return stored as string | 'miss'
    }
  }
  return undefined
}

function rememberMatchLookup(
  kind: TripadvisorGalleryKind,
  input: { name: string; nameLocal?: string; contentId?: string },
  contentId: string | 'miss',
) {
  const keys = [
    matchLookupKey(kind, input),
    queryMatchKey(kind, input.name, input.nameLocal),
  ]
  for (const key of keys) {
    matchLookup.set(key, contentId)
    setLlmArtifact(`${QUERY_MATCH_PREFIX}${key}`, contentId, { silent: true })
  }
}

function readGallery(
  kind: TripadvisorGalleryKind,
  contentId: string,
): TripadvisorPlaceGallery | null {
  const key = galleryKey(kind, contentId)
  const memory = galleryMemory.get(key)
  if (memory) return memory
  const stored = getLlmArtifact<TripadvisorPlaceGallery>(key)
  if (stored?.photos?.length) {
    galleryMemory.set(key, stored)
    return stored
  }
  return null
}

function storeGallery(gallery: TripadvisorPlaceGallery) {
  galleryMemory.set(galleryKey(gallery.kind, gallery.contentId), gallery)
  setLlmArtifact(galleryKey(gallery.kind, gallery.contentId), gallery, {
    silent: true,
  })
}

function readDetails(contentId: string): TripadvisorAttractionInfo | null {
  const memory = detailsMemory.get(contentId)
  if (memory) return memory
  const stored = getLlmArtifact<TripadvisorAttractionInfo>(detailsKey(contentId))
  if (stored?.contentId) {
    detailsMemory.set(contentId, stored)
    return stored
  }
  return null
}

function storeDetails(info: TripadvisorAttractionInfo) {
  detailsMemory.set(info.contentId, info)
  setLlmArtifact(detailsKey(info.contentId), info, { silent: true })
}

function findCatalogItem(
  catalog: TripadvisorCatalogItem[],
  input: { name: string; nameLocal?: string; contentId?: string },
): TripadvisorCatalogItem | null {
  if (input.contentId) {
    const exact = catalog.find((item) => item.contentId === input.contentId)
    if (exact) return exact
  }
  return matchTripadvisorCatalogItem(catalog, input.name, input.nameLocal)
}

export function peekTripadvisorPlacePhotos(
  name: string,
  nameLocal?: string,
  type?: PlaceType,
  contentId?: string,
): string[] {
  const kind = galleryKindForPlaceType(type)
  if (!kind) return []
  const catalog = catalogMemory.get(catalogKey(kind)) || readCatalog(kind)
  const input = { name, nameLocal, contentId }
  let match = catalog ? findCatalogItem(catalog, input) : null
  if (!match) {
    const remembered = readMatchLookup(kind, input)
    if (remembered && remembered !== 'miss') {
      match = catalog.find((item) => item.contentId === remembered) || {
        contentId: remembered,
        name,
        kind,
      }
    }
  }
  if (match) {
    const details = match.kind === 'attraction' ? readDetails(match.contentId) : null
    if (details?.photos.length) return details.photos
    const gallery = readGallery(kind, match.contentId)
    if (gallery?.photos.length) return gallery.photos
    return match.coverUrl ? [match.coverUrl] : []
  }
  return []
}

export function peekTripadvisorAttractionInfo(
  name: string,
  nameLocal?: string,
  contentId?: string,
): TripadvisorAttractionInfo | null {
  const catalog = readCatalog('attraction')
  const match = findCatalogItem(catalog, { name, nameLocal, contentId })
  if (!match) return null
  const details = readDetails(match.contentId)
  const gallery = readGallery('attraction', match.contentId)
  const photos =
    gallery?.photos.length
      ? gallery.photos
      : details?.photos.length
        ? details.photos
        : match.coverUrl
          ? [match.coverUrl]
          : []
  if (!details && !photos.length && !match.location) return null
  return {
    contentId: match.contentId,
    name: details?.name || match.name,
    description: details?.description,
    rating: details?.rating,
    userRatingCount: details?.userRatingCount,
    address: details?.address,
    location: details?.location || match.location,
    photos,
  }
}

export function hasCachedTripadvisorGallery(
  contentId?: string,
  kind: TripadvisorGalleryKind = 'attraction',
): boolean {
  if (!contentId) return false
  return Boolean(readGallery(kind, contentId)?.photos.length)
}

async function loadGalleryFor(
  match: TripadvisorCatalogItem,
): Promise<TripadvisorPlaceGallery | null> {
  const cached = readGallery(match.kind, match.contentId)
  if (cached) return cached
  const inflightKey = galleryKey(match.kind, match.contentId)
  const pending = galleryInflight.get(inflightKey)
  if (pending) return pending

  const task = (async () => {
    const payload = await requestTripadvisor(
      'media-gallery',
      match.kind === 'attraction'
        ? 'attractions/media-gallery'
        : 'restaurants/media-gallery',
      { contentId: match.contentId },
    )
    if (!payload) return null
    const gallery = normalizeTripadvisorGallery(
      payload,
      match.kind,
      match.contentId,
      match.name,
      match.coverUrl,
    )
    if (!gallery.photos.length && match.coverUrl) {
      gallery.photos = [match.coverUrl]
    }
    if (!gallery.photos.length) return null
    storeGallery(gallery)
    return gallery
  })()

  galleryInflight.set(inflightKey, task)
  try {
    return await task
  } finally {
    galleryInflight.delete(inflightKey)
  }
}

export async function fetchTripadvisorPlaceGallery(input: {
  name: string
  nameLocal?: string
  type?: PlaceType
  contentId?: string
}): Promise<TripadvisorPlaceGallery | null> {
  const kind = galleryKindForPlaceType(input.type)
  if (!kind || (!input.name.trim() && !input.contentId)) return null
  const catalog = readCatalog(kind)
  const remembered = readMatchLookup(kind, input)
  if (remembered === 'miss') return null
  const cachedMatch =
    (remembered && remembered !== 'miss'
      ? catalog.find((item) => item.contentId === remembered)
      : null) ||
    findCatalogItem(catalog, {
      name: input.name,
      nameLocal: input.nameLocal,
      contentId: input.contentId || (remembered !== 'miss' ? remembered : undefined),
    })
  if (cachedMatch) {
    const gallery = readGallery(kind, cachedMatch.contentId)
    if (gallery?.photos.length) return gallery
  } else if (remembered && remembered !== 'miss') {
    const gallery = readGallery(kind, remembered)
    if (gallery?.photos.length) return gallery
  }
  const match =
    kind === 'attraction'
      ? await resolveAttractionMatch({
          name: input.name,
          nameLocal: input.nameLocal,
          contentId: input.contentId,
        })
      : await resolveRestaurantMatch({
          name: input.name,
          nameLocal: input.nameLocal,
          contentId: input.contentId,
        })
  if (!match) return null
  return loadGalleryFor(match)
}

function pickAutocompleteHit(
  hits: TripadvisorCatalogItem[],
  name: string,
  nameLocal?: string,
): TripadvisorCatalogItem | null {
  const matched = matchTripadvisorCatalogItem(hits, name, nameLocal)
  if (matched) return matched
  const hasLatin = [nameLocal, name].some((value) => value && !/[\u3400-\u9fff]/.test(value))
  if (!hasLatin) return hits[0] || null
  return null
}

function canonicalLookupLabels(
  name: string,
  nameLocal: string | undefined,
  canonical: AttractionCanonicalName,
): Array<{ name: string; nameLocal?: string }> {
  const labels: Array<{ name: string; nameLocal?: string }> = [
    { name: canonical.nameEn, nameLocal: canonical.nameFr || nameLocal },
    { name, nameLocal },
  ]
  for (const alias of canonical.aliases) {
    labels.push({ name: alias, nameLocal: canonical.nameEn })
  }
  return labels
}

function matchLabels(
  catalog: TripadvisorCatalogItem[],
  hits: TripadvisorCatalogItem[],
  labels: Array<{ name: string; nameLocal?: string }>,
): TripadvisorCatalogItem | null {
  for (const label of labels) {
    const fromCatalog = findCatalogItem(catalog, label)
    if (fromCatalog) return fromCatalog
    const fromHits = pickAutocompleteHit(hits, label.name, label.nameLocal)
    if (fromHits) return fromHits
  }
  return null
}

async function autocompleteHits(
  name: string,
  nameLocal?: string,
  kind: TripadvisorGalleryKind = 'attraction',
): Promise<TripadvisorCatalogItem[]> {
  const query = tripadvisorAutocompleteQuery(name, nameLocal, kind)
  if (!query) return []
  const payload = await requestTripadvisor('auto-complete', 'auto-complete', {
    query,
  })
  if (!payload) return []
  return normalizeTripadvisorAutocomplete(payload, kind)
}

/** Keep the listing name, and always include the city for disambiguation. */
export function tripadvisorAutocompleteQuery(
  name: string,
  nameLocal?: string,
  kind: TripadvisorGalleryKind = 'attraction',
): string {
  if (kind === 'restaurant') {
    const labels = [nameLocal, name].map((value) => value?.trim() || '').filter(Boolean)
    const latin = labels.find((label) => !/[\u3400-\u9fff]/.test(label)) || labels[0] || ''
    const core = latin.replace(/[（(][^）)]*[）)]/g, ' ').replace(/\s+/g, ' ').trim()
    if (!core) return 'Paris'
    return /\bparis\b/i.test(core) ? core : `${core} Paris`
  }
  const search = placeSearchQuery(name, nameLocal)
  if (!search) return ''
  return /\bparis\b/i.test(search) ? search : `${search} Paris`
}

function searchIsLatin(name: string, nameLocal?: string): boolean {
  return /[a-z]/i.test(placeSearchQuery(name, nameLocal))
}

/** Last-resort restaurant match: catalog / contentId, else one autocomplete. No LLM retry. */
async function resolveRestaurantMatch(input: {
  name: string
  nameLocal?: string
  contentId?: string
}): Promise<TripadvisorCatalogItem | null> {
  const catalog = await loadCatalog('restaurant')
  const lookup = readMatchLookup('restaurant', input)
  if (lookup === 'miss') return null
  if (lookup) {
    const byId = catalog.find((item) => item.contentId === lookup)
    if (byId) return byId
  }
  const existing = findCatalogItem(catalog, input)
  if (existing) {
    rememberCatalogItem(existing, [input.name, input.nameLocal])
    rememberMatchLookup('restaurant', input, existing.contentId)
    return existing
  }
  if (input.contentId) {
    const item = {
      contentId: input.contentId,
      name: input.nameLocal || input.name,
      kind: 'restaurant' as const,
    }
    rememberCatalogItem(item, [input.name, input.nameLocal])
    rememberMatchLookup('restaurant', input, item.contentId)
    return item
  }

  const hits = await autocompleteHits(input.name, input.nameLocal, 'restaurant')
  const match = matchTripadvisorCatalogItem(hits, input.name, input.nameLocal)
  if (!match) {
    rememberMatchLookup('restaurant', input, 'miss')
    return null
  }
  rememberCatalogItem(match, [input.name, input.nameLocal])
  rememberMatchLookup('restaurant', input, match.contentId)
  return match
}

async function resolveAttractionMatch(input: {
  name: string
  nameLocal?: string
  contentId?: string
}): Promise<TripadvisorCatalogItem | null> {
  const catalog = await loadCatalog('attraction')
  const existing = findCatalogItem(catalog, input)
  if (existing) return existing
  if (input.contentId) {
    return {
      contentId: input.contentId,
      name: input.nameLocal || input.name,
      kind: 'attraction',
    }
  }

  let hits: TripadvisorCatalogItem[] = []
  if (searchIsLatin(input.name, input.nameLocal)) {
    hits = await autocompleteHits(input.name, input.nameLocal, 'attraction')
  }
  let match = matchLabels(catalog, hits, [{ name: input.name, nameLocal: input.nameLocal }])
  if (match) {
    rememberCatalogItem(match)
    return match
  }

  const canonical = await resolveAttractionCanonicalName({
    name: input.name,
    nameLocal: input.nameLocal,
  }).catch(() => null)
  if (!canonical?.nameEn) return null

  const labels = canonicalLookupLabels(input.name, input.nameLocal, canonical)
  match = matchLabels(catalog, hits, labels)
  if (!match) {
    const retrySearch = placeSearchQuery(canonical.nameEn, canonical.nameFr)
    const firstSearch = placeSearchQuery(input.name, input.nameLocal)
    if (retrySearch && retrySearch !== firstSearch) {
      hits = await autocompleteHits(canonical.nameEn, canonical.nameFr, 'attraction')
      match = matchLabels(catalog, hits, labels)
    }
  }
  if (!match) return null
  rememberCatalogItem(match)
  return match
}

export async function fetchTripadvisorAttractionInfo(input: {
  name: string
  nameLocal?: string
  contentId?: string
}): Promise<TripadvisorAttractionInfo | null> {
  if (!input.name.trim() && !input.contentId) return null
  const peeked = peekTripadvisorAttractionInfo(input.name, input.nameLocal, input.contentId)
  if (peeked?.photos.length && hasCachedTripadvisorGallery(peeked.contentId)) return peeked

  const inflightKey = `${input.contentId || ''}:${input.name}:${input.nameLocal || ''}`
  const pending = infoInflight.get(inflightKey)
  if (pending) return pending

  const task = (async () => {
    const match = await resolveAttractionMatch(input)
    if (!match) return null

    const cachedDetails = readDetails(match.contentId)
    const gallery = await loadGalleryFor(match)
    const photos =
      gallery?.photos.length
        ? gallery.photos
        : cachedDetails?.photos.length
          ? cachedDetails.photos
          : match.coverUrl
            ? [match.coverUrl]
            : []

    const info: TripadvisorAttractionInfo = {
      contentId: match.contentId,
      name: cachedDetails?.name || match.name,
      description: cachedDetails?.description,
      rating: cachedDetails?.rating,
      userRatingCount: cachedDetails?.userRatingCount,
      address: cachedDetails?.address,
      location: cachedDetails?.location || match.location,
      photos,
    }
    if (info.photos.length || info.location) {
      storeDetails(info)
      return info
    }
    return null
  })()

  infoInflight.set(inflightKey, task)
  try {
    return await task
  } finally {
    infoInflight.delete(inflightKey)
  }
}

export function resetTripadvisorPlacePhotosForTests() {
  catalogMemory.clear()
  galleryMemory.clear()
  galleryInflight.clear()
  detailsMemory.clear()
  infoInflight.clear()
  matchLookup.clear()
}
