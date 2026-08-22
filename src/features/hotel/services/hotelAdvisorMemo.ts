import type { HotelDetailCopy } from '../../../shared/services/llm/llm'
import {
  getLlmArtifact,
  setLlmArtifactsForKeys,
} from '../../../shared/services/llm/llmArtifactStore'
import { memoizeLlmCall, peekLlmMemo, seedLlmMemo } from '../../../shared/services/llm/llmMemo'
import { getLocale, type Locale } from '../../../shared/i18n'
import { looksChinese } from '../../chat/services/translate'
import type { HotelCandidate } from '../../../types'

export function hotelAdvisorCardKey(cardId: string, locale: Locale = getLocale()) {
  return `hotel-detail:v3:${locale}:${cardId}`
}

export function hotelAdvisorBookingKey(bookingHotelId: string, locale: Locale = getLocale()) {
  return `hotel-detail:v3:${locale}:booking:${bookingHotelId.trim()}`
}

export function hotelAdvisorNameKey(name: string, locale: Locale = getLocale()) {
  return `hotel-detail:v3:${locale}:name:${name.toLowerCase().trim()}`
}

/** Stable first, then name, then ephemeral card id. */
export function hotelAdvisorKeys(
  hotel: {
    id: string
    name: string
    bookingHotelId?: string
  },
  locale: Locale = getLocale(),
): string[] {
  const keys: string[] = []
  const bookingId = hotel.bookingHotelId?.trim()
  if (bookingId) keys.push(hotelAdvisorBookingKey(bookingId, locale))
  const name = hotel.name.trim()
  if (name) keys.push(hotelAdvisorNameKey(name, locale))
  if (hotel.id) keys.push(hotelAdvisorCardKey(hotel.id, locale))
  return [...new Set(keys.filter(Boolean))]
}

function isValidMemoForLocale(reason: string, locale: Locale = getLocale()): boolean {
  if (!reason.trim()) return false
  if (locale === 'en' && looksChinese(reason)) return false
  if (locale === 'zh-CN' && !looksChinese(reason)) return false
  return true
}

export function peekHotelAdvisorCopy(
  ...keys: Array<string | undefined | null>
): HotelDetailCopy | undefined {
  const locale = getLocale()
  for (const key of keys) {
    if (!key) continue
    const mem = peekLlmMemo<HotelDetailCopy>(key)
    if (mem?.reason?.trim() && isValidMemoForLocale(mem.reason, locale)) return mem
    const durable = getLlmArtifact<HotelDetailCopy>(key)
    if (durable?.reason?.trim() && isValidMemoForLocale(durable.reason, locale)) {
      seedLlmMemo(key, durable)
      return durable
    }
  }
  return undefined
}

export function rememberHotelAdvisorCopy(
  hotel: { id: string; name: string; bookingHotelId?: string },
  reason: string,
  locale: Locale = getLocale(),
) {
  const trimmed = reason.trim()
  if (!trimmed || !isValidMemoForLocale(trimmed, locale)) return
  const keys = hotelAdvisorKeys(hotel, locale)
  if (!keys.length) return
  const value: HotelDetailCopy = { intro: '', reason: trimmed, tripFit: '' }
  for (const key of keys) seedLlmMemo(key, value)
  setLlmArtifactsForKeys(keys, value)
}

/** Restore advisor copy onto a re-added custom hotel without calling the model. */
export function hydrateHotelAdvisorFromCache(
  hotel: HotelCandidate,
  locale: Locale = getLocale(),
): HotelCandidate {
  if (hotel.tripFit?.trim() && isValidMemoForLocale(hotel.tripFit, locale)) {
    rememberHotelAdvisorCopy(hotel, hotel.tripFit, locale)
    return hotel
  }
  const cached = peekHotelAdvisorCopy(...hotelAdvisorKeys(hotel, locale))
  const reason = cached?.reason?.trim()
  if (!reason || !isValidMemoForLocale(reason, locale)) return hotel
  rememberHotelAdvisorCopy(hotel, reason, locale)
  return {
    ...hotel,
    tripFit: reason,
    hotelAdvisorVersion: 2,
  }
}

export async function memoizeHotelAdvisorCopy(
  hotel: { id: string; name: string; bookingHotelId?: string },
  fn: () => Promise<HotelDetailCopy | null>,
  options?: { bypass?: boolean; locale?: Locale },
): Promise<HotelDetailCopy | null> {
  const locale = options?.locale || getLocale()
  const keys = hotelAdvisorKeys(hotel, locale)
  if (!options?.bypass) {
    const existing = peekHotelAdvisorCopy(...keys)
    if (existing && isValidMemoForLocale(existing.reason, locale)) {
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
  rememberHotelAdvisorCopy(hotel, value.reason, locale)
  return value
}
