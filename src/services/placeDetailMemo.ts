import type { HotelDetailCopy } from './llm'
import { memoizeLlmCall, peekLlmMemo, seedLlmMemo } from './llmMemo'

/** PlacePanel / itinerary placeId key (catalog id or `custom-*`). */
export function placeDetailIdKey(placeId: string) {
  return `place-detail:${placeId}`
}

/** Shared stable key by Google place id when known. */
export function placeDetailGoogleIdKey(googlePlaceId: string) {
  return `place-detail:google:${googlePlaceId.trim()}`
}

/**
 * Shared alias by normalized display name so Google search preview and
 * PlacePanel (after add with a new `custom-*` id) can reuse the same narrative.
 */
export function placeDetailNameKey(name: string) {
  return `place-detail:google:${name.toLowerCase().trim()}`
}

/** Keys used when generating from a Google Places details payload. */
export function placeDetailKeysFromGoogle(details: {
  id?: string
  name: string
}): string[] {
  const nameKey = placeDetailNameKey(details.name)
  const gid = details.id?.trim()
  if (gid) return [placeDetailGoogleIdKey(gid), nameKey]
  return [nameKey]
}

/** Keys used when opening an itinerary place in PlacePanel. */
export function placeDetailKeysFromPlace(place: { id: string; name: string }): string[] {
  return [placeDetailIdKey(place.id), placeDetailNameKey(place.name)]
}

export function peekPlaceDetailCopy(
  ...keys: Array<string | undefined | null>
): HotelDetailCopy | undefined {
  for (const key of keys) {
    if (!key) continue
    const hit = peekLlmMemo<HotelDetailCopy>(key)
    if (hit) return hit
  }
  return undefined
}

/**
 * Memoize under the primary key and seed every alias so PlacePanel /
 * AddPlaceDialog share cache for the same real-world place.
 */
export async function memoizePlaceDetailCopy(
  keys: string[],
  fn: () => Promise<HotelDetailCopy>,
): Promise<HotelDetailCopy> {
  const uniqueKeys = [...new Set(keys.filter(Boolean))]
  const existing = peekPlaceDetailCopy(...uniqueKeys)
  if (existing) {
    for (const k of uniqueKeys) seedLlmMemo(k, existing)
    return existing
  }

  const primary = uniqueKeys[0]
  if (!primary) return fn()

  const value = await memoizeLlmCall(primary, fn)
  for (const k of uniqueKeys.slice(1)) seedLlmMemo(k, value)
  return value
}
