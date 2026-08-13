import type { Coordinates, PlaceType } from '../../../types'
import type { GoogleReview } from '../../map/services/googlePlaceDetails'
import { authFetch } from '../../auth/services/authFetch'
import {
  getLlmArtifact,
  setLlmArtifact,
} from '../../../shared/services/llm/llmArtifactStore'
import {
  placeIdentitySimilarity,
  placeLatinLabel,
  PLACE_NAME_MATCH_MIN,
} from '../../../shared/utils/placeTitle'
import {
  resolveAttractionCanonicalName,
  resolveTripadvisorRestaurantListing,
  type AttractionCanonicalName,
} from '../../../shared/services/llm/llm'
import {
  appendCityToQuery,
  locationBelongsToCity,
  tripCityFromDestination,
} from '../../destination/services/tripCity'
import {
  refundTripadvisorRequest,
  tryConsumeTripadvisorRequest,
  type TripadvisorRequestKind,
} from './tripadvisorRequestBudget'

export type TripadvisorGalleryKind = 'attraction' | 'restaurant'

export interface TripadvisorCatalogItem {
  contentId: string
  name: string
  coverUrl?: string
  listingUrl?: string
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
  website?: string
  phone?: string
  priceLevel?: string
  cuisine?: string
  location?: Coordinates
  photos: string[]
  reviews: GoogleReview[]
}

const CATALOG_PREFIX = 'tripadvisor-catalog:v1:'
const GALLERY_PREFIX = 'tripadvisor-gallery:v16:'
const DETAILS_PREFIX = 'tripadvisor-place-details:v13:'
const QUERY_MATCH_PREFIX = 'tripadvisor-query-match:v3:'
export const MAX_GALLERY_PHOTOS = 15
const MAX_REVIEWS = 8
const MIN_GALLERY_WIDTH = 400
const DISPLAY_WIDTH = 1200
const DISPLAY_HEIGHT = 900
const TA_AUTOCOMPLETE = 'api/v1/autocomplete'
const TA_RESTAURANT_DETAIL = 'api/v1/restaurants/detail'
const TA_RESTAURANT_REVIEWS = 'api/v1/restaurants/reviews'
const TA_THINGS_TO_DO_DETAIL = 'api/v1/things-to-do/detail'
const TA_LOCALE = 'en_US'
const TA_AUTOCOMPLETE_LOCALE = 'en-US'
const TA_CURRENCY = 'USD'
const SPHERE_LISTING_URL =
  'https://www.tripadvisor.ca/Restaurant_Review-g187147-d25158864-Reviews-Sphere-Paris_Ile_de_France.html'

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
  {
    contentId: '590230',
    name: 'Grand Palais',
    kind: 'attraction',
    location: { lat: 48.86611, lng: 2.312454 },
    aliases: ['大皇宫'],
    listingUrl:
      'https://www.tripadvisor.com/Attraction_Review-g187147-d590230-Reviews-Grand_Palais-Paris_Ile_de_France.html',
    coverUrl:
      'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/08/03/3f/99/grand-palais.jpg?w=1200&h=900&s=1',
  },
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
    aliases: ['巴黎现代艺术博物馆', "Musée d'Art Moderne de Paris"],
    listingUrl:
      'https://www.tripadvisor.com/Attraction_Review-g187147-d188486-Reviews-Musee_d_Art_Moderne_de_Paris-Paris_Ile_de_France.html',
    coverUrl:
      'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/10/4b/8b/6d/les-collections-permanentes.jpg?w=1200&h=900&s=1',
  },
  {
    contentId: '246664',
    name: 'Palais de Tokyo',
    kind: 'attraction',
    location: { lat: 48.8642, lng: 2.2973 },
    aliases: ['东京宫'],
    listingUrl:
      'https://www.tripadvisor.com/Attraction_Review-g187147-d246664-Reviews-Palais_de_Tokyo-Paris_Ile_de_France.html',
  },
]
/**
 * Verified restaurant listings used as cache warmers and alias maps.
 * Keep this list small; live matching uses autocomplete, then an LLM URL.
 */
const SEEDED_RESTAURANTS: TripadvisorCatalogItem[] = [
  {
    contentId: '24052281',
    name: 'Sogno Paris',
    kind: 'restaurant',
    location: { lat: 48.8689, lng: 2.2936 },
    aliases: ['Sogno', 'SOGNO PARIS', '多恋'],
    listingUrl:
      'https://www.tripadvisor.com/Restaurant_Review-g187147-d24052281-Reviews-Sogno_Paris-Paris_Ile_de_France.html',
    coverUrl:
      'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/24/67/76/e3/penne-all-arrabbiata.jpg?w=1200&h=900&s=1',
  },
  {
    contentId: '5943832',
    name: "Brasserie L'Alsace",
    kind: 'restaurant',
    location: { lat: 48.86998, lng: 2.305772 },
    aliases: ["L'Alsace", '阿尔萨斯'],
    listingUrl:
      'https://www.tripadvisor.com/Restaurant_Review-g187147-d5943832-Reviews-Brasserie_L_Alsace-Paris_Ile_de_France.html',
    coverUrl:
      'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/23/5d/95/29/terrasse.jpg?w=1200&h=900&s=1',
  },
  {
    contentId: '25158864',
    name: 'Sphere',
    kind: 'restaurant',
    location: { lat: 48.874268, lng: 2.31694 },
    aliases: ['Sphère', '斯菲尔'],
    listingUrl: SPHERE_LISTING_URL,
    coverUrl:
      'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/2a/82/2c/00/salle-du-restaurant-gastronomi.jpg?w=1200&h=900&s=1',
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

function httpUrl(value: string): string {
  const raw = value.trim()
  if (!raw) return ''
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return ''
    return url.toString()
  } catch {
    return ''
  }
}

function officialWebsiteFromRecord(row: Record<string, unknown>): string {
  const nested = asRecord(row.website)
  const candidates = [
    textOf(row.website),
    textOf(row.websiteUrl),
    textOf(row.websiteURI),
    textOf(row.officialWebsite),
    textOf(nested?.url),
    textOf(nested?.href),
  ]
  for (const raw of candidates) {
    const url = httpUrl(raw)
    if (!url) continue
    if (/tripadvisor\.|google\.|rapidapi\.|facebook\.|instagram\./i.test(url)) continue
    return url
  }
  return ''
}

function phoneFromRecord(row: Record<string, unknown>): string {
  const nested = asRecord(row.phone) || asRecord(row.telephone)
  const tel =
    typeof row.externalUrl === 'string' && row.externalUrl.toLowerCase().startsWith('tel:')
      ? phoneFromTelUrl(row.externalUrl)
      : ''
  const raw =
    tel ||
    textOf(row.phone) ||
    textOf(row.phoneNumber) ||
    textOf(row.telephone) ||
    textOf(nested?.displayString) ||
    textOf(nested?.formatted)
  const value = raw.replace(/\s+/g, ' ').trim()
  if (!value || !/[+]?\d[\d\s().-]{6,}\d/.test(value)) return ''
  return value
}

function phoneFromTelUrl(value: string): string {
  if (!/^tel:/i.test(value)) return ''
  try {
    return decodeURIComponent(value.slice(4)).replace(/\s+/g, ' ').trim()
  } catch {
    return value.slice(4).replace(/\s+/g, ' ').trim()
  }
}

function contactLinkType(row: Record<string, unknown>): string {
  return String(row.linkType || '').toUpperCase()
}

function contactExternalUrl(row: Record<string, unknown>): string {
  const link = asRecord(row.link)
  return String(link?.externalUrl || row.externalUrl || '').trim()
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
  let resolved = url
  if (resolved.includes('{width}') || resolved.includes('{height}')) {
    resolved = resolved
      .replaceAll('{width}', String(DISPLAY_WIDTH))
      .replaceAll('{height}', String(DISPLAY_HEIGHT))
  }
  try {
    const parsed = new URL(resolved)
    if (!/tripadvisor\.com$/i.test(parsed.hostname) && !parsed.hostname.endsWith('.tripadvisor.com')) {
      return resolved
    }
    const height = parsed.searchParams.get('h')
    if (height === '-1' || height === '0') {
      parsed.searchParams.set('h', String(DISPLAY_HEIGHT))
      return parsed.toString()
    }
    return resolved
  } catch {
    return resolved
  }
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
    if (!candidate.url) continue
    if (candidate.maxWidth > 0 && candidate.maxWidth < MIN_GALLERY_WIDTH) continue
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
  if (value.startsWith('ta-')) return tripadvisorContentIdFromCandidate(value.slice(3))
  const locId = value.match(/^loc;(\d{5,})$/i)?.[1]
  if (locId) return locId
  if (/^\d{5,}$/.test(value)) return value
  return tripadvisorContentIdFromUrl(value)
}

/** Real Tripadvisor listing pages include geo (`-g`) and location (`-d`) ids. */
export function isTripadvisorListingUrl(value?: string): boolean {
  const text = value?.trim() || ''
  if (!/^https?:\/\//i.test(text)) return false
  return /(?:Restaurant_Review|Attraction_Review)-g\d+-d\d{5,}-/i.test(text)
}

export function tripadvisorListingUrl(
  _kind: TripadvisorGalleryKind,
  _contentId: string,
  listingUrl?: string,
): string {
  const existing = listingUrl?.trim() || ''
  return isTripadvisorListingUrl(existing) ? existing : ''
}

function tripadvisorDetailPath(kind: TripadvisorGalleryKind): string {
  return kind === 'attraction' ? TA_THINGS_TO_DO_DETAIL : TA_RESTAURANT_DETAIL
}

function isTripadvisorRateLimited(error: unknown): boolean {
  return error instanceof Error && /\(429\)|too many requests/i.test(error.message)
}

/**
 * tripadvisor34 details: restaurants send a listing `url`. Attractions always
 * send `locationId` so things-to-do lookup cannot attach the wrong page, and
 * also send `url` when autocomplete/seed already has an Attraction_Review link.
 */
function seededCatalogItem(contentId: string): TripadvisorCatalogItem | undefined {
  return (
    SEEDED_RESTAURANTS.find((item) => item.contentId === contentId) ||
    SEEDED_ATTRACTIONS.find((item) => item.contentId === contentId)
  )
}

function resolvedListingUrl(
  kind: TripadvisorGalleryKind,
  contentId: string,
  listingUrl?: string,
): string {
  return (
    tripadvisorListingUrl(kind, contentId, listingUrl) ||
    tripadvisorListingUrl(kind, contentId, seededCatalogItem(contentId)?.listingUrl)
  )
}

function tripadvisorDetailParams(
  kind: TripadvisorGalleryKind,
  contentId: string,
  listingUrl?: string,
): Record<string, string> {
  const params: Record<string, string> = {
    locale: TA_LOCALE,
    currency: TA_CURRENCY,
  }
  const url = resolvedListingUrl(kind, contentId, listingUrl)
  if (url) params.url = url
  if (kind === 'attraction' && contentId) params.locationId = contentId
  return params
}

function tripadvisorReviewParams(
  kind: TripadvisorGalleryKind,
  contentId: string,
  listingUrl?: string,
): Record<string, string> {
  const params: Record<string, string> = {
    language: 'en',
    limit: String(MAX_REVIEWS),
  }
  const url = resolvedListingUrl(kind, contentId, listingUrl)
  if (url) params.url = url
  if (kind === 'attraction' && contentId) params.locationId = contentId
  return params
}

/** Tripadvisor restaurant/attraction review URLs use `-d12345-`. */
export function tripadvisorContentIdFromUrl(value?: string): string | undefined {
  const text = value?.trim() || ''
  if (!text) return undefined
  const review = text.match(
    /(?:Restaurant_Review|Attraction_Review|Hotel_Review)-[^/\s"'<>]*?-d(\d{5,})/i,
  )
  if (review?.[1]) return review[1]
  const location = text.match(/[?&](?:geoId|locationId|contentId)=(\d{5,})/i)
  if (location?.[1]) return location[1]
  return undefined
}

function restaurantLocationAllowed(label: string): boolean {
  return locationBelongsToCity(label, tripCityFromDestination())
}

export function listSeededTripadvisorAttractions(): TripadvisorCatalogItem[] {
  return SEEDED_ATTRACTIONS.map((item) => ({ ...item }))
}

export function listSeededTripadvisorRestaurants(): TripadvisorCatalogItem[] {
  return SEEDED_RESTAURANTS.map((item) => ({ ...item }))
}

function catalogKey(kind: TripadvisorGalleryKind): string {
  const city = tripCityFromDestination()
  return `${CATALOG_PREFIX}${kind}:${city.tripadvisorGeoId || city.nameEn}`
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
  const dynamic = asRecord(photo.photoSizeDynamic)
  const maxWidth = Math.max(
    0,
    ...sizes.map((size) => Number(size.width) || 0),
    num(photo.maxWidth) || 0,
    num(photo.width) || 0,
    num(dynamic?.maxWidth) || 0,
  )
  const maxHeight = Math.max(
    0,
    ...sizes.map((size) => Number(size.height) || 0),
    num(photo.maxHeight) || 0,
    num(photo.height) || 0,
    num(dynamic?.maxHeight) || 0,
  )
  const nestedSizes = asRecord(photo.sizes)
  const url = pickTripadvisorPhotoUrl(
    sizes,
    typeof photo.urlTemplate === 'string'
      ? photo.urlTemplate
      : typeof nestedSizes?.urlTemplate === 'string'
        ? nestedSizes.urlTemplate
        : typeof dynamic?.urlTemplate === 'string'
          ? dynamic.urlTemplate
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

/**
 * Nested RapidAPI / page-footer shelves that are not this listing's album.
 * tripadvisor34 often flattens the same photos into top-level `images[]` too.
 */
const RELATED_SECTION_KEY =
  /^(related|similar|recommended|nearby|associated|also[_-]?viewed|recently[_-]?viewed|location[_-]?list|carousels?$|stories$|articles$|editorial$|must[_-]?see|historical[_-]?tours?|skip[_-]?the[_-]?line|audio[_-]?guides?|segway|more[_-]?tickets)/i

const COMMERCE_SECTION_KEY =
  /^(highlights|tours|tourproducts|tickets|experiences|activities|offers|bookableexperiences|products|audioguides|segwaytours|moretickets|ticketstoursandexexperiences|ticketstoursexperiences)$/i

const LISTING_CONTENT_KEY =
  /^(images?|photos?|reviews?|media|medialist|gallery|album|about|description|address|name|id|locationid)$/i

const EXCLUDED_SHELF_HEADING =
  /must[-\s]?see\s*highlights?|historical\s*tours?|skip\s*the\s*line|more\s+tickets|tours,?\s+and\s+experiences|audio\s*guides?|segway\s*tours?|sightseeing\s*(cruises?|tours?)|hop[-\s]?on|boat\s*tours?|bus\s*tours?|bike\s*tours?|private\s+and\s+luxury|best seller/i

const EXCLUDED_ENTRY_BLOB =
  /related\s*stor|min read|\barticle\b|\beditorial\b|\bnearby\b|best moderately|associated restaurant|must[-\s]?see\s*highlights?|historical\s*tours?|skip\s*the\s*line|more\s+tickets|tours,?\s+and\s+experiences|audio\s*guides?|segway|free cancellation|likely to sell out|walking tour|private sightseeing|sightseeing cruises?|from\s*c?\$|best seller/i

function nestedLooksLikeCards(value: unknown): boolean {
  const sample = carouselSample(value)
  if (!sample.length) return false
  let cardish = 0
  for (const item of sample) {
    const title = textOf(item.title) || textOf(item.name) || textOf(item.heading)
    const description = textOf(item.description) || textOf(item.subtitle) || textOf(item.caption)
    if ((title && description) || itemLooksLikeProduct(item)) cardish += 1
  }
  return cardish >= Math.min(2, sample.length) || (sample.length === 1 && cardish === 1)
}

function nestedLooksLikeProductCards(value: unknown): boolean {
  const sample = carouselSample(value)
  if (!sample.length) return false
  let products = 0
  for (const item of sample) {
    if (itemLooksLikeProduct(item)) products += 1
  }
  return products >= Math.min(2, sample.length) || (sample.length === 1 && products === 1)
}

function carouselSample(value: unknown): Array<Record<string, unknown>> {
  const row = asRecord(value)
  const items = Array.isArray(value)
    ? value
    : Array.isArray(row?.items)
      ? row.items
      : Array.isArray(row?.cards)
        ? row.cards
        : Array.isArray(row?.tours)
          ? row.tours
          : Array.isArray(row?.products)
            ? row.products
            : []
  if (!items.length) return []
  return items.slice(0, 4).map(asRecord).filter(Boolean) as Array<Record<string, unknown>>
}

function itemLooksLikeProduct(item: Record<string, unknown>): boolean {
  if (
    item.price != null ||
    item.fromPrice != null ||
    item.productId != null ||
    item.offerId != null ||
    item.duration != null ||
    item.durationString != null
  ) {
    return true
  }
  const blob = [
    item.title,
    item.name,
    item.heading,
    item.description,
    item.subtitle,
    item.caption,
    item.category,
    item.priceLabel,
  ]
    .map((value) => textOf(value))
    .join(' ')
  return /from\s|[€$£]|free cancellation|likely to sell out|best seller|\b\d+h(?:\s*\d+m)?\b|audio\s*guide|segway|\btour\b/i.test(
    blob,
  )
}

function isRelatedSectionKey(key: string, nested?: unknown): boolean {
  const normalized = key.replace(/[_-]/g, '').toLowerCase()
  if (LISTING_CONTENT_KEY.test(normalized)) return false
  if (
    normalized === 'stories' ||
    normalized === 'articles' ||
    normalized === 'editorial' ||
    normalized === 'nearby' ||
    normalized === 'locationlist' ||
    normalized === 'carousel' ||
    normalized === 'carousels' ||
    normalized === 'mustsee' ||
    normalized === 'mustseehighlights' ||
    normalized === 'historicaltours' ||
    normalized === 'skiptheline' ||
    normalized === 'skipthelinetickets' ||
    normalized === 'audioguides' ||
    normalized === 'segwaytours' ||
    normalized === 'moretickets' ||
    normalized === 'moreticketstoursandexexperiences' ||
    normalized === 'ticketstoursexperiences'
  ) {
    return true
  }
  if (
    normalized === 'duration' &&
    typeof nested === 'string' &&
    nested.length > 120
  ) {
    return true
  }
  if (COMMERCE_SECTION_KEY.test(normalized) || /tour|ticket|experience|guide|segway|cruise|product|offer/.test(normalized)) {
    return nested === undefined || nestedLooksLikeCards(nested) || nestedLooksLikeProductCards(nested)
  }
  if (nested !== undefined && nestedLooksLikeProductCards(nested)) return true
  return RELATED_SECTION_KEY.test(key)
}

function sectionHeadingLooksExcluded(row: Record<string, unknown>): boolean {
  const heading = [
    row.title,
    row.heading,
    row.sectionTitle,
    row.section,
    row.label,
    row.header,
    row.name,
  ]
    .map((value) => textOf(value))
    .join(' ')
  return EXCLUDED_SHELF_HEADING.test(heading)
}

/**
 * Editorial Related Stories covers that tripadvisor34 concatenates onto every
 * Paris details `images[]` after the listing album (sea/palm couple, croissant
 * Eiffel, literary-trips group photo). Path ids are from those footer cards.
 */
const RELATED_STORY_PHOTO_IDENTITIES = new Set([
  '/media/photo/33/c9/52/3c/caption.jpg',
  '/media/photo/30/0f/25/01/caption.jpg',
  '/media/photo/2e/ca/54/84/caption.jpg',
])

function walkRecords(
  value: unknown,
  visit: (row: Record<string, unknown>) => void,
  depth = 0,
) {
  if (depth > 8) return
  const row = asRecord(value)
  if (row) {
    visit(row)
    for (const [key, nested] of Object.entries(row)) {
      if (isRelatedSectionKey(key, nested)) continue
      walkRecords(nested, visit, depth + 1)
    }
    return
  }
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 80)) walkRecords(item, visit, depth + 1)
  }
}

function photoFromRecord(row: Record<string, unknown>): string {
  const sizes = Array.isArray(row.sizes)
    ? (row.sizes as Array<{ width?: number; url?: string }>)
    : undefined
  const nestedSizes = asRecord(row.sizes)
  const dynamic = asRecord(row.photoSizeDynamic)
  const template =
    typeof row.urlTemplate === 'string'
      ? row.urlTemplate
      : typeof nestedSizes?.urlTemplate === 'string'
        ? nestedSizes.urlTemplate
        : typeof dynamic?.urlTemplate === 'string'
          ? dynamic.urlTemplate
          : undefined
  if (!sizes && !template) return ''
  return pickTripadvisorPhotoUrl(sizes, template)
}

function photoWidthFromUrl(url: string): number {
  const match = url.match(/[?&]w=(\d+)/i)
  return match ? Number(match[1]) : 0
}

function photoHeightFromUrl(url: string): number {
  const match = url.match(/[?&]h=(-?\d+)/i)
  const height = match ? Number(match[1]) : 0
  return height > 0 ? height : 0
}

function candidateFromPhotoUrl(url: string): TripadvisorGalleryPhotoCandidate | null {
  const resolved = tripadvisorPhotoUrl(url)
  if (!resolved || /\.(mp4|webm|mov)(?:$|\?)/i.test(resolved)) return null
  return {
    url: resolved,
    maxWidth: photoWidthFromUrl(resolved),
    maxHeight: photoHeightFromUrl(resolved),
    identity: tripadvisorPhotoIdentity(resolved),
  }
}

function formatTripadvisorAddress(value: unknown): string {
  if (typeof value === 'string') return value.replace(/<[^>]+>/g, '').trim()
  const row = asRecord(value)
  if (!row) return ''
  const cityLine = [textOf(row.postalCode), textOf(row.city)].filter(Boolean).join(' ')
  return [textOf(row.street) || textOf(row.address) || textOf(row.address_string), cityLine, textOf(row.country) || textOf(row.countryName)]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(', ')
}

function photoUrlFromUnknown(value: unknown): string {
  if (typeof value === 'string') return tripadvisorPhotoUrl(value)
  const row = asRecord(value)
  if (!row) return ''
  return (
    tripadvisorPhotoUrl(row.url) ||
    tripadvisorPhotoUrl(row.image) ||
    tripadvisorPhotoUrl(row.src) ||
    tripadvisorPhotoUrl(row.original) ||
    tripadvisorPhotoUrl(row.urlTemplate) ||
    tripadvisorPhotoUrl(row.photoUrl)
  )
}

function looksLikeTripadvisor34Listing(
  row: Record<string, unknown>,
  wrapperSuccess?: boolean,
): boolean {
  const success = row.success === true || wrapperSuccess === true
  if (success && (row.id || row.name || row.locationId)) return true
  const category = String(row.category || '').toUpperCase()
  return Boolean(
    (row.id || row.locationId) &&
      row.name &&
      /RESTAURANT|ATTRACTION/.test(category),
  )
}

/**
 * The listing record for this details payload — never a nested related place.
 * Tripadvisor34 sometimes wraps the listing in `data`.
 */
function tripadvisor34ListingRecord(
  payload: unknown,
): Record<string, unknown> | null {
  const root = asRecord(payload)
  if (!root) return null
  if (looksLikeTripadvisor34Listing(root)) return root
  const data = asRecord(root.data)
  if (data && looksLikeTripadvisor34Listing(data, root.success === true)) {
    return data
  }
  return null
}

function listingRecordWithTopLevelPhotos(
  payload: unknown,
): Record<string, unknown> | null {
  const listing = tripadvisor34ListingRecord(payload)
  if (listing) return listing
  const root = asRecord(payload)
  if (!root) return null
  if (root.image != null || Array.isArray(root.images)) return root
  const data = asRecord(root.data)
  if (data && (data.image != null || Array.isArray(data.images))) return data
  return null
}

function photoBelongsToListing(entry: unknown, contentId?: string): boolean {
  if (!contentId) return true
  const row = asRecord(entry)
  if (!row) return true
  const raw = String(row.locationId || row.contentId || row.location_id || '').trim()
  const id = raw.replace(/^d/i, '')
  if (!/^\d{5,}$/.test(id)) return true
  return id === contentId
}

function collectPhotoIdentities(value: unknown, into: Set<string>, depth = 0) {
  if (depth > 6) return
  if (typeof value === 'string') {
    if (/tripadvisor\.com\/media\/|dynamic-media-cdn\.tripadvisor/i.test(value)) {
      const url = tripadvisorPhotoUrl(value)
      if (url) into.add(tripadvisorPhotoIdentity(url))
    }
    return
  }
  const row = asRecord(value)
  if (row) {
    const url = photoUrlFromUnknown(row)
    if (url) into.add(tripadvisorPhotoIdentity(url))
    for (const nested of Object.values(row)) collectPhotoIdentities(nested, into, depth + 1)
    return
  }
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 80)) collectPhotoIdentities(item, into, depth + 1)
  }
}

/** Photo identities from Related Stories / nearby / highlight / tour shelves. */
function relatedPhotoIdentities(payload: unknown): Set<string> {
  const into = new Set<string>(RELATED_STORY_PHOTO_IDENTITIES)
  const harvest = (row: Record<string, unknown>) => {
    if (sectionHeadingLooksExcluded(row)) collectPhotoIdentities(row, into)
    for (const [key, nested] of Object.entries(row)) {
      if (!isRelatedSectionKey(key, nested)) continue
      collectPhotoIdentities(nested, into)
    }
  }
  walkRecords(payload, harvest)
  const listing = listingRecordWithTopLevelPhotos(payload)
  if (listing) harvest(listing)
  return into
}

function imageEntryLooksRelated(entry: unknown): boolean {
  const row = asRecord(entry)
  if (!row) return false
  const blob = [
    row.type,
    row.kind,
    row.source,
    row.section,
    row.album,
    row.caption,
    row.title,
    row.subtitle,
    row.category,
    row.label,
  ]
    .map((value) => textOf(value))
    .join(' ')
  return EXCLUDED_ENTRY_BLOB.test(blob)
}

function imageEntryLooksCommerce(entry: unknown): boolean {
  const row = asRecord(entry)
  if (!row) return false
  if (row.productId != null || row.offerId != null || row.fromPrice != null) return true
  if ((row.price != null || row.priceAmount != null) && (row.duration != null || row.durationString)) {
    return true
  }
  return false
}

function isExcludedGalleryPhoto(url: string, excluded: Set<string>): boolean {
  const identity = tripadvisorPhotoIdentity(url)
  return excluded.has(identity) || RELATED_STORY_PHOTO_IDENTITIES.has(identity)
}

function tripadvisor34PhotoUrls(payload: unknown, contentId?: string): string[] {
  const listing = listingRecordWithTopLevelPhotos(payload)
  if (!listing) return []
  const excluded = relatedPhotoIdentities(payload)
  const images = Array.isArray(listing.images) ? listing.images : []
  const groups: string[][] = []
  let current: string[] = []
  const flushGroup = () => {
    if (!current.length) return
    groups.push(current)
    current = []
  }
  for (const entry of images) {
    if (!photoBelongsToListing(entry, contentId)) continue
    if (imageEntryLooksRelated(entry) || imageEntryLooksCommerce(entry)) continue
    const url = photoUrlFromUnknown(entry)
    if (!url) continue
    const width = photoWidthFromUrl(url)
    if (width > 0 && width < MIN_GALLERY_WIDTH) {
      // Nearby / footer thumbs often sit before and after the listing album.
      flushGroup()
      continue
    }
    if (isExcludedGalleryPhoto(url, excluded)) continue
    current.push(url)
  }
  flushGroup()
  const album = groups.reduce(
    (best, group) => (group.length > best.length ? group : best),
    [] as string[],
  )
  const urls: string[] = []
  const cover = photoUrlFromUnknown(listing.image)
  if (cover && !isExcludedGalleryPhoto(cover, excluded)) urls.push(cover)
  urls.push(...album)
  const seen = new Set<string>()
  return urls.filter((url) => {
    const identity = tripadvisorPhotoIdentity(url)
    if (!url || seen.has(identity)) return false
    seen.add(identity)
    return true
  })
}

/** Listing hero only: top-level image/images, listing photo fields, or PoiHero. */
function listingLevelPhotos(payload: unknown, contentId?: string): string[] {
  const from34 = tripadvisor34PhotoUrls(payload, contentId)
  if (from34.length) return from34
  const root = asRecord(payload)
  const listing = asRecord(root?.data) || root
  const urls: string[] = []
  if (listing) {
    const direct = photoFromRecord(listing)
    if (direct) urls.push(direct)
    const nested = asRecord(listing.photo)
    if (nested) {
      const url = photoFromRecord(nested)
      if (url) urls.push(url)
    }
  }
  urls.push(...photosFromDetailsHero(payload))
  return urls
}

function labelsFromUnknown(value: unknown): string[] {
  if (typeof value === 'string') {
    return value
      .split(/[,;/|]/)
      .map((part) => part.trim())
      .filter(Boolean)
  }
  if (Array.isArray(value)) return value.flatMap(labelsFromUnknown)
  const row = asRecord(value)
  if (!row) return []
  const label =
    textOf(row.name) ||
    textOf(row.localizedName) ||
    textOf(row.label) ||
    textOf(row.title) ||
    textOf(row.value)
  return label ? [label] : []
}

function cuisineFromRecord(row: Record<string, unknown>): string | undefined {
  const labels = uniqueLabels([
    ...labelsFromUnknown(row.cuisines),
    ...labelsFromUnknown(row.cuisine),
    ...labelsFromUnknown(row.cuisineTypes),
    ...labelsFromUnknown(row.cuisinesList),
  ]).filter((label) => label && !/^restaurants?$/i.test(label))
  return labels.slice(0, 4).join(' · ') || undefined
}

function priceLevelFromRecord(row: Record<string, unknown>): string | undefined {
  const raw =
    textOf(row.priceLevel) ||
    textOf(row.priceRange) ||
    textOf(row.price) ||
    textOf(row.price_level) ||
    textOf(row.priceTag)
  return raw || undefined
}

function autocompleteRows(payload: unknown): unknown[] {
  const root = asRecord(payload)
  const data = asRecord(root?.data)
  if (Array.isArray(data?.items)) return data.items
  if (Array.isArray(root?.items)) return root.items
  if (Array.isArray(root?.data)) return root.data
  return []
}

function coordinatesFromRecord(row: Record<string, unknown>): Coordinates | undefined {
  const nested = asRecord(row.coordinates) || asRecord(row.geoPoint) || asRecord(row.location)
  const latitude =
    num(row.latitude) ?? num(nested?.latitude) ?? num(nested?.lat)
  const longitude =
    num(row.longitude) ?? num(nested?.longitude) ?? num(nested?.lng)
  if (latitude == null || longitude == null) return undefined
  return { lat: latitude, lng: longitude }
}

function tripadvisorPayloadFailed(payload: unknown): boolean {
  const root = asRecord(payload)
  if (!root) return true
  if (root.success === false) return true
  if (typeof root.message === 'string' && /too many requests/i.test(root.message)) {
    return true
  }
  return Array.isArray(root.errors) && root.errors.length > 0
}

function tripadvisorPlaceMissing(payload: unknown): boolean {
  const root = asRecord(payload)
  if (!root) return true
  if (root.success === false) return true
  if (typeof root.message === 'string' && /not found|locationnotfound/i.test(root.message)) {
    return true
  }
  const data = asRecord(root.data) || root
  const sections = Array.isArray(data?.sections) ? data.sections : []
  return sections.some((section) => {
    const row = asRecord(section)
    const type = `${row?.__typename || ''} ${row?.stableDiffingType || ''}`
    return /LocationNotFound|ErrorMessage/i.test(type)
  })
}

function photosFromDetailsHero(payload: unknown): string[] {
  const root = asRecord(payload)
  const data = asRecord(root?.data) || root
  const sections = Array.isArray(data?.sections) ? data.sections : []
  const photos: string[] = []
  for (const section of sections) {
    const row = asRecord(section)
    if (!String(row?.__typename || '').includes('PoiHero')) continue
    walkRecords(section, (nested) => {
      const photo = photoFromRecord(nested)
      if (photo) photos.push(photo)
    })
    break
  }
  return uniquePhotos(photos)
}

function coverOnlyGallery(match: TripadvisorCatalogItem): TripadvisorPlaceGallery | null {
  if (!match.coverUrl) return null
  return {
    contentId: match.contentId,
    kind: match.kind,
    name: match.name,
    photos: [match.coverUrl],
  }
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
  const pinned = coverUrl ? [coverUrl] : []
  const fromDetails = tripadvisor34PhotoUrls(payload, contentId)
    .map((url) => candidateFromPhotoUrl(url))
    .filter((candidate): candidate is TripadvisorGalleryPhotoCandidate => Boolean(candidate))
  if (fromDetails.length) {
    return {
      contentId,
      kind,
      name,
      photos: selectBestTripadvisorGalleryPhotos(fromDetails, MAX_GALLERY_PHOTOS, pinned),
    }
  }
  const root = asRecord(payload)
  const data = asRecord(root?.data) || root
  const sections = Array.isArray(data?.sections) ? data.sections : []
  const candidates: TripadvisorGalleryPhotoCandidate[] = []
  for (const section of sections) {
    const row = asRecord(section)
    const type = `${row?.__typename || ''} ${row?.stableDiffingType || ''} ${row?.type || ''}`
    if (/Nearby|Related|Similar|Carousel|AlsoViewed|RecentlyViewed|Stories|Article|Editorial|Recommended|Highlight|MustSee|HistoricalTour|SkipTheLine|Ticket|Experience|AudioGuide|Segway|TourProduct/i.test(type)) {
      continue
    }
    const mediaList = row?.mediaList
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
    photos: selectBestTripadvisorGalleryPhotos(candidates, MAX_GALLERY_PHOTOS, pinned),
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
  const ingest = (row: Record<string, unknown>) => {
    const tracking = asRecord(row.trackingItems)
    if (
      String(row.kind || '').toLowerCase() === 'rescue' ||
      String(row.id || '').toUpperCase() === 'RESCUE' ||
      String(tracking?.dataType || row.dataType || '').toLowerCase() === 'rescue' ||
      String(tracking?.dataType || '').toLowerCase() === 'add_a_place'
    ) {
      return
    }
    const contentId = String(
      row.locationId ||
        tripadvisorContentIdFromCandidate(String(row.id || '')) ||
        row.contentId ||
        tracking?.locationId ||
        tracking?.documentId ||
        asRecord(asRecord(row.route)?.params)?.contentId ||
        asRecord(asRecord(row.route)?.params)?.locationId ||
        asRecord(asRecord(asRecord(row.cardLink)?.route)?.params)?.contentId ||
        '',
    ).trim()
    if (!/^\d{5,}$/.test(contentId) || seen.has(contentId)) return
    const dataType = String(tracking?.dataType || row.dataType || '').toLowerCase()
    if (dataType === 'rescue' || dataType === 'add_a_place') return
    const typeBlob = `${row.type || ''} ${row.placeType || ''} ${tracking?.placeType || ''} ${row.category || ''}`.toLowerCase()
    if (typeBlob && !typePattern.test(typeBlob)) return
    const locationLabel =
      textOf(row.description) ||
      textOf(row.secondaryTextLineOne) ||
      formatTripadvisorAddress(row.address)
    if (kind === 'restaurant' && locationLabel && !restaurantLocationAllowed(locationLabel)) {
      return
    }
    const name = stripRankPrefix(
      textOf(row.localizedName) ||
        textOf(row.heading) ||
        textOf(tracking?.text) ||
        textOf(row.title) ||
        textOf(row.cardTitle) ||
        textOf(row.name) ||
        textOf(row.text),
    )
    if (!name) return
    const graphic = asRecord(row.graphic)
    const photo = asRecord(graphic?.image) || asRecord(row.cardPhoto)
    const sizes = asRecord(photo?.sizes)
    const coverUrl =
      (typeof row.image === 'string' ? tripadvisorPhotoUrl(row.image) : '') ||
      pickTripadvisorPhotoUrl(
        Array.isArray(photo?.sizes)
          ? (photo?.sizes as Array<{ width?: number; url?: string }>)
          : undefined,
        typeof sizes?.urlTemplate === 'string' ? sizes.urlTemplate : undefined,
      ) ||
      undefined
    const listingUrl = httpUrl(textOf(row.url) || textOf(row.webUrl))
    const location = coordinatesFromRecord(row)
    seen.add(contentId)
    items.push({
      contentId,
      name,
      kind,
      ...(coverUrl ? { coverUrl } : {}),
      ...(listingUrl ? { listingUrl } : {}),
      ...(location ? { location } : {}),
    })
  }
  const rows = autocompleteRows(payload)
  if (rows.length) {
    for (const raw of rows) {
      const row = asRecord(raw)
      if (row) ingest(row)
    }
    if (items.length) return items
  }
  walkRecords(payload, ingest)
  return items
}

function parseTripadvisor34Details(
  payload: unknown,
  contentId: string,
): TripadvisorAttractionInfo | null {
  const listing = tripadvisor34ListingRecord(payload)
  if (!listing) return null
  const photos = uniquePhotos(
    selectBestTripadvisorGalleryPhotos(
      tripadvisor34PhotoUrls(listing, contentId)
        .map((url) => candidateFromPhotoUrl(url))
        .filter((candidate): candidate is TripadvisorGalleryPhotoCandidate => Boolean(candidate)),
    ),
  )
  return {
    contentId,
    name: stripRankPrefix(textOf(listing.name)) || contentId,
    description: textOf(listing.description) || textOf(listing.about) || undefined,
    rating: num(listing.rating) ?? num(listing.averageRating),
    userRatingCount:
      num(listing.reviewCount) ??
      num(listing.numberOfReviews) ??
      num(listing.numberReviews),
    address:
      formatTripadvisorAddress(listing.address) ||
      formatTripadvisorAddress(listing.addressObj) ||
      formatTripadvisorAddress(listing.address_obj) ||
      undefined,
    website: officialWebsiteFromRecord(listing) || undefined,
    phone: phoneFromRecord(listing) || undefined,
    priceLevel: priceLevelFromRecord(listing),
    cuisine: cuisineFromRecord(listing),
    location: coordinatesFromRecord(listing),
    photos,
    reviews: normalizeTripadvisorReviews(listing),
  }
}

export function normalizeTripadvisorAttractionDetails(
  payload: unknown,
  contentId: string,
): TripadvisorAttractionInfo {
  const parsed = parseTripadvisor34Details(payload, contentId)
  if (parsed) return parsed
  let name = ''
  let description = ''
  let rating: number | undefined
  let userRatingCount: number | undefined
  let address = ''
  let website = ''
  let phone = ''
  let priceLevel = ''
  let cuisine = ''
  let latitude: number | undefined
  let longitude: number | undefined

  walkRecords(payload, (row) => {
    if (!name) {
      name =
        textOf(row.localizedName) ||
        textOf(row.navTitle) ||
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
      num(row.numberReviews) ??
      num(row.numberOfReviews) ??
      num(row.reviewCount) ??
      num(row.num_reviews) ??
      num(row.userRatingCount)
    if (!address) {
      address =
        formatTripadvisorAddress(row.address) ||
        textOf(row.address) ||
        textOf(asRecord(row.address)?.address) ||
        textOf(asRecord(row.address)?.address_string) ||
        textOf(row.addressString)
    }
    const linkType = contactLinkType(row)
    const external = contactExternalUrl(row)
    if (!website && (linkType === 'WEBSITE' || /server_website/i.test(String(asRecord(row.link)?.trackingContext || '')))) {
      const url = httpUrl(external)
      if (url && !/tripadvisor\.|google\.|rapidapi\.|facebook\.|instagram\./i.test(url)) {
        website = url
      }
    }
    if (!website) website = officialWebsiteFromRecord(row)
    if (!phone && linkType === 'PHONE') phone = phoneFromTelUrl(external)
    if (!phone) phone = phoneFromRecord(row)
    if (!priceLevel) priceLevel = priceLevelFromRecord(row) || ''
    if (!cuisine) cuisine = cuisineFromRecord(row) || ''
    const coords = coordinatesFromRecord(row)
    latitude = latitude ?? coords?.lat ?? num(row.latitude)
    longitude = longitude ?? coords?.lng ?? num(row.longitude)
  })

  return {
    contentId,
    name: stripRankPrefix(name) || contentId,
    description: description || undefined,
    rating,
    userRatingCount,
    address: address || undefined,
    website: website || undefined,
    phone: phone || undefined,
    priceLevel: priceLevel || undefined,
    cuisine: cuisine || undefined,
    location:
      latitude != null && longitude != null
        ? { lat: latitude, lng: longitude }
        : undefined,
    photos: uniquePhotos(listingLevelPhotos(payload, contentId)),
    reviews: [],
  }
}

export function normalizeTripadvisorReviews(payload: unknown): GoogleReview[] {
  const reviews: GoogleReview[] = []
  const seen = new Set<string>()
  walkRecords(payload, (row) => {
    const typeName = String(row.__typename || row.type || '').toLowerCase()
    if (
      typeName.includes('photo') ||
      typeName.includes('video') ||
      typeName.includes('media') ||
      typeName.includes('ownerresponse') ||
      typeName.includes('gaisummary') ||
      typeName.includes('gai_reviews')
    ) {
      return
    }
    const body =
      textOf(row.htmlText) ||
      textOf(row.review) ||
      textOf(row.reviewText) ||
      textOf(asRecord(row.text)?.htmlString) ||
      textOf(row.htmlString) ||
      textOf(row.text)
    if (body.length < 24) return
    const rating =
      num(row.rating) ??
      num(asRecord(row.bubbleRating)?.rating) ??
      num(row.score)
    const titleRaw = textOf(row.htmlTitle) || textOf(row.title) || textOf(row.reviewTitle)
    const title = titleRaw.length >= 8 && /\s/.test(titleRaw) ? titleRaw : titleRaw.length >= 12 ? titleRaw : ''
    const looksReview =
      typeName.includes('review') ||
      (rating != null && rating >= 1 && rating <= 5) ||
      Boolean(title && body.length >= 40)
    if (!looksReview) return
    const identity = body.slice(0, 96)
    if (seen.has(identity)) return
    seen.add(identity)
    const user = asRecord(row.user) || asRecord(row.author) || asRecord(row.userProfile)
    reviews.push({
      text: title && !body.startsWith(title) ? `${title}\n${body}` : body,
      rating: rating != null && rating >= 1 && rating <= 5 ? rating : undefined,
      author:
        textOf(user?.displayName) ||
        textOf(user?.username) ||
        textOf(user?.name) ||
        textOf(row.userDisplayName) ||
        textOf(row.displayName) ||
        textOf(row.userUsername) ||
        textOf(row.username) ||
        undefined,
      relativeTime:
        textOf(row.publishedDate) ||
        textOf(row.published_date) ||
        textOf(row.relativePublishedDate) ||
        textOf(row.createdDate) ||
        undefined,
    })
  })
  return reviews.slice(0, MAX_REVIEWS)
}

function galleryFromDetailsPayload(
  payload: unknown,
  match: TripadvisorCatalogItem,
): TripadvisorPlaceGallery {
  const gallery = normalizeTripadvisorGallery(
    payload,
    match.kind,
    match.contentId,
    match.name,
    match.coverUrl,
  )
  if (gallery.photos.length) return gallery
  const info = normalizeTripadvisorAttractionDetails(payload, match.contentId)
  return {
    contentId: match.contentId,
    kind: match.kind,
    name: info.name || match.name,
    photos: uniquePhotos([
      ...(match.coverUrl ? [match.coverUrl] : []),
      ...info.photos,
    ]),
  }
}

function rememberDetailsFromPayload(
  payload: unknown,
  match: TripadvisorCatalogItem,
) {
  const info = normalizeTripadvisorAttractionDetails(payload, match.contentId)
  const gallery = galleryFromDetailsPayload(payload, match)
  const photos = uniquePhotos([
    ...(match.coverUrl ? [match.coverUrl] : []),
    ...gallery.photos,
    ...info.photos,
  ])
  if (photos.length || info.address || info.rating != null || info.reviews.length) {
    storeDetails({
      ...info,
      name: info.name || match.name,
      location: info.location || match.location,
      photos,
    })
  }
  if (photos.length) {
    storeGallery({
      contentId: match.contentId,
      kind: match.kind,
      name: info.name || match.name,
      photos,
    })
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
  const queries = [name, nameLocal, placeLatinLabel(name, nameLocal)]
    .map((value) => value?.trim() || '')
    .filter(Boolean)
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
  const query = new URLSearchParams({ rest })
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value)
  }
  try {
    const response = await authFetch(`/api/tripadvisor?${query}`, {
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!response.ok) {
      refundTripadvisorRequest(kind)
      const message = await response.text().catch(() => '')
      throw new Error(
        `Tripadvisor request failed (${response.status})${message ? `: ${message}` : ''}`,
      )
    }
    return await (response.json() as Promise<unknown>)
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !error.message.startsWith('Tripadvisor request failed')
    ) {
      refundTripadvisorRequest(kind)
    }
    throw error
  }
}

function mergeSeededAttractions(items: TripadvisorCatalogItem[]): TripadvisorCatalogItem[] {
  const byId = new Map(items.map((item) => [item.contentId, item]))
  for (const seed of SEEDED_ATTRACTIONS) {
    const current = byId.get(seed.contentId)
    if (!current) {
      byId.set(seed.contentId, { ...seed })
      continue
    }
    byId.set(seed.contentId, {
      ...current,
      coverUrl: current.coverUrl || seed.coverUrl,
      listingUrl: current.listingUrl || seed.listingUrl,
    })
  }
  return [...byId.values()]
}

function mergeSeededRestaurants(items: TripadvisorCatalogItem[]): TripadvisorCatalogItem[] {
  const byId = new Map(items.map((item) => [item.contentId, item]))
  for (const seed of SEEDED_RESTAURANTS) {
    const current = byId.get(seed.contentId)
    if (!current) {
      byId.set(seed.contentId, { ...seed })
      continue
    }
    const aliases = uniqueLabels([...(current.aliases || []), ...(seed.aliases || [])])
    byId.set(seed.contentId, {
      ...current,
      coverUrl: current.coverUrl || seed.coverUrl,
      listingUrl: current.listingUrl || seed.listingUrl,
      aliases: aliases.length ? aliases : current.aliases,
    })
  }
  return [...byId.values()]
}

function isParisTripCity(): boolean {
  return tripCityFromDestination().tripadvisorGeoId === '187147'
}

function readCatalog(kind: TripadvisorGalleryKind): TripadvisorCatalogItem[] {
  const key = catalogKey(kind)
  const memory = catalogMemory.get(key)
  if (memory?.length) {
    if (kind === 'attraction' && isParisTripCity()) {
      const merged = mergeSeededAttractions(memory)
      if (merged.length !== memory.length) catalogMemory.set(key, merged)
      return merged
    }
    if (kind === 'restaurant' && isParisTripCity()) {
      const merged = mergeSeededRestaurants(memory)
      if (merged.length !== memory.length) catalogMemory.set(key, merged)
      return merged
    }
    return memory
  }
  const stored = getLlmArtifact<TripadvisorCatalogItem[]>(key)
  if (Array.isArray(stored) && stored.length) {
    const next =
      kind === 'attraction' && isParisTripCity()
        ? mergeSeededAttractions(stored)
        : kind === 'restaurant' && isParisTripCity()
          ? mergeSeededRestaurants(stored)
          : stored
    catalogMemory.set(key, next)
    return next
  }
  if (kind === 'attraction' && isParisTripCity()) {
    const seeded = SEEDED_ATTRACTIONS.map((item) => ({ ...item }))
    catalogMemory.set(key, seeded)
    return seeded
  }
  if (kind === 'restaurant' && isParisTripCity()) {
    const seeded = SEEDED_RESTAURANTS.map((item) => ({ ...item }))
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
    const listingUrl = existing.listingUrl || item.listingUrl
    const coverUrl = existing.coverUrl || item.coverUrl
    if (
      merged.length === (existing.aliases || []).length &&
      listingUrl === existing.listingUrl &&
      coverUrl === existing.coverUrl
    ) {
      return
    }
    const next = [...current]
    next[index] = {
      ...existing,
      aliases: merged.length ? merged : existing.aliases,
      listingUrl,
      coverUrl,
    }
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
    if (contentId === 'miss') continue
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
    const details = readDetails(match.contentId)
    if (details?.photos.length) return details.photos
    const gallery = readGallery(kind, match.contentId)
    if (gallery?.photos.length) return gallery.photos
    return match.coverUrl ? [match.coverUrl] : []
  }
  return []
}

function placeInfoFromParts(
  match: TripadvisorCatalogItem,
  details: TripadvisorAttractionInfo | null,
  gallery: TripadvisorPlaceGallery | null,
): TripadvisorAttractionInfo {
  const photos = uniquePhotos([
    ...(match.coverUrl ? [match.coverUrl] : []),
    ...(gallery?.photos || []),
    ...(details?.photos || []),
  ])
  return {
    contentId: match.contentId,
    name: details?.name || match.name,
    description: details?.description,
    rating: details?.rating,
    userRatingCount: details?.userRatingCount,
    address: details?.address,
    website: details?.website,
    phone: details?.phone,
    priceLevel: details?.priceLevel,
    cuisine: details?.cuisine,
    location: details?.location || match.location,
    photos,
    reviews: details?.reviews || [],
  }
}

export function peekTripadvisorAttractionInfo(
  name: string,
  nameLocal?: string,
  contentId?: string,
): TripadvisorAttractionInfo | null {
  return peekTripadvisorPlaceInfo('attraction', name, nameLocal, contentId)
}

export function peekTripadvisorRestaurantInfo(
  name: string,
  nameLocal?: string,
  contentId?: string,
): TripadvisorAttractionInfo | null {
  return peekTripadvisorPlaceInfo('restaurant', name, nameLocal, contentId)
}

function peekTripadvisorPlaceInfo(
  kind: TripadvisorGalleryKind,
  name: string,
  nameLocal?: string,
  contentId?: string,
): TripadvisorAttractionInfo | null {
  const catalog = readCatalog(kind)
  const match = findCatalogItem(catalog, { name, nameLocal, contentId })
  if (!match) return null
  const details = readDetails(match.contentId)
  const gallery = readGallery(kind, match.contentId)
  if (!details && !gallery?.photos.length && !match.coverUrl && !match.location) return null
  return placeInfoFromParts(match, details, gallery)
}

export function hasCachedTripadvisorGallery(
  contentId?: string,
  kind: TripadvisorGalleryKind = 'attraction',
): boolean {
  if (!contentId) return false
  return Boolean(readGallery(kind, contentId)?.photos.length)
}

/** Cover / autocomplete photos are not restaurant details. */
export function hasSettledTripadvisorRestaurantDetails(
  info: TripadvisorAttractionInfo | null | undefined,
): boolean {
  return Boolean(
    info &&
      (info.rating != null ||
        info.address ||
        info.reviews.length > 0 ||
        info.priceLevel ||
        info.cuisine),
  )
}

/** True only when the current details prefix has settled listing facts. */
export function hasCachedTripadvisorRestaurantDetails(contentId?: string): boolean {
  if (!contentId) return false
  return hasSettledTripadvisorRestaurantDetails(readDetails(contentId))
}

function galleryLooksCoverOnly(match: TripadvisorCatalogItem): boolean {
  const gallery = readGallery(match.kind, match.contentId)
  const photos = gallery?.photos || []
  if (photos.length > 1) return false
  if (!photos.length) return true
  const cover = match.coverUrl ? tripadvisorPhotoUrl(match.coverUrl) : ''
  if (!cover) return false
  return tripadvisorPhotoIdentity(photos[0]) === tripadvisorPhotoIdentity(cover)
}

function hasFetchedTripadvisorDetails(match: TripadvisorCatalogItem): boolean {
  if (hasSettledTripadvisorRestaurantDetails(readDetails(match.contentId))) return true
  const gallery = readGallery(match.kind, match.contentId)
  if (!gallery?.photos.length) return false
  return !galleryLooksCoverOnly(match)
}

async function loadGalleryFor(
  match: TripadvisorCatalogItem,
): Promise<TripadvisorPlaceGallery | null> {
  const cached = readGallery(match.kind, match.contentId)
  if (cached?.photos.length && hasFetchedTripadvisorDetails(match)) {
    return cached
  }
  const inflightKey = galleryKey(match.kind, match.contentId)
  const pending = galleryInflight.get(inflightKey)
  if (pending) return pending

  const task = (async () => {
    try {
      const listingUrl = resolvedListingUrl(
        match.kind,
        match.contentId,
        match.listingUrl,
      )
      if (match.kind === 'restaurant' && !isTripadvisorListingUrl(listingUrl)) {
        return coverOnlyGallery(match)
      }
      const payload = await requestTripadvisor(
        'details',
        tripadvisorDetailPath(match.kind),
        tripadvisorDetailParams(match.kind, match.contentId, listingUrl),
        45_000,
      )
      if (!payload || tripadvisorPayloadFailed(payload) || tripadvisorPlaceMissing(payload)) {
        return coverOnlyGallery(match)
      }
      rememberDetailsFromPayload(payload, {
        ...match,
        listingUrl: listingUrl || match.listingUrl,
      })
      const gallery = readGallery(match.kind, match.contentId)
      if (gallery?.photos.length) return gallery
      const fromDetails = galleryFromDetailsPayload(payload, match)
      if (fromDetails.photos.length) {
        storeGallery(fromDetails)
        return fromDetails
      }
    } catch {
      /* details timeouts/5xx must not hide the autocomplete cover */
    }
    return coverOnlyGallery(match)
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
  address?: string
}): Promise<TripadvisorPlaceGallery | null> {
  const kind = galleryKindForPlaceType(input.type)
  if (!kind || (!input.name.trim() && !input.contentId)) return null
  const catalog = readCatalog(kind)
  const remembered = readMatchLookup(kind, input)
  const cachedMatch =
    findCatalogItem(catalog, {
      name: input.name,
      nameLocal: input.nameLocal,
      contentId: input.contentId,
    }) ||
    (remembered && remembered !== 'miss'
      ? catalog.find((item) => item.contentId === remembered) || {
          contentId: remembered,
          name: input.name,
          kind,
        }
      : null)
  if (cachedMatch) {
    return loadGalleryFor(cachedMatch)
  }
  if (remembered === 'miss') return null
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
          address: input.address,
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
  const payload = await requestTripadvisor('auto-complete', TA_AUTOCOMPLETE, {
    location: query,
    limit: '10',
    locale: TA_AUTOCOMPLETE_LOCALE,
  })
  if (!payload || tripadvisorPayloadFailed(payload)) return []
  return normalizeTripadvisorAutocomplete(payload, kind)
}

/** Search Tripadvisor with the original local name, never a translation. */
export function tripadvisorAutocompleteQuery(
  name: string,
  nameLocal?: string,
  _kind: TripadvisorGalleryKind = 'attraction',
  cityName?: string,
): string {
  const city = cityName?.trim() || tripCityFromDestination().nameEn
  const core = placeLatinLabel(name, nameLocal)
  if (!core) return ''
  return appendCityToQuery(core, city)
}

function searchIsLatin(name: string, nameLocal?: string): boolean {
  return /[a-z]/i.test(placeLatinLabel(name, nameLocal))
}

function listingMatchesRestaurant(
  listingName: string | undefined,
  input: { name: string; nameLocal?: string },
): boolean {
  if (!listingName?.trim()) return false
  const latin = placeLatinLabel(input.name, input.nameLocal)
  const score = Math.max(
    placeIdentitySimilarity(input.name, listingName),
    input.nameLocal ? placeIdentitySimilarity(input.nameLocal, listingName) : 0,
    latin ? placeIdentitySimilarity(latin, listingName) : 0,
  )
  return score >= PLACE_NAME_MATCH_MIN
}

async function verifyRestaurantContentId(
  contentId: string,
  input: { name: string; nameLocal?: string },
  listingUrl?: string,
): Promise<TripadvisorCatalogItem | null> {
  if (!isTripadvisorListingUrl(listingUrl)) return null
  const details = await requestTripadvisor(
    'details',
    TA_RESTAURANT_DETAIL,
    tripadvisorDetailParams('restaurant', contentId, listingUrl),
    45_000,
  )
  if (!details || tripadvisorPayloadFailed(details) || tripadvisorPlaceMissing(details)) {
    return null
  }
  const info = normalizeTripadvisorAttractionDetails(details, contentId)
  if (!listingMatchesRestaurant(info.name, input)) return null
  const match: TripadvisorCatalogItem = {
    contentId,
    name: info.name,
    kind: 'restaurant',
    location: info.location,
    coverUrl: info.photos[0],
    listingUrl,
  }
  rememberDetailsFromPayload(details, match)
  return match
}

/** Last-resort restaurant match: catalog / contentId, else autocomplete, else listing URL. */
async function resolveRestaurantMatch(input: {
  name: string
  nameLocal?: string
  contentId?: string
  address?: string
}): Promise<TripadvisorCatalogItem | null> {
  const catalog = await loadCatalog('restaurant')
  const existing = findCatalogItem(catalog, input)
  if (existing) {
    rememberCatalogItem(existing, [input.name, input.nameLocal])
    rememberMatchLookup('restaurant', input, existing.contentId)
    return existing
  }
  const lookup = readMatchLookup('restaurant', input)
  if (lookup === 'miss') return null
  if (lookup) {
    const byId = catalog.find((item) => item.contentId === lookup)
    if (byId) return byId
  }
  if (input.contentId) {
    const verified = await verifyRestaurantContentId(input.contentId, input)
    if (verified) {
      rememberCatalogItem(verified, [input.name, input.nameLocal])
      rememberMatchLookup('restaurant', input, verified.contentId)
      return verified
    }
  }

  const hits = await autocompleteHits(input.name, input.nameLocal, 'restaurant')
  const match = matchTripadvisorCatalogItem(hits, input.name, input.nameLocal)
  if (match) {
    rememberCatalogItem(match, [input.name, input.nameLocal])
    rememberMatchLookup('restaurant', input, match.contentId)
    return match
  }

  const city = tripCityFromDestination()
  const listing = await resolveTripadvisorRestaurantListing({
    name: input.name,
    nameLocal: input.nameLocal,
    address: input.address,
    city: city.nameEn,
  }).catch(() => null)
  const contentId = tripadvisorContentIdFromUrl(listing?.url)
  if (
    contentId &&
    isTripadvisorListingUrl(listing?.url) &&
    (!listing?.name || listingMatchesRestaurant(listing.name, input))
  ) {
    const verified = await verifyRestaurantContentId(contentId, input, listing?.url)
    if (verified) {
      rememberCatalogItem(verified, [input.name, input.nameLocal])
      rememberMatchLookup('restaurant', input, verified.contentId)
      return verified
    }
  }

  rememberMatchLookup('restaurant', input, 'miss')
  return null
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
    const retrySearch = placeLatinLabel(canonical.nameEn, canonical.nameFr)
    const firstSearch = placeLatinLabel(input.name, input.nameLocal)
    if (retrySearch && retrySearch !== firstSearch) {
      hits = await autocompleteHits(
        canonical.nameFr || canonical.nameEn,
        canonical.nameFr,
        'attraction',
      )
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
  if (
    peeked?.photos.length &&
    peeked.reviews.length &&
    hasCachedTripadvisorGallery(peeked.contentId)
  ) {
    return peeked
  }

  const inflightKey = `${input.contentId || ''}:${input.name}:${input.nameLocal || ''}`
  const pending = infoInflight.get(inflightKey)
  if (pending) return pending

  const task = (async () => {
    const match = await resolveAttractionMatch(input)
    if (!match) return null

    const gallery = await loadGalleryFor(match)
    const details = await loadReviewsIfMissing(match, readDetails(match.contentId))
    const info = placeInfoFromParts(match, details, gallery)
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

function reviewsFromTripadvisorPayload(payload: unknown): GoogleReview[] {
  if (!payload || tripadvisorPayloadFailed(payload)) return []
  return normalizeTripadvisorReviews(payload)
}

async function requestTripadvisorReviewsPayload(
  path: string,
  params: Record<string, string>,
  kind: TripadvisorRequestKind = 'reviews',
): Promise<GoogleReview[]> {
  try {
    return reviewsFromTripadvisorPayload(await requestTripadvisor(kind, path, params))
  } catch (error) {
    if (!isTripadvisorRateLimited(error)) return []
    await new Promise((resolve) => setTimeout(resolve, 700))
    try {
      return reviewsFromTripadvisorPayload(await requestTripadvisor(kind, path, params))
    } catch {
      return []
    }
  }
}

async function fetchTripadvisorReviewList(
  match: TripadvisorCatalogItem,
): Promise<GoogleReview[]> {
  const reviewParams = tripadvisorReviewParams(match.kind, match.contentId, match.listingUrl)
  if (!reviewParams.url && !reviewParams.locationId) return []
  // things-to-do/reviews returns `{ count: 0 }` for attractions. The same
  // listing's traveler reviews come from restaurants/reviews. Hitting both
  // in a burst also 429s the working endpoint.
  const fromReviews = await requestTripadvisorReviewsPayload(
    TA_RESTAURANT_REVIEWS,
    reviewParams,
  )
  if (fromReviews.length || match.kind !== 'attraction') return fromReviews
  const detailParams = tripadvisorDetailParams(
    'restaurant',
    match.contentId,
    match.listingUrl,
  )
  if (!detailParams.url) return []
  return requestTripadvisorReviewsPayload(TA_RESTAURANT_DETAIL, detailParams, 'details')
}

async function loadReviewsIfMissing(
  match: TripadvisorCatalogItem,
  details: TripadvisorAttractionInfo | null,
): Promise<TripadvisorAttractionInfo | null> {
  if (details?.reviews.length) return details
  if (!details && match.kind !== 'attraction') return details
  try {
    const reviews = await fetchTripadvisorReviewList(match)
    if (!reviews.length) return details
    const next = details
      ? { ...details, reviews }
      : {
          contentId: match.contentId,
          name: match.name,
          location: match.location,
          photos: match.coverUrl ? [match.coverUrl] : [],
          reviews,
        }
    storeDetails(next)
    return next
  } catch {
    return details
  }
}

async function enrichRestaurantInfo(
  match: TripadvisorCatalogItem,
  onUpdate?: (info: TripadvisorAttractionInfo) => void,
): Promise<TripadvisorAttractionInfo | null> {
  const gallery = await loadGalleryFor(match)
  let details = readDetails(match.contentId)
  const first = placeInfoFromParts(match, details, gallery)
  if (first.photos.length || first.address || first.rating != null || first.cuisine) {
    onUpdate?.(first)
  }
  details = await loadReviewsIfMissing(match, details)
  const info = placeInfoFromParts(match, details, gallery)
  if (hasSettledTripadvisorRestaurantDetails(info) || (info.photos.length > 1 && readDetails(match.contentId))) {
    storeDetails(info)
    return info
  }
  return first.photos.length ? first : null
}

export async function fetchTripadvisorRestaurantInfo(input: {
  name: string
  nameLocal?: string
  contentId?: string
  address?: string
  onPreview?: (info: TripadvisorAttractionInfo) => void
  onDetails?: (info: TripadvisorAttractionInfo | null) => void
}): Promise<TripadvisorAttractionInfo | null> {
  if (!input.name.trim() && !input.contentId) return null
  const peeked = peekTripadvisorRestaurantInfo(input.name, input.nameLocal, input.contentId)
  if (hasCachedTripadvisorRestaurantDetails(peeked?.contentId)) {
    input.onDetails?.(peeked)
    return peeked
  }

  const inflightKey = `restaurant:${input.contentId || ''}:${tripadvisorAutocompleteQuery(input.name, input.nameLocal, 'restaurant')}`
  const pending = infoInflight.get(inflightKey)
  if (pending) {
    if (peeked?.photos.length) input.onPreview?.(peeked)
    void pending.then((info) => {
      if (info) input.onPreview?.(info)
      input.onDetails?.(info)
    })
    return pending
  }

  let resolveFull!: (info: TripadvisorAttractionInfo | null) => void
  const fullPromise = new Promise<TripadvisorAttractionInfo | null>((resolve) => {
    resolveFull = resolve
  })
  infoInflight.set(inflightKey, fullPromise)

  const task = (async () => {
    try {
      const match = await resolveRestaurantMatch(input)
      if (!match) {
        input.onDetails?.(null)
        resolveFull(null)
        return null
      }
      const preview = placeInfoFromParts(
        match,
        readDetails(match.contentId),
        readGallery(match.kind, match.contentId) || coverOnlyGallery(match),
      )
      const hasPreview =
        preview.photos.length > 0 || Boolean(preview.address) || preview.reviews.length > 0

      if (input.onPreview && hasPreview) {
        input.onPreview(preview)
        void enrichRestaurantInfo(match, input.onPreview)
          .then((info) => {
            if (info) input.onPreview?.(info)
            input.onDetails?.(info)
            resolveFull(info || preview)
          })
          .catch(() => {
            input.onDetails?.(null)
            resolveFull(preview)
          })
        return preview
      }

      const info = await enrichRestaurantInfo(match, input.onPreview)
      input.onDetails?.(info)
      resolveFull(info)
      return info
    } catch (error) {
      input.onDetails?.(null)
      resolveFull(null)
      throw error
    }
  })()

  try {
    return await task
  } finally {
    void fullPromise.finally(() => {
      if (infoInflight.get(inflightKey) === fullPromise) infoInflight.delete(inflightKey)
    })
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
