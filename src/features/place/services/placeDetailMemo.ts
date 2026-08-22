import type { HotelDetailCopy } from '../../../shared/services/llm/llm'
import {
  getLlmArtifact,
  setLlmArtifactsForKeys,
} from '../../../shared/services/llm/llmArtifactStore'
import { memoizeLlmCall, peekLlmMemo, seedLlmMemo } from '../../../shared/services/llm/llmMemo'
import { getLocale, type Locale } from '../../../shared/i18n'
import { looksChinese } from '../../chat/services/translate'

function placeDetailPrefix(locale: Locale = getLocale()) {
  return `place-detail:v3:${locale}:`
}

/** PlacePanel / itinerary placeId key (catalog id or `custom-*`). */
export function placeDetailIdKey(placeId: string, locale: Locale = getLocale()) {
  return `${placeDetailPrefix(locale)}${placeId}`
}

/** Shared stable key by Google place id when known. */
export function placeDetailGoogleIdKey(googlePlaceId: string, locale: Locale = getLocale()) {
  return `${placeDetailPrefix(locale)}google:${googlePlaceId.trim()}`
}

/**
 * Shared alias by normalized display name so Google search preview and
 * PlacePanel (after add with a new `custom-*` id) can reuse the same narrative.
 */
export function placeDetailNameKey(name: string, locale: Locale = getLocale()) {
  return `${placeDetailPrefix(locale)}google:${name.toLowerCase().trim()}`
}

/** Keys used when generating from a Google Places details payload. */
export function placeDetailKeysFromGoogle(
  details: {
    id?: string
    name: string
  },
  locale: Locale = getLocale(),
): string[] {
  const nameKey = placeDetailNameKey(details.name, locale)
  const gid = details.id?.trim()
  if (gid) return [placeDetailGoogleIdKey(gid, locale), nameKey]
  return [nameKey]
}

/** Keys used when opening an itinerary place in PlacePanel. */
export function placeDetailKeysFromPlace(
  place: {
    id: string
    name: string
    googlePlaceId?: string
  },
  locale: Locale = getLocale(),
): string[] {
  const keys = [placeDetailIdKey(place.id, locale)]
  if (place.googlePlaceId?.trim()) {
    keys.push(placeDetailGoogleIdKey(place.googlePlaceId, locale))
  }
  keys.push(placeDetailNameKey(place.name, locale))
  return keys
}

function isValidPlaceCopyForLocale(copy: HotelDetailCopy, locale: Locale = getLocale()): boolean {
  const text = (copy.intro || '') + ' ' + (copy.reason || '')
  if (!text.trim()) return false
  if (locale === 'en' && looksChinese(text)) return false
  if (locale === 'zh-CN' && !looksChinese(text)) return false
  return true
}

export function peekPlaceDetailCopy(
  ...keys: Array<string | undefined | null>
): HotelDetailCopy | undefined {
  const locale = getLocale()
  for (const key of keys) {
    if (!key) continue
    const mem = peekLlmMemo<HotelDetailCopy>(key)
    if (mem && isValidPlaceCopyForLocale(mem, locale)) return mem
    const durable = getLlmArtifact<HotelDetailCopy>(key)
    if (durable && isValidPlaceCopyForLocale(durable, locale)) {
      seedLlmMemo(key, durable)
      return durable
    }
  }
  return undefined
}

/**
 * Memoize under the primary key and seed every alias so PlacePanel /
 * AddPlaceDialog share cache for the same real-world place.
 * Persists into the trip LLM artifact store (cloud-synced).
 */
export async function memoizePlaceDetailCopy(
  keys: string[],
  fn: () => Promise<HotelDetailCopy>,
  options?: { bypass?: boolean; locale?: Locale },
): Promise<HotelDetailCopy> {
  const locale = options?.locale || getLocale()
  const uniqueKeys = [...new Set(keys.filter(Boolean))]
  if (!options?.bypass) {
    const existing = peekPlaceDetailCopy(...uniqueKeys)
    if (existing && isValidPlaceCopyForLocale(existing, locale)) {
      for (const k of uniqueKeys) seedLlmMemo(k, existing)
      return existing
    }
  }

  const primary = uniqueKeys[0]
  if (!primary) return fn()

  const value = await memoizeLlmCall(primary, fn, {
    bypass: options?.bypass,
  })
  if (value && isValidPlaceCopyForLocale(value, locale)) {
    for (const k of uniqueKeys) seedLlmMemo(k, value)
    setLlmArtifactsForKeys(uniqueKeys, value)
  }
  return value
}
