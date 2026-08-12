import type { Coordinates } from '../../../types'
import {
  withGoogleMapsPhotoKey,
} from './googleMapsKey'
import { getLlmArtifact } from '../../../shared/services/llm/llmArtifactStore'

export interface PlacePhotoResult {
  url: string
  attribution?: string
  rating?: number
  query: string
}

const cache = new Map<string, PlacePhotoResult>()
const PHOTO_ARTIFACT_PREFIX = 'google-place-photo:'

function cacheKey(query: string, location?: Coordinates) {
  // v3: allow clients to cache-bust failed media; key always appended server-side params
  if (!location) return `v3|${query.trim().toLowerCase()}`
  return `v3|${query.trim().toLowerCase()}|${location.lat.toFixed(4)},${location.lng.toFixed(4)}`
}

function artifactKey(key: string) {
  return `${PHOTO_ARTIFACT_PREFIX}${key}`
}

function getStoredPhoto(key: string): PlacePhotoResult | null {
  const stored = getLlmArtifact<PlacePhotoResult>(artifactKey(key))
  if (
    !stored ||
    typeof stored.url !== 'string' ||
    !stored.url ||
    typeof stored.query !== 'string'
  ) {
    return null
  }
  return { ...stored, url: withGoogleMapsPhotoKey(stored.url) }
}

/** Sync cache read used by cards without starting a paid lookup. */
export function peekGooglePlacePhoto(
  query: string,
  location?: Coordinates,
): PlacePhotoResult | null {
  const key = cacheKey(query, location)
  const memory = cache.get(key)
  if (memory) return memory
  const stored = getStoredPhoto(key)
  if (stored) cache.set(key, stored)
  return stored
}

/**
 * Photo media is a separate RapidAPI endpoint request. Keep this function as a
 * cache-only compatibility layer so one complete place lookup remains one call.
 */
export async function fetchGooglePlacePhoto(
  query: string,
  location?: Coordinates,
): Promise<PlacePhotoResult | null> {
  return peekGooglePlacePhoto(query, location)
}

export function placePhotoQuery(name: string, nameLocal?: string): string {
  const label = nameLocal || name
  if (/paris|france|迪士尼|枫丹白露|cdg|airport/i.test(label)) return label
  return `${label} Paris`
}
