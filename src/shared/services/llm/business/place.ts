import { normalizeStopCardIntro } from '../../../../features/itinerary/utils/stopCardIntro'
import { stopCardIntroCopy } from '../../../i18n/copy/stopCardIntro'
import { englishPromptFragments, chinesePromptFragments } from '../../../i18n/prompts/place-fragments-d4bd87'
import { runtimeCopy4 } from '../../../i18n/copy/place-runtime4-d4bd87'
import { englishPrompt, chinesePrompt } from '../../../i18n/prompts/place-d4bd87'
import { runtimeCopy3 } from '../../../i18n/copy/place-runtime3-d4bd87'
import { runtimeCopy } from '../../../i18n/copy/place-runtime-d4bd87'
import { localizedCopy } from '../../../i18n/copy/place-d4bd87'
/**
 * LLM call sites for places (description / detail copy / day copy / recommend).
 *
 * Each function is a thin wrapper: it builds the prompt, calls the model,
 * and parses the structured response. Provider fallback / JSON repair live
 * in `_service.ts` (`generateText`). Streaming detail copy uses
 * `openaiChatStream` from the transport layer directly.
 */
import { memoizeLlmCall } from '../llmMemo'
import {
  getCafeVsRestaurantRule,
  getCommonRules,
  getPlaceResearchDiscipline,
  buildPrompt,
  jsonContract,
} from '../prompts'
import { LlmRequestError } from '../errors'
import { callOpenAIMessagesStream } from '../transport'
import {
  extractPartialJsonStringField,
  openaiResponsesWithWebSearch,
  parsePartialJson,
} from '../stream'
import { extractJsonObject, extractPlaceRecommendationRows } from '../json'
import {
  recommendationPreferencesPrompt,
  type RecommendationPreferences,
} from '../../../../features/place/services/recommendationPreferences'
import type {
  HotelDetailCopy,
  RecommendPlaceType,
  PlaceRecommendation,
  VerifiedPlaceCandidate,
} from '../types'
import { generateText, isLlmConfigured } from './_service'
import { officialWebsiteFromCandidate } from '../../../../../api/_lib/websitePhotos'
import { getLocale, getLlmLanguageInstruction, type Locale } from '../../../i18n'

export type {
  RecommendPlaceType,
  PlaceRecommendation,
  VerifiedPlaceCandidate,
}

function parseOfficialWebsiteFromLlm(text: string): string | null {
  const json = extractJsonObject(text)
  const fromJson = typeof json?.website === 'string' ? json.website.trim() : ''
  const fromText = text.match(/https?:\/\/[^\s"'<>]+/i)?.[0] || ''
  return officialWebsiteFromCandidate(fromJson || fromText)
}

/**
 * Web-search fallback when Google `websiteUri` is missing, a social page,
 * or otherwise unusable. Returns a first-party https URL or null.
 * Cached durably so opening the same place does not search again.
 */
export async function resolveOfficialWebsite(input: {
  name: string
  nameLocal?: string
  address?: string
  googleWebsite?: string
}): Promise<string | null> {
  if (!isLlmConfigured()) return null
  const name = input.name.trim()
  if (!name) return null
  const key = `place-official-website:v1:${name}|${input.nameLocal || ''}|${input.address || ''}`
  const hit = await memoizeLlmCall(
    key,
    async () => {
      const research = await openaiResponsesWithWebSearch({
        instructions: buildPrompt(
          runtimeCopy3('m0013ebef00', undefined),
          null,
          runtimeCopy3('m4ae5d03e0f', undefined),
          jsonContract(
            '{ website: "https://..." | null }',
            '{ "website": "https://www.rest-maxan.com/" }',
          ),
        ),
        user: [
          runtimeCopy3('m6906ecd787', { p0: (name) }),
          input.nameLocal ? runtimeCopy3('meb155f3d9f', { p0: (input.nameLocal) }) : '',
          input.address ? runtimeCopy3('ma2b5dae902', { p0: (input.address) }) : '',
          input.googleWebsite ? localizedCopy('m0132cf2cfb', { p0: (input.googleWebsite) }) : localizedCopy('websiteMissing'),
          runtimeCopy3('me95967f264', undefined),
        ]
          .filter(Boolean)
          .join('\n'),
      })
      return { website: parseOfficialWebsiteFromLlm(research.text) }
    },
    { durable: true },
  )
  return hit.website
}

export interface TripadvisorRestaurantListing {
  url?: string
  contentId?: string
  name?: string
}

function parseTripadvisorRestaurantListing(
  text: string,
): TripadvisorRestaurantListing | null {
  const json = extractJsonObject(text)
  const urlRaw = json?.url || json?.tripadvisorUrl
  const urlFromJson = typeof urlRaw === 'string' && urlRaw.trim() ? urlRaw.trim() : ''
  const urlFromText =
    text.match(
      /https?:\/\/[^\s"'<>]*tripadvisor\.[^\s"'<>]*Restaurant_Review[^\s"'<>]*/i,
    )?.[0] || ''
  const url = urlFromJson || urlFromText
  if (!url) return null
  const contentId = url.match(
    /(?:Restaurant_Review)-[^/\s"'<>]*?-d(\d{5,})/i,
  )?.[1]
  if (!contentId) return null
  const nameRaw = json?.name || json?.title
  const name = typeof nameRaw === 'string' && nameRaw.trim() ? nameRaw.trim() : undefined
  return { url, contentId, name }
}

/**
 * Last-resort Tripadvisor restaurant identity when auto-complete only returns
 * hotels/cities. Returns a listing URL / contentId, or null when unsure.
 */
export async function resolveTripadvisorRestaurantListing(input: {
  name: string
  nameLocal?: string
  address?: string
  city?: string
}): Promise<TripadvisorRestaurantListing | null> {
  if (!isLlmConfigured()) return null
  const name = input.name.trim()
  if (!name) return null
  const city = input.city?.trim() || ''
  const key = `tripadvisor-restaurant-listing:v2:${name}|${input.nameLocal || ''}|${input.address || ''}|${city}`
  const hit = await memoizeLlmCall(
    key,
    async () => {
      const research = await openaiResponsesWithWebSearch({
        instructions: buildPrompt(
          runtimeCopy3('me7c5e673d6', undefined),
          null,
          runtimeCopy3('m6d4c334321', undefined),
          jsonContract(
            '{ url: "https://www.tripadvisor.com/Restaurant_Review-..." | null, name?: string }',
            englishPrompt('m7df6fa414a'),
          ),
        ),
        user: [
          runtimeCopy3('m6906ecd787', { p0: (name) }),
          input.nameLocal ? runtimeCopy3('meb155f3d9f', { p0: (input.nameLocal) }) : '',
          input.address ? runtimeCopy3('ma2b5dae902', { p0: (input.address) }) : '',
          city ? runtimeCopy3('ma8de5b267b', { p0: (city) }) : '',
          runtimeCopy3('m0c6af123cd', undefined),
        ]
          .filter(Boolean)
          .join('\n'),
      })
      return { listing: parseTripadvisorRestaurantListing(research.text) }
    },
    { durable: true },
  )
  return hit.listing
}

export interface AttractionCanonicalName {
  nameEn: string
  nameFr?: string
  aliases: string[]
}

function parseAttractionCanonicalName(text: string): AttractionCanonicalName | null {
  const json = extractJsonObject(text)
  if (!json) return null
  const nameEn = String(json.nameEn || json.name || '').trim()
  if (!nameEn || /[\u3400-\u9fff]/.test(nameEn)) return null
  const nameFr = String(json.nameFr || json.nameLocal || '').trim() || undefined
  const aliases = Array.isArray(json.aliases)
    ? json.aliases
        .map((value) => String(value || '').trim())
        .filter((value) => value && value !== nameEn && value !== nameFr)
    : []
  return { nameEn, nameFr, aliases }
}

/**
 * Last-resort identity for attractions whose Chinese / nickname / qualified
 * label does not match Tripadvisor. Returns a Latin listing name, or null
 * when the model is not sure. Callers must still verify via catalog or
 * Tripadvisor autocomplete — never trust this name alone.
 */
export async function resolveAttractionCanonicalName(input: {
  name: string
  nameLocal?: string
}): Promise<AttractionCanonicalName | null> {
  if (!isLlmConfigured()) return null
  const name = input.name.trim()
  if (!name) return null
  const key = `attraction-canonical-name:v1:${name}|${input.nameLocal || ''}`
  return memoizeLlmCall(
    key,
    async () => {
      const text = await generateText(
        buildPrompt(
          runtimeCopy3('mbc90cf09b9', undefined),
          null,
          runtimeCopy3('m3b4bd6d4e8', undefined),
          jsonContract(
            '{ nameEn: string | null, nameFr?: string, aliases?: string[] }',
            englishPrompt('md94d8b5f81'),
          ),
        ),
        [
          runtimeCopy3('m6906ecd787', { p0: (name) }),
          input.nameLocal ? runtimeCopy3('meb155f3d9f', { p0: (input.nameLocal) }) : '',
          runtimeCopy3('m283af41da7', undefined),
        ]
          .filter(Boolean)
          .join('\n'),
        { json: true, task: 'placeName' },
      )
      return parseAttractionCanonicalName(text || '')
    },
    { durable: true },
  )
}

/** Cheap, always-cached place blurb. */
export async function generatePlaceDescription(input: {
  name: string
  type: string
  address?: string
  googleSummary?: string
}): Promise<string | null> {
  const activeLocale = getLocale()
  const langRule = getLlmLanguageInstruction(activeLocale)
  const isEn = activeLocale === 'en'
  const key = `place-desc:v4:${activeLocale}:${input.name}|${input.type}|${input.address || ''}|${input.googleSummary || ''}`
  return memoizeLlmCall(
    key,
    async () => {
      const system = buildPrompt(
        isEn
          ? localizedCopy('m30a559e649', undefined, 'en')
          : localizedCopy('m30a559e649', undefined, 'zh-CN'),
        null,
        `<hard_rules>
- ${langRule}
- ${
          isEn
            ? localizedCopy('m84997a6e3e', undefined, 'en')
            : localizedCopy('m84997a6e3e', undefined, 'zh-CN')
        }
</hard_rules>`,
        getCafeVsRestaurantRule(activeLocale),
        stopCardIntroCopy('rules', undefined, activeLocale),
      )
      const user = isEn
        ? [
            `Place: ${input.name}`,
            `Type: ${input.type}`,
            input.address ? `Address: ${input.address}` : '',
            input.googleSummary ? `Reference: ${input.googleSummary}` : '',
            englishPrompt('m728959227c'),
          ]
            .filter(Boolean)
            .join('\n')
        : [
            runtimeCopy3('m6906ecd787', { p0: (input.name) }),
            runtimeCopy3('m984b5e7dd5', { p0: (input.type) }),
            input.address ? runtimeCopy3('ma2b5dae902', { p0: (input.address) }) : '',
            input.googleSummary ? runtimeCopy3('m594f56e51a', { p0: (input.googleSummary) }) : '',
            runtimeCopy3('m769e7f4d11', undefined),
          ]
            .filter(Boolean)
            .join('\n')

      const raw = await generateText(system, user, { task: 'placeDescription', userText: input.name })
      if (!raw) return null
      return normalizeStopCardIntro(raw.trim().replace(/^["']|["']$/g, ''), { locale: activeLocale, placeName: input.name, address: input.address }) || null
    },
    { durable: true },
  )
}

function placeDetailKind(type: string): 'attraction' | 'food' | 'other' {
  const t = type.trim().toLowerCase()
  if (
    t === 'attraction' ||
    t.includes('attraction') ||
    t.includes('景点') ||
    t.includes('博物馆') ||
    t.includes('museum')
  ) {
    return 'attraction'
  }
  if (
    t === 'restaurant' ||
    t === 'cafe' ||
    t.includes('restaurant') ||
    t.includes('cafe') ||
    t.includes('餐') ||
    t.includes('咖啡')
  ) {
    return 'food'
  }
  return 'other'
}

function placeDetailHardRules(kind: 'attraction' | 'food' | 'other', locale: Locale = getLocale()): string {
  const langRule = getLlmLanguageInstruction(locale)
  if (locale === 'en') {
    if (kind === 'attraction') {
      return englishPrompt('m11f0c42ee9', { p0: (langRule) })
    }
    if (kind === 'food') {
      return englishPrompt('m029c6ef9c4', { p0: (langRule) })
    }
    return englishPrompt('m3e8be33ef9', { p0: (langRule) })
  }

  if (kind === 'attraction') {
    return chinesePrompt('m970b2b322d', { p0: (langRule) })
  }
  if (kind === 'food') {
    return chinesePrompt('m0da3981a01', { p0: (langRule) })
  }
  return chinesePrompt('mc913de69a5', { p0: (langRule) })
}

function placeDetailExample(kind: 'attraction' | 'food' | 'other', locale: Locale = getLocale()): string {
  if (locale === 'en') {
    if (kind === 'attraction') {
      return englishPrompt('ma48c7b294e')
    }
    if (kind === 'food') {
      return englishPrompt('mf452114730')
    }
    return englishPrompt('mac66fe2b99')
  }

  if (kind === 'attraction') {
    return chinesePrompt('m4c94ca28c4')
  }
  if (kind === 'food') {
    return chinesePrompt('m16ddbfe9aa')
  }
  return chinesePrompt('mbd1e6193a7')
}

/** Rich place narrative for the detail popup (same structure as hotel). */
export async function generatePlaceDetailCopy(input: {
  name: string
  nameLocal?: string
  type: string
  address?: string
  existingDescription?: string
  listingDescription?: string
  stopNote?: string
  rating?: number
  reviewCount?: number
  priceLevel?: string
  cuisine?: string
  featuredReviews?: Array<{ text: string; rating?: number; author?: string }>
  nearbyStops?: Array<{ name: string; type: string }>
  day?: number
  dayTitle?: string
  dayTheme?: string
  dayPace?: string
  hotelArea?: string
  tripDays?: Array<{ day: number; title: string; pace: string; theme: string }>
  /** Progressive `intro` / `reason` while JSON streams (omit on cache hits). */
  onPartial?: (partial: { intro?: string; reason?: string }) => void
  signal?: AbortSignal
}): Promise<HotelDetailCopy | null> {
  if (!isLlmConfigured()) return null

  const activeLocale = getLocale()
  const kind = placeDetailKind(input.type)
  const system = buildPrompt(
    activeLocale === 'en'
      ? localizedCopy('m2b46e94290', undefined, 'en')
      : localizedCopy('m2b46e94290', undefined, 'zh-CN'),
    null,
    placeDetailHardRules(kind, activeLocale),
    jsonContract(
      '{ intro: "string", reason: "string", tripFit: "" }',
      placeDetailExample(kind, activeLocale),
    ),
  )
  const user = JSON.stringify({
    place: {
      name: input.name,
      nameLocal: input.nameLocal || '',
      type: input.type,
      address: input.address || '',
      existingDescription: input.existingDescription || '',
      listingDescription: input.listingDescription || '',
      stopNote: input.stopNote || '',
      rating: input.rating ?? null,
      reviewCount: input.reviewCount ?? null,
      priceLevel: input.priceLevel || '',
      cuisine: input.cuisine || '',
    },
    featuredReviews: (input.featuredReviews || []).slice(0, 6).map((review) => ({
      author: review.author || '',
      rating: review.rating ?? null,
      text: String(review.text || '').slice(0, 400),
    })),
    nearbyStops: input.nearbyStops || [],
    currentDay: {
      day: input.day || null,
      title: input.dayTitle || '',
      theme: input.dayTheme || '',
      pace: input.dayPace || '',
      hotelArea: input.hotelArea || '',
    },
    trip: input.tripDays || [],
  })

  let lastIntro = ''
  let lastReason = ''
  let text: string
  try {
    text = await callOpenAIMessagesStream(
      [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      {
        task: 'placeDetail',
        userText: input.name,
        signal: input.signal,
        onDelta: (_delta, fullText) => {
          if (!input.onPartial) return
          const intro =
            extractPartialJsonStringField(fullText, 'intro') ??
            extractPartialJsonStringField(fullText, 'description')
          const reason = extractPartialJsonStringField(fullText, 'reason')
          let changed = false
          if (intro != null && intro !== lastIntro) {
            lastIntro = intro
            changed = true
          }
          if (reason != null && reason !== lastReason) {
            lastReason = reason
            changed = true
          }
          if (!changed) return
          input.onPartial({
            intro: lastIntro || undefined,
            reason: lastReason || undefined,
          })
        },
      },
    )
  } catch {
    return null
  }

  if (!text) return null
  const parsed = extractJsonObject(text)
  if (!parsed) return null

  const intro = String(parsed.intro || parsed.description || '').trim()
  const reason = String(parsed.reason || '').trim()
  if (!intro && !reason) return null

  const result: HotelDetailCopy = {
    intro: intro || input.existingDescription || runtimeCopy4('m989d380323', { p0: (input.name) }),
    reason: reason || input.stopNote || runtimeCopy4('m9e46a5a4a2', undefined),
    tripFit: '',
  }
  if (
    input.onPartial &&
    (result.intro !== lastIntro || result.reason !== lastReason)
  ) {
    input.onPartial({ intro: result.intro, reason: result.reason })
  }
  return result
}

function fallbackDayCopy(input: {
  day: number
  pace: string
  placeNames: string[]
  totalDays?: number
  locale?: Locale
}): { title: string; theme: string; summary: string } {
  const locale = input.locale ?? getLocale()
  const isEn = locale === 'en'
  const separator = isEn ? ', ' : '、'
  const highlights = input.placeNames.slice(0, 3).join(separator)
  const lastDay = input.totalDays && input.totalDays > 0 ? input.totalDays : undefined

  let title: string
  if (isEn) {
    title =
      input.pace === 'park'
        ? englishPromptFragments('md43078bfa1')
        : input.pace === 'self-drive'
          ? englishPromptFragments('madd0c567bb')
          : input.day === 1
            ? englishPromptFragments('m51f63f0cb2')
            : lastDay != null && input.day === lastDay
              ? englishPromptFragments('md5775f34f9')
              : highlights.slice(0, 18) || `Day ${input.day}`
  } else {
    title =
      input.pace === 'park'
        ? runtimeCopy4('m0cb92ec098', undefined)
        : input.pace === 'self-drive'
          ? runtimeCopy4('mc1a13b1393', undefined)
          : input.day === 1
            ? runtimeCopy('m5985017e99', undefined)
            : lastDay != null && input.day === lastDay
              ? runtimeCopy4('m2a62487e50', undefined)
              : highlights.slice(0, 6) || runtimeCopy('m98cd75602d', { p0: (input.day) })
  }

  const theme = isEn ? localizedCopy('me9bb5d43cd', { p0: (input.pace) }, 'en') : localizedCopy('me9bb5d43cd', { p0: (input.pace) }, 'zh-CN')
  let summary: string
  if (isEn) {
    summary = highlights
      ? englishPrompt('m1e66d852e7', { p0: (highlights), p1: (input.placeNames.length > 3 ? englishPromptFragments('mddee2e5158') : '') })
      : englishPromptFragments('m0d987c8ee3')
  } else {
    summary = highlights
      ? runtimeCopy4('m713a3fee13', { p0: (highlights), p1: (input.placeNames.length > 3 ? '等' : '') })
      : runtimeCopy4('md6f624e596', undefined)
  }

  return {
    title,
    theme,
    summary,
  }
}

/** Day card headline + theme + summary, with a deterministic fallback. */
export async function generateDayCopy(input: {
  day: number
  pace: string
  placeNames: string[]
  hotelArea?: string
  /** Label for hotel district (e.g. 16区特罗卡德罗 / Trocadéro) */
  hotelAreaLabel?: string
  /** Calendar date for this itinerary day (YYYY-MM-DD), after timezone-aware start */
  calendarDate?: string
  /** Total daytime days in this itinerary (not a fixed 7) */
  totalDays?: number
  locale?: Locale
  signal?: AbortSignal
  onProgress?: (partial: { title?: string; theme?: string; summary?: string }) => void
}): Promise<{ title: string; theme: string; summary: string } | null> {
  const locale = input.locale ?? getLocale()
  const isEn = locale === 'en'

  if (!input.placeNames.length) {
    return {
      title: isEn ? localizedCopy('m284e918fd8', { p0: (input.day) }, 'en') : localizedCopy('m284e918fd8', { p0: (input.day) }, 'zh-CN'),
      theme: isEn ? localizedCopy('mc80f6ce28a', undefined, 'en') : localizedCopy('mc80f6ce28a', undefined, 'zh-CN'),
      summary: isEn
        ? localizedCopy('me73362652d', undefined, 'en')
        : localizedCopy('me73362652d', undefined, 'zh-CN'),
    }
  }

  const totalDays = input.totalDays && input.totalDays > 0 ? input.totalDays : undefined
  const hotelLabel = (input.hotelAreaLabel || input.hotelArea || '').trim()
  const key = `day-copy:${locale}:${input.day}|${totalDays || ''}|${input.calendarDate || ''}|${input.pace}|${hotelLabel}|${input.placeNames.join('>')}`
  return memoizeLlmCall(
    key,
    async () => {
      const lengthHint = isEn
        ? (totalDays ? englishPromptFragments('mb1c0493db3', { p0: (totalDays) }) : 'trip')
        : (totalDays ? runtimeCopy4('mc4a06175d3', { p0: (totalDays) }) : runtimeCopy4('md9860f81f5', undefined))

      const baseRule = isEn
        ? hotelLabel
          ? englishPrompt('mad09cceefb', { p0: (hotelLabel) })
          : englishPrompt('mb49430cb9e')
        : hotelLabel
          ? chinesePrompt('m7db260bb30', { p0: (hotelLabel) })
          : chinesePrompt('mae311b531c')

      const langRule = getLlmLanguageInstruction(locale)

      const system = isEn
        ? buildPrompt(
            englishPrompt('mdc265913e9', { p0: (lengthHint) }),
            null,
            langRule,
            englishPrompt('mb5c41cdc35'),
            baseRule,
            jsonContract(
              '{ title: "string", theme: "string", summary: "string" }',
              englishPrompt('mabb8b6b85f'),
              locale,
            ),
          )
        : buildPrompt(
            chinesePromptFragments('m8d21fe1d0c', { p0: (lengthHint) }),
            null,
            langRule,
            chinesePrompt('medefd579be'),
            baseRule,
            jsonContract(
              '{ title: "string", theme: "string", summary: "string" }',
              chinesePrompt('mabc3cd2cf5'),
              locale,
            ),
          )

      const user = JSON.stringify({
        day: input.day,
        totalDays: totalDays || null,
        calendarDate: input.calendarDate || null,
        pace: input.pace,
        hotelArea: input.hotelArea || '',
        hotelAreaLabel: hotelLabel || null,
        places: input.placeNames,
      })

      const onDelta = input.onProgress
        ? (_delta: string, fullText: string) => {
            const partial = parsePartialJson<{ title?: string; theme?: string; summary?: string }>(fullText)
            if (partial && typeof partial === 'object') {
              input.onProgress?.({
                title: typeof partial.title === 'string' ? partial.title : undefined,
                theme: typeof partial.theme === 'string' ? partial.theme : undefined,
                summary: typeof partial.summary === 'string' ? partial.summary : undefined,
              })
            }
          }
        : undefined

      const text = await generateText(system, user, {
        task: 'dayCopy',
        json: true,
        thinking: { enabled: false, effort: 'low' },
        preflight: false,
        signal: input.signal,
        onDelta,
        userText: input.placeNames.join(isEn ? ', ' : '、'),
      })
      if (!text) return fallbackDayCopy({ ...input, locale })

      const parsed = extractJsonObject(text)
      if (!parsed) return fallbackDayCopy({ ...input, locale })

      const rawTitle = String(parsed.title || '').trim()
      const theme = String(parsed.theme || '').trim()
      const summary = String(parsed.summary || '').trim()
      if (!rawTitle || !summary) return fallbackDayCopy({ ...input, locale })

      const title = rawTitle
        .slice(0, isEn ? 20 : 8)
        .replace(/\s*[&,，、·\-]\s*$/, '')
        .trim()

      return {
        title: title || rawTitle.slice(0, isEn ? 20 : 8),
        theme: theme || input.pace,
        summary,
      }
    },
    { durable: true },
  )
}

const RECOMMEND_TYPES: RecommendPlaceType[] = ['cafe', 'attraction', 'restaurant']

function toExcludeSet(names: string[]): Set<string> {
  return new Set(names.map((n) => n.toLowerCase().trim()).filter(Boolean))
}

function firstRowString(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = row[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function coerceRecommendType(
  raw: unknown,
  requestedTypes: RecommendPlaceType[],
  fallback: RecommendPlaceType,
): RecommendPlaceType {
  const value = String(raw || '').trim().toLowerCase()
  let resolved: RecommendPlaceType | null = null
  if (requestedTypes.includes(value as RecommendPlaceType)) {
    resolved = value as RecommendPlaceType
  } else if ([runtimeCopy('ma7e5deeeba', undefined, 'zh-CN'), '咖啡', 'coffee', 'bakery', 'brunch'].includes(value)) {
    resolved = 'cafe'
  } else if ([runtimeCopy('m5cf9828b5c', undefined, 'zh-CN'), '博物馆', 'museum', 'park'].includes(value)) {
    resolved = 'attraction'
  } else if ([runtimeCopy('m8eafe03b67', undefined, 'zh-CN'), '餐馆', '饭店', 'bistro', 'brasserie'].includes(value)) {
    resolved = 'restaurant'
  }
  if (resolved && requestedTypes.includes(resolved)) return resolved
  return fallback
}

function parseRecommendPayload(text: string): {
  parsed: unknown
  list: unknown[]
} {
  const obj = extractJsonObject(text)
  if (obj) {
    const list = extractPlaceRecommendationRows(obj)
    if (list.length) return { parsed: obj, list }
  }
  const partial = parsePartialJson<unknown>(text)
  if (partial != null) {
    const list = extractPlaceRecommendationRows(partial)
    if (list.length) return { parsed: partial, list }
  }
  return { parsed: obj ?? partial, list: [] }
}

/**
 * Recommend places for the current day via LLM only (no local fallback pool).
 */
export async function recommendPlacesForDay(input: {
  day: number
  title: string
  pace: string
  theme?: string
  hotelArea?: string
  currentPlaceNames: string[]
  tripPlaceNames?: string[]
  /** Extra names to avoid (e.g. previous recommendation batch) */
  excludeNames?: string[]
  /** Bump to ask for a fresh batch */
  batch?: number
  /** Generate only these tabs. Defaults to all three for backwards compatibility. */
  types?: RecommendPlaceType[]
  /** Number requested for each selected tab. */
  countPerType?: number
  /** Google-verified candidates. The model may rank/select but must not invent names. */
  verifiedCandidates: VerifiedPlaceCandidate[]
  recommendationPreferences: RecommendationPreferences
  locale?: Locale
  signal?: AbortSignal
  onProgress?: (partial: PlaceRecommendation[]) => void
}): Promise<PlaceRecommendation[]> {
  if (!isLlmConfigured()) return []

  const batch = Math.max(1, input.batch || 1)
  const requestedTypes = Array.from(
    new Set(
      (input.types?.length ? input.types : RECOMMEND_TYPES).filter((type) =>
        RECOMMEND_TYPES.includes(type),
      ),
    ),
  )
  const countPerType = Math.max(1, Math.min(6, input.countPerType || 4))
  if (!requestedTypes.length) return []
  const itineraryExclude = toExcludeSet([
    ...input.currentPlaceNames,
    ...(input.tripPlaceNames || []),
    ...(input.excludeNames || []),
  ])
  const locale = input.locale ?? getLocale()
  const isEn = locale === 'en'
  const langRule = getLlmLanguageInstruction(locale)

  const system = isEn
    ? buildPrompt(
        englishPrompt('ma4b954a567'),
        null,
        langRule,
        getCommonRules(locale),
        getPlaceResearchDiscipline(locale),
        getCafeVsRestaurantRule(locale),
        englishPrompt('m80eef28f3a', { p0: (langRule), p1: (countPerType), p2: (requestedTypes.length * countPerType), p3: (input.recommendationPreferences.avoidLouvreAndVersailles
            ? englishPromptFragments('m96b9c54e38')
            : englishPromptFragments('m37f03acf49')) }),
        jsonContract(
          '{ recommendations: [{ name, googlePlaceId?, nameLocal?, type: "cafe|attraction|restaurant", reason, intro, area? }] }',
          englishPrompt('mefa84e5d3e'),
          locale,
        ),
      )
    : buildPrompt(
        chinesePromptFragments('m44da01c4d1'),
        null,
        langRule,
        getCommonRules(locale),
        getPlaceResearchDiscipline(locale),
        getCafeVsRestaurantRule(locale),
        chinesePrompt('md8c13f4cc6', { p0: (countPerType), p1: (requestedTypes.length * countPerType), p2: (input.recommendationPreferences.avoidLouvreAndVersailles
            ? chinesePromptFragments('m3ce5c77592')
            : chinesePromptFragments('m96ff8bc2e3')) }),
        jsonContract(
          '{ recommendations: [{ name, googlePlaceId?, nameLocal?, type: "cafe|attraction|restaurant", reason, intro, area? }] }',
          chinesePrompt('m2703776c41'),
          locale,
        ),
      )
  const user = JSON.stringify({
    day: input.day,
    title: input.title,
    pace: input.pace,
    theme: input.theme || '',
    hotelArea: input.hotelArea || '',
    alreadyOnThisDay: input.currentPlaceNames,
    alreadyOnTrip: input.tripPlaceNames || [],
    avoidAlso: input.excludeNames || [],
    batch,
    requestedTypes,
    countPerType,
    verifiedCandidates: input.verifiedCandidates,
    recommendationPreferences: recommendationPreferencesPrompt(
      input.recommendationPreferences,
    ),
  })

  const verifiedById = new Map(
    input.verifiedCandidates
      .filter((candidate) => candidate.id)
      .map((candidate) => [candidate.id!, candidate]),
  )
  const verifiedByName = new Map(
    input.verifiedCandidates.map((candidate) => [
      candidate.name.trim().toLowerCase(),
      candidate,
    ]),
  )

  const sanitizeRecommendations = (rawList: unknown[]): PlaceRecommendation[] => {
    const outList: PlaceRecommendation[] = []
    const seen = new Set<string>()
    const typeCounts: Record<RecommendPlaceType, number> = {
      attraction: 0,
      cafe: 0,
      restaurant: 0,
    }
    for (const item of rawList) {
      if (!item || typeof item !== 'object') continue
      const row = item as Record<string, unknown>
      const proposedName = firstRowString(row, ['name', '名称', '店名', '地名', 'placeName'])
      const proposedId = firstRowString(row, ['googlePlaceId', 'placeId', 'place_id'])
      const verified =
        (proposedId ? verifiedById.get(proposedId) : undefined) ||
        verifiedByName.get(proposedName.toLowerCase())
      const name = verified ? verified.name : proposedName
      if (!name) continue
      const key = name.toLowerCase()
      if (itineraryExclude.has(key) || seen.has(key)) continue
      const type = verified
        ? verified.type
        : coerceRecommendType(row.type ?? row.类型 ?? row.category, requestedTypes, requestedTypes[0])
      if (!requestedTypes.includes(type) || typeCounts[type] >= countPerType) continue
      const reason = firstRowString(row, ['reason', '理由', runtimeCopy('m56741142db', undefined, 'zh-CN')]) ||
        (isEn ? localizedCopy('m9e8dbfa115', undefined, 'en') : localizedCopy('m9e8dbfa115', undefined, 'zh-CN'))
      const intro =
        firstRowString(row, ['intro', 'description', '介绍', runtimeCopy('m5ea2e0cde2', undefined, 'zh-CN')]) || reason
      seen.add(key)
      typeCounts[type] += 1
      outList.push({
        googlePlaceId: verified?.id || (proposedId || undefined),
        name,
        nameLocal:
          firstRowString(row, ['nameLocal', 'localName', '中文名']) || undefined,
        type,
        reason,
        intro: intro || reason,
        area:
          firstRowString(row, ['area', '区域', '地区']) ||
          (verified?.address || '').trim() ||
          undefined,
      })
    }
    return outList
  }

  const onDelta = input.onProgress
    ? (_delta: string, fullText: string) => {
        const { list: rawList } = parseRecommendPayload(fullText)
        if (rawList.length > 0) {
          const partialList = sanitizeRecommendations(rawList)
          if (partialList.length > 0) {
            input.onProgress?.(partialList)
          }
        }
      }
    : undefined

  const text = await generateText(system, user, {
    strict: true,
    task: 'placeRecommend',
    json: true,
    webSearch: false,
    signal: input.signal,
    onDelta,
    preflightContext: {
      day: input.day,
      types: input.types,
      candidateCount: input.verifiedCandidates.length,
    },
    userText: [input.title, input.theme, input.pace].filter(Boolean).join(' '),
  })
  if (!text) {
    throw new LlmRequestError(runtimeCopy3('mdf0d7fdbeb', undefined))
  }

  const { parsed, list } = parseRecommendPayload(text)
  if (!Array.isArray(list) || !list.length) {
    const looksTruncated =
      parsed == null && (text.includes('"recommendations"') || /```/.test(text) || text.includes('{'))
    throw new LlmRequestError(
      looksTruncated
        ? runtimeCopy3('mefb0668812', undefined)
        : runtimeCopy3('m2d37ad6434', undefined),
    )
  }

  return sanitizeRecommendations(list)
}
