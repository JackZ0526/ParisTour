import type { Coordinates } from '../../../types'
import {
  getLlmArtifact,
  setLlmArtifact,
} from '../../../shared/services/llm/llmArtifactStore'
import {
  placeIdentitySimilarity,
  PLACE_NAME_MATCH_MIN,
} from '../../../shared/utils/placeTitle'

export interface WikimediaPlacePhoto {
  url: string
  sourcePage: string
  fileTitle: string
  attribution?: string
  license?: string
  licenseUrl?: string
  wikidataId: string
  query: string
}

type CachedPhoto =
  | { status: 'found'; photo: WikimediaPlacePhoto }
  | { status: 'missing' }

interface WikidataSearchItem {
  id?: string
  label?: string
}

interface WikidataEntity {
  id?: string
  labels?: Record<string, { value?: string }>
  claims?: {
    P18?: Array<{ mainsnak?: { datavalue?: { value?: unknown } } }>
    P625?: Array<{ mainsnak?: { datavalue?: { value?: unknown } } }>
  }
}

interface CommonsImageInfo {
  thumburl?: string
  url?: string
  descriptionurl?: string
  extmetadata?: Record<string, { value?: string }>
}

const ARTIFACT_PREFIX = 'wikimedia-place-photo:v3:'
const MAX_MATCH_DISTANCE_METERS = 2_500
const memory = new Map<string, WikimediaPlacePhoto | null>()
const inflight = new Map<string, Promise<WikimediaPlacePhoto | null>>()

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, ' ')
}

function cacheKey(name: string, location: Coordinates): string {
  return `${ARTIFACT_PREFIX}${normalize(name)}|${location.lat.toFixed(4)},${location.lng.toFixed(4)}`
}

function coordinateValue(entity: WikidataEntity): Coordinates | null {
  const raw = entity.claims?.P625?.[0]?.mainsnak?.datavalue?.value
  if (!raw || typeof raw !== 'object') return null
  const value = raw as { latitude?: unknown; longitude?: unknown }
  const lat = Number(value.latitude)
  const lng = Number(value.longitude)
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null
}

function imageValue(entity: WikidataEntity): string | null {
  const raw = entity.claims?.P18?.[0]?.mainsnak?.datavalue?.value
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null
}

function haversineMeters(a: Coordinates, b: Coordinates): number {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h))
}

function stripHtml(value?: string): string | undefined {
  const text = value
    ?.replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
  return text || undefined
}

function secureUrl(value?: string): string | undefined {
  if (!value) return undefined
  if (value.startsWith('//')) return `https:${value}`
  return value.replace(/^http:/, 'https:')
}

function readCached(key: string): WikimediaPlacePhoto | null | undefined {
  if (memory.has(key)) return memory.get(key) ?? null
  const stored = getLlmArtifact<CachedPhoto>(key)
  if (stored?.status === 'found' && stored.photo?.url) {
    memory.set(key, stored.photo)
    return stored.photo
  }
  if (stored?.status === 'missing') {
    memory.set(key, null)
    return null
  }
  return undefined
}

function store(key: string, photo: WikimediaPlacePhoto | null) {
  memory.set(key, photo)
  setLlmArtifact(
    key,
    photo ? { status: 'found', photo } satisfies CachedPhoto : { status: 'missing' },
  )
}

async function fetchJson<T>(url: URL): Promise<T> {
  const response = await fetch(url.toString(), {
    headers: { accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`Wikimedia request failed (${response.status})`)
  return (await response.json()) as T
}

async function resolvePhoto(
  name: string,
  location: Coordinates,
): Promise<WikimediaPlacePhoto | null> {
  const searchVariants = [
    name,
    // Some official place labels include a short brand before a dash, while
    // Wikidata only indexes the museum name (for example "MuAM - Musée …").
    name.includes(' - ') ? name.split(' - ').slice(1).join(' - ').trim() : '',
  ].filter((value, index, all) => value && all.indexOf(value) === index)
  const searches = await Promise.all(
    searchVariants.map(async (searchName) => {
      const searchUrl = new URL('https://www.wikidata.org/w/api.php')
      searchUrl.search = new URLSearchParams({
        action: 'wbsearchentities',
        format: 'json',
        origin: '*',
        language: 'fr',
        uselang: 'fr',
        type: 'item',
        limit: '8',
        // Appending a city can make valid entities disappear entirely; the
        // saved coordinates below are the authoritative city check.
        search: searchName,
      }).toString()
      return fetchJson<{ search?: WikidataSearchItem[] }>(searchUrl)
    }),
  )
  const ids = [
    ...new Set(
      searches
        .flatMap((search) => search.search || [])
        .map((item) => item.id)
        .filter((id): id is string => Boolean(id)),
    ),
  ]
  if (!ids.length) return null

  const entitiesUrl = new URL('https://www.wikidata.org/w/api.php')
  entitiesUrl.search = new URLSearchParams({
    action: 'wbgetentities',
    format: 'json',
    origin: '*',
    props: 'claims|labels',
    languages: 'fr|en',
    ids: ids.join('|'),
  }).toString()
  const payload = await fetchJson<{ entities?: Record<string, WikidataEntity> }>(
    entitiesUrl,
  )

  const ranked = Object.values(payload.entities || {})
    .map((entity) => {
      const image = imageValue(entity)
      const coordinates = coordinateValue(entity)
      const label =
        entity.labels?.fr?.value || entity.labels?.en?.value || ''
      if (!entity.id || !image || !coordinates || !label) return null
      const similarity = placeIdentitySimilarity(name, label)
      const distance = haversineMeters(location, coordinates)
      if (
        similarity < PLACE_NAME_MATCH_MIN ||
        distance > MAX_MATCH_DISTANCE_METERS
      ) {
        return null
      }
      return { entity, image, similarity, distance }
    })
    .filter(
      (
        item,
      ): item is {
        entity: WikidataEntity & { id: string }
        image: string
        similarity: number
        distance: number
      } => Boolean(item),
    )
    .sort((a, b) => b.similarity - a.similarity || a.distance - b.distance)

  const match = ranked[0]
  if (!match) return null

  const fileTitle = `File:${match.image}`
  const commonsUrl = new URL('https://commons.wikimedia.org/w/api.php')
  commonsUrl.search = new URLSearchParams({
    action: 'query',
    format: 'json',
    origin: '*',
    prop: 'imageinfo',
    titles: fileTitle,
    iiprop: 'url|extmetadata',
    iiurlwidth: '1200',
  }).toString()
  const commons = await fetchJson<{
    query?: { pages?: Record<string, { imageinfo?: CommonsImageInfo[] }> }
  }>(commonsUrl)
  const info = Object.values(commons.query?.pages || {})[0]?.imageinfo?.[0]
  const url = secureUrl(info?.thumburl || info?.url)
  const sourcePage = secureUrl(info?.descriptionurl)
  if (!url || !sourcePage) return null

  const metadata = info?.extmetadata || {}
  return {
    url,
    sourcePage,
    fileTitle,
    attribution:
      stripHtml(metadata.Artist?.value) || stripHtml(metadata.Credit?.value),
    license: stripHtml(metadata.LicenseShortName?.value),
    licenseUrl: secureUrl(metadata.LicenseUrl?.value),
    wikidataId: match.entity.id,
    query: name,
  }
}

export function peekWikimediaPlacePhoto(
  name: string,
  location: Coordinates,
): WikimediaPlacePhoto | null {
  return readCached(cacheKey(name, location)) ?? null
}

/** Resolve one verified landmark image and persist the result across devices. */
export function fetchWikimediaPlacePhoto(
  name: string,
  location: Coordinates,
): Promise<WikimediaPlacePhoto | null> {
  const key = cacheKey(name, location)
  const cached = readCached(key)
  if (cached !== undefined) return Promise.resolve(cached)
  const pending = inflight.get(key)
  if (pending) return pending

  const request = resolvePhoto(name, location)
    .then((photo) => {
      store(key, photo)
      return photo
    })
    .catch(() => null)
    .finally(() => inflight.delete(key))
  inflight.set(key, request)
  return request
}

export function resetWikimediaPlacePhotoCacheForTests() {
  memory.clear()
  inflight.clear()
}
