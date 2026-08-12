import type { HotelDetailCopy } from '../../../shared/services/llm/llm'
import {
  getLlmArtifact,
  setLlmArtifactsForKeys,
} from '../../../shared/services/llm/llmArtifactStore'
import { memoizeLlmCall, peekLlmMemo, seedLlmMemo } from '../../../shared/services/llm/llmMemo'
import type { HotelCandidate } from '../../../types'

/** Legacy per-card key; kept as an alias so older saved trips still hit. */
export function hotelAdvisorCardKey(cardId: string) {
  return `hotel-detail:v2:${cardId}`
}

export function hotelAdvisorBookingKey(bookingHotelId: string) {
  return `hotel-detail:v2:booking:${bookingHotelId.trim()}`
}

export function hotelAdvisorNameKey(name: string) {
  return `hotel-detail:v2:name:${name.toLowerCase().trim()}`
}

/** Stable first, then name, then ephemeral card id. */
export function hotelAdvisorKeys(hotel: {
  id: string
  name: string
  bookingHotelId?: string
}): string[] {
  const keys: string[] = []
  const bookingId = hotel.bookingHotelId?.trim()
  if (bookingId) keys.push(hotelAdvisorBookingKey(bookingId))
  const name = hotel.name.trim()
  if (name) keys.push(hotelAdvisorNameKey(name))
  if (hotel.id) keys.push(hotelAdvisorCardKey(hotel.id))
  return [...new Set(keys.filter(Boolean))]
}

export function peekHotelAdvisorCopy(
  ...keys: Array<string | undefined | null>
): HotelDetailCopy | undefined {
  for (const key of keys) {
    if (!key) continue
    const mem = peekLlmMemo<HotelDetailCopy>(key)
    if (mem?.reason?.trim()) return mem
    const durable = getLlmArtifact<HotelDetailCopy>(key)
    if (durable?.reason?.trim()) {
      seedLlmMemo(key, durable)
      return durable
    }
  }
  return undefined
}

export function rememberHotelAdvisorCopy(
  hotel: { id: string; name: string; bookingHotelId?: string },
  reason: string,
) {
  const trimmed = reason.trim()
  if (!trimmed) return
  const keys = hotelAdvisorKeys(hotel)
  if (!keys.length) return
  const value: HotelDetailCopy = { intro: '', reason: trimmed, tripFit: '' }
  for (const key of keys) seedLlmMemo(key, value)
  setLlmArtifactsForKeys(keys, value)
}

/** Restore advisor copy onto a re-added custom hotel without calling the model. */
export function hydrateHotelAdvisorFromCache(hotel: HotelCandidate): HotelCandidate {
  if (hotel.tripFit?.trim() && hotel.hotelAdvisorVersion === 2) {
    rememberHotelAdvisorCopy(hotel, hotel.tripFit)
    return hotel
  }
  const cached = peekHotelAdvisorCopy(...hotelAdvisorKeys(hotel))
  const reason = cached?.reason?.trim()
  if (!reason) return hotel
  rememberHotelAdvisorCopy(hotel, reason)
  return {
    ...hotel,
    tripFit: reason,
    hotelAdvisorVersion: 2,
  }
}

export async function memoizeHotelAdvisorCopy(
  hotel: { id: string; name: string; bookingHotelId?: string },
  fn: () => Promise<HotelDetailCopy | null>,
  options?: { bypass?: boolean },
): Promise<HotelDetailCopy | null> {
  const keys = hotelAdvisorKeys(hotel)
  if (!options?.bypass) {
    const existing = peekHotelAdvisorCopy(...keys)
    if (existing) {
      for (const key of keys) seedLlmMemo(key, existing)
      return existing
    }
  }

  const primary = keys[0]
  if (!primary) return fn()

  const value = await memoizeLlmCall(primary, fn, {
    durable: true,
    bypass: options?.bypass,
  })
  if (!value?.reason?.trim()) return value
  rememberHotelAdvisorCopy(hotel, value.reason)
  return value
}
