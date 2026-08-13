import { authFetch } from '../../auth/services/authFetch'
import {
  getLlmArtifact,
  setLlmArtifact,
} from '../../../shared/services/llm/llmArtifactStore'
import { isLlmConfigured, resolveOfficialWebsite } from '../../../shared/services/llm/llm'
import { isDirectoryOrSocialUrl } from '../../../../api/_lib/websitePhotos'

export interface PlaceWebsitePhotos {
  photos: string[]
  instagram?: string | null
}

const ARTIFACT_PREFIX = 'place-website-photos:v6:'
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

function peekOfficialWebsiteUrl(
  name?: string,
  nameLocal?: string,
  address?: string,
): string | null {
  const names = [name?.trim() || ''].filter(Boolean)
  const locals = [...new Set([nameLocal?.trim() || '', ''])]
  const addresses = [...new Set([address?.trim() || '', ''])]
  for (const n of names) {
    for (const local of locals) {
      for (const addr of addresses) {
        const stored = getLlmArtifact<{ website: string | null }>(
          `place-official-website:v1:${n}|${local}|${addr}`,
        )
        if (stored?.website?.trim()) return stored.website.trim()
      }
    }
  }
  return null
}

function readCached(key: string): PlaceWebsitePhotos | null {
  const memoryHit = memory.get(key)
  if (memoryHit?.photos?.length) return memoryHit
  const stored = getLlmArtifact<PlaceWebsitePhotos>(key)
  if (stored?.photos?.length) {
    memory.set(key, stored)
    return stored
  }
  return null
}

function remember(
  website: string,
  result: PlaceWebsitePhotos,
  aliases?: { name?: string; nameLocal?: string },
) {
  if (!result.photos.length) return
  for (const key of websiteCacheKeys(website)) {
    memory.set(key, result)
    setLlmArtifact(key, result, { silent: true })
  }
  for (const key of placeIndexKeys(aliases?.name, aliases?.nameLocal)) {
    memory.set(key, result)
    setLlmArtifact(key, result, { silent: true })
  }
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
  const official = peekOfficialWebsiteUrl(input.name, input.nameLocal, input.address)
  const keys = [
    ...(input.website ? websiteCacheKeys(input.website) : []),
    ...(official ? websiteCacheKeys(official) : []),
    ...placeIndexKeys(input.name, input.nameLocal),
  ]
  for (const key of keys) {
    const cached = readCached(key)
    if (cached?.photos?.length) return cached
  }
  return { photos: [] }
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

  const googleSite = input.website?.trim()
  if (googleSite && !isDirectoryOrSocialUrl(googleSite)) {
    const scraped = await fetchPlaceWebsitePhotos(googleSite, aliases)
    if (scraped.photos.length) return scraped
  }

  if (!isLlmConfigured() || !input.name.trim()) {
    return googleSite ? fetchPlaceWebsitePhotos(googleSite, aliases) : { photos: [] }
  }

  const resolved = await resolveOfficialWebsite({
    name: input.name,
    nameLocal: input.nameLocal,
    address: input.address,
    googleWebsite: googleSite,
  }).catch(() => null)

  if (!resolved) return { photos: [] }
  const scraped = await fetchPlaceWebsitePhotos(resolved, aliases)
  if (scraped.photos.length && googleSite) remember(googleSite, scraped, aliases)
  return scraped
}

export function resetPlaceWebsitePhotosForTests() {
  memory.clear()
  inflight.clear()
}
