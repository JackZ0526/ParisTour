/**
 * useHotelAdvisorLocaleRegen
 *
 * When the user switches interface language (zh-CN ↔ en), some LLM-generated
 * fields on each hotel candidate may have been produced in the previous
 * language and would be displayed as "stale" Chinese/English in the new
 * locale. This hook:
 *
 *   1. Subscribes to `subscribeLocale`.
 *   2. On locale change, scans `candidates` for hotels whose `reason` and/or
 *      `tripFit` don't match the new locale (via `isValidMemoForLocale`).
 *   3. Re-runs the LLM in the new locale for each stale field, using the
 *      existing memoization layer so duplicate / in-flight calls are deduped.
 *   4. Patches the candidate list via `onCandidatesChange` as each rewrite
 *      completes.
 *
 * The hook is conservative: stale-free passes are no-ops, errors are silent
 * (the underlying UI already falls back gracefully), and rapid locale toggles
 * are safe because each rewrite has a stable per-locale cache key.
 */

import { useEffect, useRef } from 'react'
import type { HotelCandidate } from '../../../types'
import { getLocale, subscribeLocale, type Locale } from '../../../shared/i18n'
import { memoizeLlmCall } from '../../../shared/services/llm/llmMemo'
import {
  generateHotelDetailCopy,
  regenerateHotelLanguageFields,
} from '../../../shared/services/llm/llm'
import { isLlmConfigured } from '../../../shared/services/llm/llm'
import {
  hotelAdvisorKeys,
  isValidMemoForLocale,
  rememberHotelAdvisorCopy,
} from '../services/hotelAdvisorMemo'
import { loadHotelCache } from '../services/hotelCache'

export interface HotelAdvisorLocaleRegenOptions {
  candidates: HotelCandidate[]
  days: Array<{ day: number; title: string; pace: string; theme: string }>
  onCandidatesChange: (next: HotelCandidate[]) => void
}

function buildReasonRewriteKey(
  hotel: Pick<HotelCandidate, 'id' | 'name' | 'bookingHotelId'>,
  locale: Locale,
): string {
  // Stable across the hotel's natural ids + the target locale.
  // We intentionally do NOT include the current reason so a stale value
  // doesn't poison the cache key.
  const bookingId = hotel.bookingHotelId?.trim() || hotel.id || hotel.name.trim()
  return `hotel-reason-rewrite:v1:${locale}:${bookingId.toLowerCase()}`
}

export function useHotelAdvisorLocaleRegen({
  candidates,
  days,
  onCandidatesChange,
}: HotelAdvisorLocaleRegenOptions) {
  // Refs let the subscription callback read the latest values without
  // re-subscribing on every render.
  const candidatesRef = useRef(candidates)
  candidatesRef.current = candidates
  const daysRef = useRef(days)
  daysRef.current = days
  const onChangeRef = useRef(onCandidatesChange)
  onChangeRef.current = onCandidatesChange
  // Tracks in-flight batches so we can cancel a stale one when the
  // user switches locale again before the previous batch finishes.
  const batchTokenRef = useRef(0)

  useEffect(() => {
    const processLocaleChange = (newLocale: Locale) => {
      if (!isLlmConfigured()) return

      const snapshot = candidatesRef.current
      const staleReasonHotels = snapshot.filter((h) => {
        const text = (h.reason || '').trim()
        return text && !isValidMemoForLocale(text, newLocale)
      })
      const staleTripFitHotels = snapshot.filter((h) => {
        const text = (h.tripFit || '').trim()
        return text && !isValidMemoForLocale(text, newLocale)
      })
      if (!staleReasonHotels.length && !staleTripFitHotels.length) return

      const token = ++batchTokenRef.current
      const prefs = loadHotelCache()?.lastPreferences?.trim() || undefined
      const tripDays = daysRef.current.map((d) => ({
        day: d.day,
        title: d.title,
        pace: d.pace,
        theme: d.theme,
      }))

      const applyToCandidate = (
        hotelId: string,
        patch: Partial<Pick<HotelCandidate, 'reason' | 'description' | 'tripFit' | 'hotelAdvisorVersion'>>,
      ) => {
        const list = candidatesRef.current
        let changed = false
        const next = list.map((h) => {
          if (h.id !== hotelId) return h
          changed = true
          return { ...h, ...patch }
        })
        if (changed) onChangeRef.current(next)
      }

      const allJobs: Array<Promise<void>> = []

      for (const hotel of staleReasonHotels) {
        allJobs.push(
          (async () => {
            try {
              const key = buildReasonRewriteKey(hotel, newLocale)
              const result = await memoizeLlmCall(key, () =>
                regenerateHotelLanguageFields({
                  name: hotel.name,
                  area: hotel.area,
                  address: hotel.address,
                  description: hotel.description,
                  reason: hotel.reason,
                  nearestMetro: hotel.nearestMetro,
                  rating: hotel.rating,
                  reviewCount: hotel.reviewCount,
                  starRating: hotel.starRating,
                  propertyType: hotel.propertyType,
                  isBest: hotel.isBest,
                  locale: newLocale,
                }),
              )
              if (batchTokenRef.current !== token) return
              if (!result) return
              const patch: Partial<HotelCandidate> = {}
              if (result.reason) patch.reason = result.reason
              if (result.description) patch.description = result.description
              if (Object.keys(patch).length) applyToCandidate(hotel.id, patch)
            } catch {
              // Silent — UI falls back to the (still stale) previous value
              // rather than a blank card.
            }
          })(),
        )
      }

      for (const hotel of staleTripFitHotels) {
        allJobs.push(
          (async () => {
            try {
              const featuredReviews = (hotel.reviews || []).map((r) => ({
                text: r.text,
                negativeText: r.negativeText,
                rating: r.rating,
                author: r.author,
              }))
              const copy = await memoizeLlmCall(
                hotelAdvisorKeys(hotel, newLocale)[0] || `hotel-detail:v3:${newLocale}:${hotel.id}`,
                () =>
                  generateHotelDetailCopy({
                    name: hotel.name,
                    area: hotel.area,
                    address: hotel.address,
                    nearestMetro: hotel.nearestMetro,
                    rating: hotel.rating,
                    reviewCount: hotel.reviewCount,
                    starRating: hotel.starRating,
                    propertyType: hotel.propertyType,
                    facilities: hotel.facilities,
                    reviewScores: hotel.reviewScores,
                    locationDescription: hotel.locationDescription,
                    districtLabel: hotel.districtLabel,
                    distanceToCityCenterKm: hotel.distanceToCityCenterKm,
                    featuredReviews,
                    existingReason: hotel.reason,
                    isBest: hotel.isBest,
                    userPreferences: prefs,
                    tripDays,
                  }),
                { durable: true },
              )
              if (batchTokenRef.current !== token) return
              if (!copy?.reason?.trim()) return
              rememberHotelAdvisorCopy(hotel, copy.reason, newLocale)
              applyToCandidate(hotel.id, {
                tripFit: copy.reason,
                hotelAdvisorVersion: 2,
              })
            } catch {
              // Silent.
            }
          })(),
        )
      }

      // Fire-and-forget; the per-hotel update is what matters.
      void Promise.allSettled(allJobs)
    }

    // Pick up the initial locale in case the user mounted on a non-default
    // locale (e.g. via localStorage in `initLocale()` before this hook ran).
    // Defer to next microtask so the first paint isn't blocked on LLM calls.
    const initial = getLocale()
    queueMicrotask(() => processLocaleChange(initial))

    const unsub = subscribeLocale(() => {
      processLocaleChange(getLocale())
    })
    return () => {
      batchTokenRef.current++ // cancel any in-flight work
      unsub()
    }
  }, [days])
}
