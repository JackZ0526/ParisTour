import type { Coordinates } from '../types'
import {
  withGoogleMapsPhotoKey,
  withoutGoogleMapsPhotoKey,
} from './googleMapsKey'
import { getLlmArtifact, setLlmArtifact } from './llmArtifactStore'

export interface PlacePhotoResult {
  url: string
  attribution?: string
  rating?: number
  query: string
}

const cache = new Map<string, PlacePhotoResult>()
const inflight = new Map<string, Promise<PlacePhotoResult | null>>()
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

/**
 * Fetch a real Google Maps / Places photo for a venue via Places JS library.
 * Requires Maps JavaScript API + Places API (New) enabled.
 */
export async function fetchGooglePlacePhoto(
  query: string,
  location?: Coordinates,
): Promise<PlacePhotoResult | null> {
  const key = cacheKey(query, location)
  const hit = cache.get(key)
  if (hit) return hit

  const stored = getStoredPhoto(key)
  if (stored) {
    cache.set(key, stored)
    return stored
  }

  const pending = inflight.get(key)
  if (pending) return pending

  const task = (async () => {
    if (!window.google?.maps) return null

    const lib = (await google.maps.importLibrary('places')) as unknown as {
      Place: {
        searchByText: (req: Record<string, unknown>) => Promise<{
          places?: Array<{
            photos?: Array<{
              getURI: (opts?: { maxHeight?: number; maxWidth?: number }) => string
              authorAttributions?: Array<{ displayName?: string }>
            }>
            rating?: number
            displayName?: string | { text?: string }
          }>
        }>
      }
    }

    const request: Record<string, unknown> = {
      textQuery: query,
      fields: ['displayName', 'photos', 'rating', 'location'],
      language: 'zh-CN',
      region: 'fr',
      maxResultCount: 1,
    }

    if (location) {
      request.locationBias = location
    }

    const { places } = await lib.Place.searchByText(request)
    const place = places?.[0]
    const photo = place?.photos?.[0]
    if (!photo) return null

    const url = withGoogleMapsPhotoKey(photo.getURI({ maxHeight: 1000, maxWidth: 1400 }))
    const attribution = photo.authorAttributions?.[0]?.displayName
    const result: PlacePhotoResult = {
      url,
      attribution,
      rating: place.rating,
      query,
    }
    cache.set(key, result)
    setLlmArtifact(artifactKey(key), {
      ...result,
      url: withoutGoogleMapsPhotoKey(result.url),
    })
    return result
  })()

  inflight.set(key, task)
  try {
    return await task
  } finally {
    inflight.delete(key)
  }
}

export function placePhotoQuery(name: string, nameLocal?: string): string {
  const label = nameLocal || name
  if (/paris|france|迪士尼|枫丹白露|cdg|airport/i.test(label)) return label
  return `${label} Paris`
}
