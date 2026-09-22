import { englishPromptFragments } from '../../../i18n/prompts/hotel-fragments-c7a804'
import { runtimeCopy4 } from '../../../i18n/copy/hotel-runtime4-c7a804'
import { hotelInstruction } from '../../../i18n/copy/hotelInstructions'
import { runtimeCopy } from '../../../i18n/copy/hotel-runtime-c7a804'
import { localizedCopy } from '../../../i18n/copy/hotel-c7a804'
/**
 * LLM call sites for hotels (detail copy / recommendation).
 */
import {
  getCommonRules,
  getPlaceResearchDiscipline,
  buildPrompt,
  jsonContract,
} from '../prompts'
import { LlmRequestError } from '../errors'
import { extractJsonObject } from '../json'
import type { HotelDetailCopy, HotelRecommendation } from '../types'
import { generateText, isLlmConfigured } from './_service'
import { callOpenAIMessagesStream } from '../transport'
import { extractPartialJsonStringField } from '../stream'
import { getLocale, getLlmLanguageInstruction, type Locale } from '../../../i18n'

export type { HotelDetailCopy, HotelRecommendation }

function toExcludeSet(names: string[]): Set<string> {
  return new Set(names.map((n) => n.toLowerCase().trim()).filter(Boolean))
}

/** Rich hotel narrative for the detail popup: one concise recommendation reason. */
export async function generateHotelDetailCopy(input: {
  name: string
  area: string
  address: string
  nearestMetro?: string
  rating?: number
  reviewCount?: number
  starRating?: number
  propertyType?: string
  facilities?: string[]
  reviewScores?: Array<{ label: string; score: number }>
  locationDescription?: string
  districtLabel?: string
  distanceToCityCenterKm?: number
  featuredReviews?: Array<{
    text: string
    negativeText?: string
    rating?: number
    author?: string
  }>
  existingReason?: string
  isBest?: boolean
  userPreferences?: string
  tripDays?: Array<{ day: number; title: string; pace: string; theme: string }>
  /** Progressive `reason` while JSON streams (omit on cache hits). */
  onPartial?: (partial: { reason?: string }) => void
  signal?: AbortSignal
}): Promise<HotelDetailCopy | null> {
  if (!isLlmConfigured()) return null

  const activeLocale = getLocale()
  const langRule = getLlmLanguageInstruction()
  const system = buildPrompt(
    activeLocale === 'en'
      ? localizedCopy('mec1ecc4415', undefined, 'en')
      : localizedCopy('mec1ecc4415', undefined, 'zh-CN'),
    null,
    hotelInstruction('mc500d45b04', { p0: (langRule) }),
    jsonContract(
      '{ reason: "string" }',
      activeLocale === 'en'
        ? localizedCopy('m92328e4899', undefined, 'en')
        : localizedCopy('m92328e4899', undefined, 'zh-CN'),
    ),
  )
  const user = JSON.stringify({
    hotel: {
      name: input.name,
      area: input.area,
      address: input.address,
      nearestMetro: input.nearestMetro || '',
      rating: input.rating ?? null,
      reviewCount: input.reviewCount ?? null,
      starRating: input.starRating ?? null,
      propertyType: input.propertyType || '',
      facilities: (input.facilities || []).slice(0, 12),
      reviewScores: input.reviewScores || [],
      locationDescription: input.locationDescription || '',
      districtLabel: input.districtLabel || '',
      distanceToCityCenterKm: input.distanceToCityCenterKm ?? null,
      existingReason: input.existingReason || '',
      isBest: Boolean(input.isBest),
    },
    featuredReviews: (input.featuredReviews || []).slice(0, 6).map((review) => ({
      text: review.text,
      negativeText: review.negativeText || '',
      rating: review.rating ?? null,
      author: review.author || '',
    })),
    userPreferences: input.userPreferences || null,
    trip: input.tripDays || [],
  })

  const text = await (async () => {
    let lastReason = ''
    try {
      return await callOpenAIMessagesStream(
        [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        {
          task: 'hotelDetail',
          userText: input.userPreferences || input.name,
          signal: input.signal,
          onDelta: (_delta, fullText) => {
            if (!input.onPartial) return
            const reason = extractPartialJsonStringField(fullText, 'reason')
            if (reason == null || reason === lastReason) return
            lastReason = reason
            input.onPartial({ reason })
          },
        },
      )
    } catch {
      return ''
    }
  })()
  if (!text) return null
  const parsed = extractJsonObject(text)
  if (!parsed) return null

  const reason = String(parsed.reason || parsed.recommendation || '').trim()
  if (!reason) return null

  if (input.onPartial) input.onPartial({ reason })

  return {
    intro: '',
    reason,
    tripFit: '',
  }
}

/** One-line blurb for a custom hotel picker card. */
export async function generateHotelCardBlurb(input: {
  name: string
  area?: string
  address?: string
  description?: string
  locationDescription?: string
  starRating?: number
  propertyType?: string
  rating?: number
  facilities?: string[]
  locale?: Locale
  onPartial?: (blurb: string) => void
  signal?: AbortSignal
}): Promise<string | null> {
  if (!isLlmConfigured()) return null
  const locale = input.locale || getLocale()
  const isEn = locale === 'en'

  const system = buildPrompt(
    isEn
      ? localizedCopy('m66601e61c7', undefined, 'en')
      : localizedCopy('m66601e61c7', undefined, 'zh-CN'),
    null,
    isEn
      ? localizedCopy('m9992ac9a92', undefined, 'en')
      : localizedCopy('m9992ac9a92', undefined, 'zh-CN'),
    jsonContract(
      '{ blurb: "string" }',
      isEn
        ? localizedCopy('m4c1b82fbb2', undefined, 'en')
        : localizedCopy('m4c1b82fbb2', undefined, 'zh-CN'),
    ),
  )
  const user = JSON.stringify({
    name: input.name,
    area: input.area || '',
    address: input.address || '',
    starRating: input.starRating ?? null,
    propertyType: input.propertyType || '',
    rating: input.rating ?? null,
    facilities: (input.facilities || []).slice(0, 8),
    description: (input.description || '').slice(0, 500),
    locationDescription: (input.locationDescription || '').slice(0, 400),
  })

  let lastBlurb = ''
  const text = await (async () => {
    try {
      return await callOpenAIMessagesStream(
        [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        {
          task: 'hotelDetail',
          userText: input.name,
          signal: input.signal,
          onDelta: (_delta, fullText) => {
            if (!input.onPartial) return
            const blurb = extractPartialJsonStringField(fullText, 'blurb')
            if (blurb == null || blurb === lastBlurb) return
            lastBlurb = blurb
            input.onPartial(blurb)
          },
        },
      )
    } catch {
      return ''
    }
  })()
  if (!text) return null
  const parsed = extractJsonObject(text)
  const blurb = String(parsed?.blurb || parsed?.reason || lastBlurb || '').trim()
  if (!blurb) return null
  if (input.onPartial && blurb !== lastBlurb) input.onPartial(blurb)
  return blurb
}

/**
 * Recommend Paris stay options via LLM (no local hotel catalog).
 * Caller should resolve names with Booking afterwards.
 */
export async function recommendHotelsForTrip(input?: {
  batch?: number
  excludeNames?: string[]
  /** Free-text user preferences (area, budget, vibe, etc.) */
  preferences?: string
  /** How many hotels to return (1–8). Default 5. */
  count?: number
  /** Itinerary daytime day count when known */
  dayCount?: number
  verifiedCandidates?: Array<{
    id?: string
    name: string
    address?: string
    rating?: number
    userRatingCount?: number
    priceLevel?: string
    distanceMeters?: number
  }>
}): Promise<HotelRecommendation[]> {
  if (!isLlmConfigured()) {
    throw new LlmRequestError(runtimeCopy4('m66fe9f5be6', undefined), 'missing_key')
  }

  const batch = Math.max(1, input?.batch || 1)
  const count = Math.max(1, Math.min(8, input?.count || 5))
  const preferences = input?.preferences?.trim() || ''
  const dayCount = input?.dayCount && input.dayCount > 0 ? input.dayCount : undefined
  const activeLocale = getLocale()
  const langRule = getLlmLanguageInstruction()
  const isEn = activeLocale === 'en'
  const tripLabel = isEn
    ? englishPromptFragments('m5cf534f1c1', { p0: (dayCount || ''), p1: (dayCount === 1 ? '' : 's') }).trim()
    : dayCount
      ? runtimeCopy4('m124648392d', { p0: (dayCount) })
      : runtimeCopy4('m98f36a7100', undefined)
  const system = buildPrompt(
    isEn
      ? localizedCopy('m161cb43125', undefined, 'en')
      : localizedCopy('m161cb43125', { p0: (tripLabel) }, 'zh-CN'),
    null,
    getCommonRules(activeLocale),
    getPlaceResearchDiscipline(activeLocale),
    hotelInstruction('med9a674c28', { p0: (langRule), p1: (count), p2: (isEn
        ? localizedCopy('m3585174b9f', undefined, 'en')
        : localizedCopy('m3585174b9f', undefined, 'zh-CN')), p3: (isEn
        ? localizedCopy('me772503b82', undefined, 'en')
        : localizedCopy('me772503b82', undefined, 'zh-CN')), p4: (count === 1
        ? hotelInstruction('oneBest')
        : hotelInstruction('oneTopPick')), p5: (isEn
        ? localizedCopy('m9474914422', undefined, 'en')
        : localizedCopy('m9474914422', undefined, 'zh-CN')) }),
    jsonContract(
      isEn
        ? localizedCopy('m8d49b8665f', undefined, 'en')
        : localizedCopy('m8d49b8665f', undefined, 'zh-CN'),
      isEn
        ? localizedCopy('m80235ab63c', undefined, 'en')
        : localizedCopy('m80235ab63c', undefined, 'zh-CN'),
    ),
  )
  const user = JSON.stringify({
    trip: dayCount
      ? englishPromptFragments('mcbb82df109', { p0: (dayCount) })
      : englishPromptFragments('m2293c23437'),
    dayCount: dayCount || null,
    batch,
    count,
    userPreferences: preferences || null,
    avoidAlso: input?.excludeNames || [],
    verifiedCandidates: input?.verifiedCandidates || [],
  })

  const text = await generateText(system, user, {
    strict: true,
    task: 'hotelRecommend',
    json: true,
    webSearch: false,
    preflightContext: {
      candidateCount: input?.verifiedCandidates?.length || 0,
      preferences: input?.preferences || '',
    },
    userText: preferences || undefined,
  })
  if (!text) {
    throw new LlmRequestError(runtimeCopy4('m209fdff4d3', undefined))
  }

  const parsed = extractJsonObject(text)
  const list = (parsed?.hotels as unknown[]) || []
  if (!Array.isArray(list) || !list.length) {
    throw new LlmRequestError(runtimeCopy4('mf1f66563e2', undefined))
  }

  const exclude = toExcludeSet(input?.excludeNames || [])
  const out: HotelRecommendation[] = []
  const seen = new Set<string>()
  const verifiedById = new Map(
    (input?.verifiedCandidates || [])
      .filter((candidate) => candidate.id)
      .map((candidate) => [candidate.id!, candidate]),
  )
  const verifiedByName = new Map(
    (input?.verifiedCandidates || []).map((candidate) => [
      candidate.name.trim().toLowerCase(),
      candidate,
    ]),
  )

  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const proposedName = String(row.name || '').trim()
    const proposedId = String(row.bookingHotelId || '').trim()
    const verified =
      (proposedId ? verifiedById.get(proposedId) : undefined) ||
      verifiedByName.get(proposedName.toLowerCase())
    if (!verified) continue
    const name = verified.name
    const key = name.toLowerCase()
    if (exclude.has(key) || seen.has(key)) continue
    out.push({
      bookingHotelId: verified.id,
      name,
      area: isEn
        ? String(row.area || englishPromptFragments('mc0f39e677d')).trim() || englishPromptFragments('mc0f39e677d')
        : String(row.area || runtimeCopy('mb93610fe1f', undefined)).trim() || runtimeCopy('mb93610fe1f', undefined),
      address: verified.address || String(row.address || '').trim() || undefined,
      description:
        String(row.description || row.reason || '').trim() ||
        (isEn ? localizedCopy('mf0e76ecafc', { p0: (name) }, 'en') : localizedCopy('mf0e76ecafc', { p0: (name) }, 'zh-CN')),
      nearestMetro: String(row.nearestMetro || '').trim() || undefined,
      priceHint: String(row.priceHint || '').trim() || undefined,
      reason: String(row.reason || '').trim() ||
        (isEn ? localizedCopy('m5e883f29d5', undefined, 'en') : localizedCopy('m5e883f29d5', undefined, 'zh-CN')),
      isBest: Boolean(row.isBest),
    })
    seen.add(key)
  }

  if (!out.length) {
    throw new LlmRequestError(runtimeCopy4('m3cf21586ab', undefined))
  }

  // Ensure exactly one best pick.
  if (!out.some((h) => h.isBest)) {
    out[0].isBest = true
  } else {
    let sawBest = false
    for (const h of out) {
      if (h.isBest) {
        if (sawBest) h.isBest = false
        else sawBest = true
      }
    }
  }

  return out
}

/**
 * Regenerate just the locale-sensitive prose fields (`description` and `reason`)
 * for a single existing hotel, without changing the hotel itself.
 *
 * Used by the locale-switch regen hook to translate a stored Chinese
 * recommendation into English (or vice versa) when the user switches
 * interface language.
 */
export async function regenerateHotelLanguageFields(input: {
  name: string
  area?: string
  address?: string
  description?: string
  reason?: string
  nearestMetro?: string
  rating?: number
  reviewCount?: number
  starRating?: number
  propertyType?: string
  isBest?: boolean
  locale: Locale
  signal?: AbortSignal
}): Promise<{ description: string; reason: string } | null> {
  if (!isLlmConfigured()) return null

  const isEn = input.locale === 'en'
  const langRule = getLlmLanguageInstruction(input.locale)
  const system = buildPrompt(
    isEn
      ? localizedCopy('m030208c003', undefined, 'en')
      : localizedCopy('m030208c003', undefined, 'zh-CN'),
    null,
    hotelInstruction('m76bc82cf2e', { p0: langRule }, input.locale),
    jsonContract(
      isEn
        ? '{ description: "string", reason: "string" }'
        : '{ description: "string", reason: "string" }',
      isEn
        ? localizedCopy('m8b66f03581', undefined, 'en')
        : localizedCopy('m8b66f03581', undefined, 'zh-CN'),
    ),
  )
  const user = JSON.stringify({
    locale: input.locale,
    hotel: {
      name: input.name,
      area: input.area || '',
      address: input.address || '',
      nearestMetro: input.nearestMetro || '',
      starRating: input.starRating ?? null,
      propertyType: input.propertyType || '',
      rating: input.rating ?? null,
      reviewCount: input.reviewCount ?? null,
      isBest: Boolean(input.isBest),
    },
    existing: {
      description: input.description || '',
      reason: input.reason || '',
    },
  })

  const text = await generateText(system, user, {
    strict: true,
    task: 'hotelDetail',
    json: true,
    webSearch: false,
    userText: input.name,
  })
  if (!text) return null

  const parsed = extractJsonObject(text)
  if (!parsed) return null

  const description = String(parsed.description || '').trim()
  const reason = String(parsed.reason || '').trim()
  if (!description && !reason) return null
  return { description, reason }
}
