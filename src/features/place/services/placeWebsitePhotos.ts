import { authFetch } from '../../auth/services/authFetch'
import {
  getLlmArtifact,
  removeLlmArtifact,
  setLlmArtifact,
} from '../../../shared/services/llm/llmArtifactStore'
import { isLlmConfigured, resolveOfficialWebsite } from '../../../shared/services/llm/llm'
import { isDirectoryOrSocialUrl } from '../../../../api/_lib/websitePhotos'

export interface PlaceWebsitePhotos {
  photos: string[]
  instagram?: string | null
  /** True when we already scraped / looked up this place and found no photos. */
  miss?: boolean
}

const ARTIFACT_PREFIX = 'place-website-photos:v7:'
const PLACE_INDEX_PREFIX = 'place-website-photos-by-place:v1:'
const memory = new Map<string, PlaceWebsitePhotos>()
const inflight = new Map<string, Promise<PlaceWebsitePhotos>>()

function publicWebsiteUrl(website: string): string {
  try {
    const url = new URL(website.trim())
    if (url.protocol === 'http:') url.protocol = 'https:'
    return url.toString()
  } catch {
    return website.trim()
  }
}

function cacheKey(website: string): string {
  return `${ARTIFACT_PREFIX}${publicWebsiteUrl(website).toLowerCase()}`
}

export function websiteCacheKeys(website: string): string[] {
  const raw = website.trim()
  if (!raw) return []
  const keys = new Set<string>([cacheKey(raw)])
  try {
    const url = new URL(publicWebsiteUrl(raw))
    const host = url.hostname.toLowerCase()
    const hosts = new Set([
      host,
      host.replace(/^www\./, ''),
      host.startsWith('www.') ? host : `www.${host}`,
    ])
    const path = url.pathname || '/'
    const paths = new Set([
      path,
      path.endsWith('/') ? path.slice(0, -1) || '/' : `${path}/`,
    ])
    for (const hostname of hosts) {
      for (const pathname of paths) {
        keys.add(
          `${ARTIFACT_PREFIX}${url.protocol}//${hostname}${pathname}${url.search}`.toLowerCase(),
        )
      }
    }
  } catch {
    /* keep the raw key */
  }
  return [...keys]
}

function placeIndexKeys(name?: string, nameLocal?: string): string[] {
  const labels = [name, nameLocal]
    .map((value) => value?.trim().toLowerCase() || '')
    .filter(Boolean)
  const keys = new Set<string>()
  for (const label of labels) keys.add(`${PLACE_INDEX_PREFIX}${label}`)
  if (labels.length === 2) {
    keys.add(`${PLACE_INDEX_PREFIX}${labels[0]}|${labels[1]}`)
    keys.add(`${PLACE_INDEX_PREFIX}${labels[1]}|${labels[0]}`)
  }
  return [...keys]
}

function peekOfficialWebsiteLookup(
  name?: string,
  nameLocal?: string,
  address?: string,
): { website: string | null; resolved: boolean } {
  const names = [name?.trim() || ''].filter(Boolean)
  const locals = [...new Set([nameLocal?.trim() || '', ''])]
  const addresses = [...new Set([address?.trim() || '', ''])]
  for (const n of names) {
    for (const local of locals) {
      for (const addr of addresses) {
        const stored = getLlmArtifact<{ website: string | null }>(
          `place-official-website:v1:${n}|${local}|${addr}`,
        )
        if (stored && typeof stored === 'object' && 'website' in stored) {
          const website = stored.website?.trim() || null
          return { website, resolved: true }
        }
      }
    }
  }
  return { website: null, resolved: false }
}

function readCached(key: string): PlaceWebsitePhotos | null {
  const memoryHit = memory.get(key)
  if (memoryHit?.photos?.length || memoryHit?.miss) return memoryHit
  const stored = getLlmArtifact<PlaceWebsitePhotos>(key)
  if (stored?.photos?.length || stored?.miss) {
    memory.set(key, stored)
    return stored
  }
  return null
}

function remember(
  website: string | undefined,
  result: PlaceWebsitePhotos,
  aliases?: { name?: string; nameLocal?: string },
) {
  const stored: PlaceWebsitePhotos = result.photos.length
    ? { photos: result.photos, instagram: result.instagram || null }
    : { photos: [], miss: true, instagram: result.instagram || null }
  const keys = [
    ...(website?.trim() ? websiteCacheKeys(website) : []),
    ...placeIndexKeys(aliases?.name, aliases?.nameLocal),
  ]
  for (const key of keys) {
    memory.set(key, stored)
  }
  if (!keys.length) return
  setLlmArtifact(keys[0], stored, {
    aliases: keys.slice(1),
  })
}

export function peekPlaceWebsitePhotos(website?: string): string[] {
  return peekCachedPlaceWebsitePhotos({ website }).photos
}

export function peekCachedPlaceWebsitePhotos(input: {
  website?: string
  name?: string
  nameLocal?: string
  address?: string
}): PlaceWebsitePhotos {
  const official = peekOfficialWebsiteLookup(input.name, input.nameLocal, input.address)
  const keys = [
    ...(input.website ? websiteCacheKeys(input.website) : []),
    ...(official.website ? websiteCacheKeys(official.website) : []),
    ...placeIndexKeys(input.name, input.nameLocal),
  ]
  let miss = false
  for (const key of keys) {
    const cached = readCached(key)
    if (cached?.photos?.length) {
      return { photos: cached.photos, instagram: cached.instagram }
    }
    if (cached?.miss) miss = true
  }
  if (
    official.resolved &&
    !official.website &&
    (!input.website?.trim() || isDirectoryOrSocialUrl(input.website))
  ) {
    miss = true
  }
  return miss ? { photos: [], miss: true } : { photos: [] }
}

/** Clear one place's successful or failed official-site photo lookup. */
export function invalidatePlaceWebsitePhotosCache(input: {
  website?: string
  name?: string
  nameLocal?: string
  address?: string
}): void {
  const official = peekOfficialWebsiteLookup(
    input.name,
    input.nameLocal,
    input.address,
  )
  const artifactKeys = new Set<string>([
    ...placeIndexKeys(input.name, input.nameLocal),
    ...(input.website?.trim() ? websiteCacheKeys(input.website) : []),
    ...(official.website ? websiteCacheKeys(official.website) : []),
  ])
  const names = [...new Set([input.name?.trim() || ''].filter(Boolean))]
  const locals = [...new Set([input.nameLocal?.trim() || '', ''])]
  const addresses = [...new Set([input.address?.trim() || '', ''])]
  for (const name of names) {
    for (const nameLocal of locals) {
      for (const address of addresses) {
        artifactKeys.add(
          `place-official-website:v1:${name}|${nameLocal}|${address}`,
        )
      }
    }
  }

  for (const key of artifactKeys) {
    memory.delete(key)
    inflight.delete(key)
    removeLlmArtifact(key, { silent: true })
  }
}

export async function fetchPlaceWebsitePhotos(
  website?: string,
  aliases?: { name?: string; nameLocal?: string },
): Promise<PlaceWebsitePhotos> {
  const url = website?.trim() ? publicWebsiteUrl(website) : ''
  if (!url) return { photos: [] }
  const cached = peekCachedPlaceWebsitePhotos({
    website: url,
    name: aliases?.name,
    nameLocal: aliases?.nameLocal,
  })
  if (cached.photos.length) {
    remember(url, cached, aliases)
    return cached
  }
  if (cached.miss) return { photos: [], miss: true }
  const pending = inflight.get(cacheKey(url))
  if (pending) return pending

  const task = (async () => {
    const response = await authFetch(
      `/api/place-website?url=${encodeURIComponent(url)}`,
    )
    if (!response.ok) return { photos: [] }
    const payload = (await response.json()) as PlaceWebsitePhotos
    const result: PlaceWebsitePhotos = {
      photos: Array.isArray(payload.photos)
        ? payload.photos.filter((item) => typeof item === 'string' && item.startsWith('https://'))
        : [],
      instagram: payload.instagram || null,
    }
    remember(url, result, aliases)
    return result
  })()

  inflight.set(cacheKey(url), task)
  try {
    return await task
  } finally {
    inflight.delete(cacheKey(url))
  }
}

/**
 * Scrape Google's website first. If that yields nothing (missing URL,
 * Instagram, 404), ask the LLM with web search for a first-party site
 * and scrape that. Details-page / add-place only — not bulk generation.
 */
export async function fetchPlaceWebsitePhotosWithFallback(input: {
  website?: string
  name: string
  nameLocal?: string
  address?: string
}): Promise<PlaceWebsitePhotos> {
  const aliases = { name: input.name, nameLocal: input.nameLocal }
  const cached = peekCachedPlaceWebsitePhotos({
    website: input.website,
    name: input.name,
    nameLocal: input.nameLocal,
    address: input.address,
  })
  if (cached.photos.length) {
    if (input.website?.trim()) remember(input.website, cached, aliases)
    return cached
  }
  if (cached.miss) return { photos: [], miss: true }

  const googleSite = input.website?.trim()
  if (googleSite && !isDirectoryOrSocialUrl(googleSite)) {
    const scraped = await fetchPlaceWebsitePhotos(googleSite, aliases)
    if (scraped.photos.length) return scraped
  }

  if (!isLlmConfigured() || !input.name.trim()) {
    const scraped = googleSite
      ? await fetchPlaceWebsitePhotos(googleSite, aliases)
      : { photos: [] as string[] }
    if (!scraped.photos.length) remember(googleSite, { photos: [] }, aliases)
    return scraped.photos.length ? scraped : { photos: [], miss: true }
  }

  const resolved = await resolveOfficialWebsite({
    name: input.name,
    nameLocal: input.nameLocal,
    address: input.address,
    googleWebsite: googleSite,
  }).catch(() => null)

  if (!resolved) {
    remember(googleSite, { photos: [] }, aliases)
    return { photos: [], miss: true }
  }
  const scraped = await fetchPlaceWebsitePhotos(resolved, aliases)
  if (scraped.photos.length && googleSite) remember(googleSite, scraped, aliases)
  if (!scraped.photos.length) remember(resolved, { photos: [] }, aliases)
  return scraped.photos.length ? scraped : { photos: [], miss: true }
}

export function resetPlaceWebsitePhotosForTests() {
  memory.clear()
  inflight.clear()
}
