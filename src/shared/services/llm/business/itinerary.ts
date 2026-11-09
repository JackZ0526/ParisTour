import { stopCardIntroCopy } from '../../../i18n/copy/stopCardIntro'
import { openingWindows } from '../../../../features/place/services/openingAvailability'
import { openingCopy } from '../../../i18n/copy/openingAvailability'
import { englishPromptFragments, chinesePromptFragments } from '../../../i18n/prompts/itinerary-fragments-146f65'
import { runtimeCopy4 } from '../../../i18n/copy/itinerary-runtime4-146f65'
import { englishPrompt, chinesePrompt } from '../../../i18n/prompts/itinerary-146f65'
import { translationDirection } from '../../../i18n/languageNames'
import { runtimeCopy3 } from '../../../i18n/copy/itinerary-runtime3-146f65'
import { runtimeCopy } from '../../../i18n/copy/itinerary-runtime-146f65'
import { localizedCopy } from '../../../i18n/copy/itinerary-146f65'
/**
 * LLM call sites for itinerary generation (start / full / single-day).
 *
 * Owns the type contracts for itinerary drafts (the actual public shapes
 * callers import from `llm.ts`; `types.ts` has older/different shapes
 * left over from earlier refactors — this module is the source of truth).
 */
import type { DayPlan, FlightInfo, Pace, Transport, WalkLevel } from '../../../../types'
import {
  getCafeVsRestaurantRule,
  getCommonRules,
  getPlaceResearchDiscipline,
  buildPrompt,
  jsonContract,
} from '../prompts'
import { LlmRequestError } from '../errors'
import { extractJsonObject } from '../json'
import { parsePartialJson } from '../stream'
import {
  recommendationPreferencesPrompt,
  type RecommendationPreferences,
} from '../../../../features/place/services/recommendationPreferences'
import type { VerifiedPlaceCandidate } from '../types'
import { generateText, isLlmConfigured } from './_service'
import { getLocale, getLlmLanguageInstruction, type Locale } from '../../../i18n'

// ── Public types (also re-exported from llm.ts) ──────────────────────────

export interface ItineraryStartInput {
  tripStartDate: string
  tripEndDate?: string | null
  destination?: string
  hotelName?: string | null
  outbound: {
    flightNumber: string
    airline?: string
    from?: FlightInfo['from']
    to?: FlightInfo['to']
    duration?: string
    status?: string
    rawNote?: string
  }
  returnFlight?: ItineraryStartInput['outbound'] | null
}

export interface ItineraryStartResult {
  /** Paris local arrival calendar date YYYY-MM-DD */
  arrivalDateParis: string
  /** Paris local arrival time if known, e.g. 14:35 */
  arrivalTimeParis?: string
  /** Calendar date that itinerary Day 1 should map to */
  itineraryStartDate: string
  /** True when Day 1 stays on trip startDate */
  startsOnTripStartDate: boolean
  /** Short Chinese explanation for the itinerary section */
  reasonZh: string
}

export interface FullItineraryPlaceDraft {
  key: string
  googlePlaceId?: string
  /** Google formatted address copied from the verified candidate, never authored by the model. */
  googleAddress?: string
  name: string
  nameLocal?: string
  type: PlaceTypeForItinerary
  area?: string
  description?: string
  ratingHint?: string
  durationHint?: string
}

export type PlaceTypeForItinerary =
  | 'cafe'
  | 'attraction'
  | 'restaurant'
  | 'transport'
  | 'hotel'

export interface FullItineraryStopDraft {
  time: string
  placeKey: string
  note: string
  transport?: Transport
  walkLevel?: WalkLevel
  duration?: string
}

function normalizeTransportChoice(value: unknown): Transport | undefined {
  const text = String(value || '').trim()
  if (!text) return undefined
  return /walk|walking|步行|走路|步走/i.test(text) ? 'walking' : 'transit'
}

const LEGACY_WALK_LEVEL: Record<string, WalkLevel> = {
  很少走: 'minimal',
  短步行: 'short',
  中等步行: 'moderate',
}
const KNOWN_WALK_LEVEL_CODES = new Set<WalkLevel>(['minimal', 'short', 'moderate'])
function normalizeWalkLevel(value: unknown): WalkLevel {
  const text = String(value || '').trim()
  if (!text) return 'short'
  const code = LEGACY_WALK_LEVEL[text] ?? (text as WalkLevel)
  if (KNOWN_WALK_LEVEL_CODES.has(code)) return code
  return 'short'
}

const LEGACY_PACE: Record<string, Pace> = {
  轻松: 'relaxed',
  适中: 'moderate',
  乐园日: 'park',
  自驾日: 'self-drive',
}
const KNOWN_PACE_CODES = new Set<Pace>(['relaxed', 'moderate', 'park', 'self-drive'])
function normalizePace(value: unknown): Pace {
  const text = String(value || 'moderate').trim() || 'moderate'
  const code = LEGACY_PACE[text] ?? (text as Pace)
  if (KNOWN_PACE_CODES.has(code)) return code
  if (/disney|迪士尼|乐园/i.test(text)) return 'park'
  if (/自驾/i.test(text)) return 'self-drive'
  if (/轻松|relaxed/i.test(text)) return 'relaxed'
  return 'moderate'
}

export interface FullItineraryDayDraft {
  day: number
  title: string
  theme: string
  pace: Pace
  summary: string
  metroHintFromArea?: Record<string, string>
  stops: FullItineraryStopDraft[]
}

export interface FullItineraryDraft {
  days: FullItineraryDayDraft[]
  places: FullItineraryPlaceDraft[]
}

export interface GenerateFullItineraryInput {
  destination: string
  dayCount: number
  tripStartDate: string
  tripEndDate: string
  itineraryStartDate: string
  nights?: number
  /** Optional abort signal to cancel / time out the in-flight LLM call. */
  signal?: AbortSignal
  hotel: {
    name: string
    address: string
    area?: string
    areaKey?: string
    lat: number
    lng: number
    nearestMetro?: string
  }
  outbound?: {
    flightNumber: string
    airline?: string
    from?: FlightInfo['from']
    to?: FlightInfo['to']
    duration?: string
    status?: string
    rawNote?: string
  } | null
  returnFlight?: {
    flightNumber: string
    airline?: string
    from?: FlightInfo['from']
    to?: FlightInfo['to']
    duration?: string
    status?: string
    rawNote?: string
  } | null
  preferences?: string
  recommendationPreferences: RecommendationPreferences
  verifiedCandidates: VerifiedPlaceCandidate[]
}

export interface OccupiedPlaceBrief {
  day: number
  name: string
  placeId?: string
  type?: string
}

export interface GenerateSingleDayItineraryInput {
  openingRepair?: { rejectedVisits: Array<{ name: string; time: string; duration?: string; openingWindows: string[] | null }> }
  /** Compact IDs-only plan; descriptions and source fields are hydrated locally. */
  compact?: boolean
  destination: string
  dayCount: number
  dayNumber: number
  calendarDate?: string
  tripStartDate: string
  tripEndDate: string
  itineraryStartDate: string
  nights?: number
  /** Optional abort signal to cancel / time out the in-flight LLM call. */
  signal?: AbortSignal
  hotel: GenerateFullItineraryInput['hotel']
  outbound?: GenerateFullItineraryInput['outbound']
  returnFlight?: GenerateFullItineraryInput['returnFlight']
  /** Places already used on other days — avoid duplicates. */
  occupiedPlaces: OccupiedPlaceBrief[]
  preferences?: string
  recommendationPreferences: RecommendationPreferences
  verifiedCandidates: VerifiedPlaceCandidate[]
  /** Fired as soon as streaming JSON exposes title/theme. */
  onDayPreview?: (preview: { day: number; title?: string; theme?: string }) => void
}

export interface SingleDayItineraryDraft {
  day: FullItineraryDayDraft
  places: FullItineraryPlaceDraft[]
}

// ── Helpers (date math) ──────────────────────────────────────────────────

function normalizeIsoDate(value: unknown): string | null {
  const raw = String(value || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null
  const d = new Date(`${raw}T12:00:00`)
  if (Number.isNaN(d.getTime())) return null
  return raw
}

function formatZhMonthDay(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00`)
  if (Number.isNaN(d.getTime())) return isoDate
  return runtimeCopy('mb33f8fa7f5', { p0: (d.getMonth() + 1), p1: (d.getDate()) })
}

function addCalendarDays(isoDate: string, amount: number): string {
  const d = new Date(`${isoDate}T12:00:00`)
  d.setDate(d.getDate() + amount)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function timestampDate(value: string | undefined): string | null {
  return normalizeIsoDate(value?.match(/\d{4}-\d{2}-\d{2}/)?.[0])
}

function timestampTime(value: string | undefined): string | undefined {
  return value?.match(/(?:T|\s)([01]\d|2[0-3]):([0-5]\d)/)?.slice(1, 3).join(':')
}

function durationHours(value: string | undefined): number | null {
  if (!value) return null
  const hour = Number(value.match(/(\d+(?:\.\d+)?)\s*(?:h|小时)/i)?.[1] || 0)
  const minute = Number(value.match(/(\d+)\s*(?:m|min|分钟)/i)?.[1] || 0)
  const total = hour + minute / 60
  return total > 0 ? total : null
}

/** Deterministic fallback: never invent a flight schedule. */
function fallbackItineraryStart(
  tripStartDate: string,
  outbound: ItineraryStartInput['outbound'],
  tripEndDate?: string | null,
): ItineraryStartResult {
  const arrivalStamp = outbound.to?.actual || outbound.to?.scheduled
  const departureStamp = outbound.from?.actual || outbound.from?.scheduled
  const explicitArrivalDate = timestampDate(arrivalStamp)
  const departureDate = timestampDate(departureStamp)
  const hours = durationHours(outbound.duration)
  let arrivalDateParis = explicitArrivalDate || tripStartDate
  if (!explicitArrivalDate && departureDate && hours != null) {
    const departureTime = timestampTime(departureStamp) || '00:00'
    const [hh, mm] = departureTime.split(':').map(Number)
    const crossesCalendarDay = hh + mm / 60 + hours >= 24
    arrivalDateParis = addCalendarDays(departureDate, crossesCalendarDay ? 1 : 0)
  }
  const end = normalizeIsoDate(tripEndDate)
  if (end && arrivalDateParis > end) {
    arrivalDateParis = end
  }
  const startsOnTripStartDate = arrivalDateParis === tripStartDate
  return {
    arrivalDateParis,
    arrivalTimeParis: timestampTime(arrivalStamp),
    itineraryStartDate: arrivalDateParis,
    startsOnTripStartDate,
    reasonZh: startsOnTripStartDate
      ? runtimeCopy4('m4af69d006b', { p0: (formatZhMonthDay(arrivalDateParis)) })
      : explicitArrivalDate
        ? runtimeCopy4('m61cbf8ddcd', { p0: (formatZhMonthDay(arrivalDateParis)) })
        : runtimeCopy4('mc54655d63b', { p0: (formatZhMonthDay(arrivalDateParis)) }),
  }
}

function seasonForDate(isoDate: string, locale: Locale = 'zh-CN'): string {
  const month = Number(isoDate.slice(5, 7))
  if (locale === 'en') {
    if (month === 12 || month <= 2) return 'winter'
    if (month <= 5) return 'spring'
    if (month <= 8) return 'summer'
    return 'autumn'
  }
  if (month === 12 || month <= 2) return runtimeCopy('mc63d5b7467', undefined, locale)
  if (month <= 5) return runtimeCopy('m58ecc8701f', undefined, locale)
  if (month <= 8) return runtimeCopy('m76e4fbe256', undefined, locale)
  return runtimeCopy('mce4e99b183', undefined, locale)
}

/**
 * Build the locale-specific role + hard_rules for the full-itinerary
 * generator. The day count, user preferences, and disney day are inlined
 * by the caller; everything else is the locale-appropriate template.
 */
export function buildFullItineraryPrompt(
  n: number,
  prefs: RecommendationPreferences,
  disneyDay: number | null,
  destination: string,
  season: string,
  locale: Locale,
): { role: string; hardRules: string; outputFormat: string; jsonShape: string; jsonExample: string } {
  if (locale === 'en') {
    return {
      role: englishPrompt('m0be6815d6e', { p0: (destination), p1: (season) }),
      hardRules: englishPrompt('mb7a0a90764', { p0: (n), p1: (n), p2: (prefs.preferCafeStart
          ? englishPromptFragments('m7cc3fa5b6d')
          : englishPromptFragments('m3006f55b55')), p3: (disneyDay
          ? localizedCopy('disneyRequired', { p0: (disneyDay) }, 'en')
          : localizedCopy('me217445c10', undefined, 'en')), p4: (prefs.includeChampsAndArc
          ? englishPromptFragments('mbc6c7f1431')
          : englishPromptFragments('mbd8d7f7467')), p5: (prefs.dayStartTime), p6: (prefs.preferLunchAndDinner
          ? englishPromptFragments('ma81432d4a4')
          : englishPromptFragments('m0884b45a37')), p7: (prefs.preferLowWalking
          ? englishPromptFragments('m9dbc30a490')
          : englishPromptFragments('m6983aa22f1')), p8: (prefs.avoidLouvreAndVersailles
          ? englishPromptFragments('m1345d16985')
          : englishPromptFragments('m1f3b1cacd2')) }),
      outputFormat: englishPrompt('m7804c2f1aa'),
      jsonShape: '{ places: [{ key, googlePlaceId, name, nameLocal?, type: "cafe|attraction|restaurant|transport|hotel", area?, description, durationHint? }], days: [{ day, title, theme, pace: "relaxed|moderate|park|self-drive", summary, metroHintFromArea: { custom: "string" }, stops: [{ time: "HH:MM", placeKey, note, transport?: "transit|walking", walkLevel: "minimal|short|moderate", duration? }] }] }',
      jsonExample: englishPrompt('m29e654246f'),
    }
  }
  // Chinese (default)
  return {
    role: chinesePromptFragments('mcd7467f666', { p0: (destination), p1: (season) }),
    hardRules: chinesePrompt('m8db34c3703', { p0: (n), p1: (n), p2: (prefs.preferCafeStart
        ? chinesePromptFragments('m4bc04a8a66')
        : chinesePromptFragments('md2ce2d3868')), p3: (disneyDay
        ? chinesePromptFragments('m566b63729b', { p0: (disneyDay) })
        : chinesePromptFragments('m6bcce49c37')), p4: (prefs.includeChampsAndArc
        ? chinesePromptFragments('m975fff2af8')
        : chinesePromptFragments('m6989a610a4')), p5: (prefs.dayStartTime), p6: (prefs.preferLunchAndDinner
        ? chinesePromptFragments('m314c318245')
        : chinesePromptFragments('mcaf6738894')), p7: (prefs.preferLowWalking
        ? chinesePromptFragments('mefd4b93896')
        : chinesePromptFragments('m8f5450803c')), p8: (prefs.avoidLouvreAndVersailles
        ? chinesePromptFragments('mbd01ca4386')
        : chinesePromptFragments('m63cc2fb15d')) }),
    outputFormat: chinesePromptFragments('mcc1eb6756c'),
    jsonShape: '{ places: [{ key, googlePlaceId, name, nameLocal?, type: "cafe|attraction|restaurant|transport|hotel", area?, description, durationHint? }], days: [{ day, title, theme, pace: "relaxed|moderate|park|self-drive", summary, metroHintFromArea: { custom: "string" }, stops: [{ time: "HH:MM", placeKey, note, transport?: "transit|walking", walkLevel: "minimal|short|moderate", duration? }] }] }',
    jsonExample: chinesePrompt('mc84ea44827'),
  }
}

/**
 * Build the locale-specific role + roleRules for the single-day regen
 * generator. The "role" branch (arrival / return / disney / mid) is
 * decided by the caller; we just translate each branch.
 */
export function buildSingleDayRoleRules(
  dayNumber: number,
  disneyDay: number | null,
  prefs: RecommendationPreferences,
  isFirst: boolean,
  isLast: boolean,
  isDisney: boolean,
  locale: Locale,
): string[] {
  if (locale === 'en') {
    if (isFirst) {
      return [
        englishPrompt('m0e5ecf3374'),
        englishPrompt('m7dde5e9476'),
        englishPrompt('m9c6972526b'),
        disneyDay != null
          ? englishPrompt('m4fa84a239c', { p0: (disneyDay) })
          : englishPromptFragments('m7b5a1f810b'),
      ]
    }
    if (isLast) {
      return [
        englishPrompt('m5c851e4eff'),
        englishPrompt('m6389f0057c'),
        disneyDay != null
          ? englishPrompt('m4fa84a239c', { p0: (disneyDay) })
          : englishPromptFragments('m7b5a1f810b'),
      ]
    }
    if (isDisney) {
      return [
        englishPrompt('m06d9fffd97', { p0: (dayNumber) }),
      ]
    }
    return [
      englishPrompt('ma425546efb'),
      disneyDay != null
        ? englishPrompt('md1a2840ead', { p0: (disneyDay) })
        : englishPromptFragments('m7b5a1f810b'),
      prefs.preferCafeStart
        ? englishPrompt('mba0a9f34c0')
        : englishPromptFragments('m3006f55b55'),
      prefs.preferLunchAndDinner
        ? englishPrompt('m622cbbe12b')
        : englishPromptFragments('mee31a150fd'),
      prefs.includeChampsAndArc
        ? englishPrompt('m136f8d31ae')
        : englishPrompt('mbd8d7f7467'),
    ]
  }
  // Chinese (default)
  if (isFirst) {
    return [
      chinesePrompt('m9feae861e0'),
      chinesePrompt('m867b85a7f6'),
      chinesePromptFragments('m326725c072'),
      disneyDay != null
        ? chinesePromptFragments('m97edffa19f', { p0: (disneyDay) })
        : chinesePromptFragments('maaeef7238f'),
    ]
  }
  if (isLast) {
    return [
      chinesePrompt('m96c37fa0a5'),
      chinesePrompt('m6ca5e514a9'),
      disneyDay != null
        ? chinesePromptFragments('m97edffa19f', { p0: (disneyDay) })
        : chinesePromptFragments('maaeef7238f'),
    ]
  }
  if (isDisney) {
    return [
      chinesePrompt('m6c106d148a', { p0: (dayNumber) }),
    ]
  }
  return [
    chinesePrompt('m1391b30038'),
    disneyDay != null
      ? chinesePrompt('m915f772a57', { p0: (disneyDay) })
      : chinesePromptFragments('maaeef7238f'),
    prefs.preferCafeStart
      ? chinesePrompt('m7925c596e3')
      : chinesePromptFragments('md2ce2d3868'),
    prefs.preferLunchAndDinner
      ? chinesePromptFragments('m1cd39fe1a2')
      : chinesePromptFragments('mb0d8375c00'),
    prefs.includeChampsAndArc
      ? chinesePrompt('m3cd1f9d816')
      : chinesePromptFragments('m36cd58f391'),
  ]
}

// ── resolveItineraryStart ────────────────────────────────────────────────

/** Synchronous resolution of itinerary start from structured flight timestamps. */
export function resolveItineraryStartSync(
  input: ItineraryStartInput,
): ItineraryStartResult | null {
  const start = input.tripStartDate?.trim()
  if (!start || !input.outbound?.flightNumber) return null
  return fallbackItineraryStart(start, input.outbound, input.tripEndDate)
}

/** Resolve the itinerary start only from structured flight timestamps. */
export async function resolveItineraryStart(
  input: ItineraryStartInput,
): Promise<ItineraryStartResult | null> {
  return resolveItineraryStartSync(input)
}

// ── generateFullItinerary ────────────────────────────────────────────────

/**
 * Generate a complete multi-day Paris itinerary as structured JSON.
 * Caller resolves place names via Google Places and persists the result.
 */
export async function generateFullItinerary(
  input: GenerateFullItineraryInput,
): Promise<FullItineraryDraft> {
  if (!isLlmConfigured()) {
    const locale = getLocale()
    throw new LlmRequestError(
      locale === 'en'
        ? localizedCopy('m3eb4a7227f', undefined, 'en')
        : localizedCopy('m3eb4a7227f', undefined, 'zh-CN'),
      'missing_key',
    )
  }

  const n = Math.max(1, Math.min(30, Math.floor(input.dayCount) || 1))
  const prefs = input.recommendationPreferences
  const disneyDay = prefs.includeDisneyDay && n >= 3 ? n - 1 : null
  const locale = getLocale()
  const isEn = locale === 'en'
  const hotelArea =
    input.hotel.area ||
    input.hotel.areaKey ||
    (isEn ? localizedCopy('m412dec02ce', undefined, 'en') : localizedCopy('m412dec02ce', undefined, 'zh-CN'))

  const { role, hardRules, outputFormat, jsonShape, jsonExample } = buildFullItineraryPrompt(
    n,
    prefs,
    disneyDay,
    input.destination || (isEn ? localizedCopy('maf2071f42c', undefined, 'en') : localizedCopy('maf2071f42c', undefined, 'zh-CN')),
    seasonForDate(input.itineraryStartDate, locale),
    locale,
  )
  const langRule = getLlmLanguageInstruction(locale)

  const system = buildPrompt(
    role,
    null,
    langRule,
    getCommonRules(locale),
    getPlaceResearchDiscipline(locale),
    getCafeVsRestaurantRule(locale),
    stopCardIntroCopy('rules', undefined, locale),
    `<output_format>${outputFormat}</output_format>`,
    hardRules,
    jsonContract(jsonShape, jsonExample, locale),
  )

  const user = JSON.stringify({
    trip: {
      destination: input.destination || (isEn ? localizedCopy('mde73486121', undefined, 'en') : localizedCopy('mde73486121', undefined, 'zh-CN')),
      dayCount: n,
      nights: input.nights ?? Math.max(0, n - 1),
      tripStartDate: input.tripStartDate,
      tripEndDate: input.tripEndDate,
      itineraryStartDate: input.itineraryStartDate,
      explicitRequest: input.preferences || null,
      recommendationPreferences: recommendationPreferencesPrompt(prefs, { locale }),
    },
    hotel: {
      name: input.hotel.name,
      address: input.hotel.address,
      area: hotelArea,
      areaKey: input.hotel.areaKey || null,
      lat: input.hotel.lat,
      lng: input.hotel.lng,
      nearestMetro: input.hotel.nearestMetro || null,
    },
    outboundFlight: input.outbound || null,
    returnFlight: input.returnFlight || null,
    verifiedCandidates: input.verifiedCandidates,
  })

  const text = await generateText(system, user, {
    strict: true,
    task: 'itineraryGenerate',
    json: true,
    // DeepSeek Responses: expose web_search; model decides (tool_choice auto).
    // OpenAI chat path still skips generic research injection for this task.
    webSearch: 'auto',
    signal: input.signal,
    preflightContext: {
      destination: input.destination,
      dayCount: input.dayCount,
      recommendationPreferences: input.recommendationPreferences,
    },
    userText: input.preferences || input.destination,
  })
  if (!text) {
    throw new LlmRequestError(runtimeCopy3('m8026eb273e', undefined))
  }

  const parsed = extractJsonObject(text)
  if (!parsed) {
    throw new LlmRequestError(
      runtimeCopy3('md6d3cb1805', { p0: (text.slice(0, 240).replace(/\s+/g, ' ')) }),
      'invalid_json',
    )
  }

  const rawPlaces = Array.isArray(parsed.places) ? (parsed.places as unknown[]) : []
  const rawDays = Array.isArray(parsed.days) ? (parsed.days as unknown[]) : []
  if (!rawDays.length) {
    throw new LlmRequestError(
      runtimeCopy3('m4897c42c42', { p0: (Object.keys(parsed).join(',') || '(none)') }),
      'invalid_json',
    )
  }

  const places: FullItineraryPlaceDraft[] = []
  const seenKeys = new Set<string>()
  const candidatesById = new Map(
    input.verifiedCandidates
      .filter((candidate) => candidate.id)
      .map((candidate) => [candidate.id as string, candidate]),
  )
  const candidatesByName = new Map(
    input.verifiedCandidates.map((candidate) => [candidate.name.toLowerCase(), candidate]),
  )
  for (const item of rawPlaces) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const key = String(row.key || row.id || '').trim()
    const proposedName = String(row.name || '').trim()
    const proposedId = String(row.googlePlaceId || '').trim()
    const verified =
      candidatesById.get(proposedId) ||
      candidatesByName.get(proposedName.toLowerCase())
    if (!key || !verified?.id || seenKeys.has(key)) continue
    seenKeys.add(key)
    const typeRaw = verified.type
    let type: PlaceTypeForItinerary = 'attraction'
    if (typeRaw.includes('cafe') || typeRaw.includes('coffee')) type = 'cafe'
    else if (typeRaw.includes('restaurant') || typeRaw.includes('food')) type = 'restaurant'
    else if (typeRaw.includes('hotel')) type = 'hotel'
    else if (typeRaw.includes('transport') || typeRaw.includes('airport')) type = 'transport'
    places.push({
      key,
      googlePlaceId: verified.id,
      googleAddress: /^ChI/i.test(verified.id)
        ? verified.address
        : undefined,
      name: verified.name,
      nameLocal: String(row.nameLocal || '').trim() || undefined,
      type,
      area: verified.address || String(row.area || '').trim() || undefined,
      description: String(row.description || '').trim() || undefined,
      durationHint: String(row.durationHint || '').trim() || undefined,
    })
  }

  const days: FullItineraryDayDraft[] = []
  for (const item of rawDays) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const dayNum = Number(row.day)
    if (!Number.isFinite(dayNum) || dayNum < 1) continue
    const stopsRaw = Array.isArray(row.stops) ? (row.stops as unknown[]) : []
    const stops: FullItineraryStopDraft[] = []
    for (const s of stopsRaw) {
      if (!s || typeof s !== 'object') continue
      const stop = s as Record<string, unknown>
      const placeKey = String(stop.placeKey || stop.placeId || '').trim()
      if (!placeKey) continue
      const isSpecial = [
        'hotel-selected',
        'attr-disney',
        'attr-cdg',
        'attr-champs',
        'attr-arc',
      ].includes(placeKey)
      if (!isSpecial && !seenKeys.has(placeKey)) continue
      stops.push({
        time: String(stop.time || '10:00').trim() || '10:00',
        placeKey,
        note: String(stop.note || '').trim() || runtimeCopy('mb36f1f6772', undefined),
        transport: normalizeTransportChoice(stop.transport),
        walkLevel: normalizeWalkLevel(stop.walkLevel),
        duration: String(stop.duration || '').trim() || undefined,
      })
    }
    const pace: FullItineraryDayDraft['pace'] = normalizePace(row.pace)

    const metro =
      row.metroHintFromArea && typeof row.metroHintFromArea === 'object'
        ? (row.metroHintFromArea as Record<string, string>)
        : { custom: runtimeCopy3('m4f6b1c05b6', undefined) }

    const rawTitle = String(row.title || runtimeCopy('m98cd75602d', { p0: (dayNum) })).trim()
    const cleanTitle = rawTitle.slice(0, 20).replace(/\s*[&,，、·\-]\s*$/, '').trim()
    days.push({
      day: dayNum,
      title: cleanTitle || rawTitle.slice(0, 20),
      theme: String(row.theme || '').trim() || runtimeCopy('me3c015188d', undefined),
      pace,
      summary: String(row.summary || '').trim() || runtimeCopy('m0e4c137d43', undefined),
      metroHintFromArea: metro,
      stops,
    })
  }

  if (!days.length) {
    throw new LlmRequestError(runtimeCopy3('mff20f6c2d9', undefined))
  }

  return { days, places }
}

// ── generateSingleDayItinerary ───────────────────────────────────────────

function parseItineraryPlaces(
  rawPlaces: unknown[],
  verifiedCandidates: VerifiedPlaceCandidate[],
): FullItineraryPlaceDraft[] {
  const places: FullItineraryPlaceDraft[] = []
  const seenKeys = new Set<string>()
  const byId = new Map(
    verifiedCandidates
      .filter((candidate) => candidate.id)
      .map((candidate) => [candidate.id as string, candidate]),
  )
  const byName = new Map(
    verifiedCandidates.map((candidate) => [candidate.name.toLowerCase(), candidate]),
  )
  for (const item of rawPlaces) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const key = String(row.key || row.id || '').trim()
    const proposedName = String(row.name || '').trim()
    const proposedId = String(row.googlePlaceId || '').trim()
    const verified = byId.get(proposedId) || byName.get(proposedName.toLowerCase())
    if (!key || !verified?.id || seenKeys.has(key)) continue
    seenKeys.add(key)
    const typeRaw = verified.type
    let type: PlaceTypeForItinerary = 'attraction'
    if (typeRaw.includes('cafe') || typeRaw.includes('coffee')) type = 'cafe'
    else if (typeRaw.includes('restaurant') || typeRaw.includes('food')) type = 'restaurant'
    else if (typeRaw.includes('hotel')) type = 'hotel'
    else if (typeRaw.includes('transport') || typeRaw.includes('airport')) type = 'transport'
    places.push({
      key,
      googlePlaceId: verified.id,
      googleAddress: /^ChI/i.test(verified.id)
        ? verified.address
        : undefined,
      name: verified.name,
      nameLocal: String(row.nameLocal || '').trim() || undefined,
      type,
      area: verified.address || String(row.area || '').trim() || undefined,
      description: String(row.description || '').trim() || undefined,
      durationHint: String(row.durationHint || '').trim() || undefined,
    })
  }
  return places
}

function parseItineraryDay(
  row: Record<string, unknown>,
  fallbackDay: number,
): FullItineraryDayDraft | null {
  const dayNum = Number(row.day)
  const day = Number.isFinite(dayNum) && dayNum >= 1 ? dayNum : fallbackDay
  const stopsRaw = Array.isArray(row.stops) ? (row.stops as unknown[]) : []
  const stops: FullItineraryStopDraft[] = []
  for (const s of stopsRaw) {
    if (!s || typeof s !== 'object') continue
    const stop = s as Record<string, unknown>
    const placeKey = String(stop.placeKey || stop.placeId || '').trim()
    if (!placeKey) continue
    stops.push({
      time: String(stop.time || '10:00').trim() || '10:00',
      placeKey,
      note: String(stop.note || '').trim() || runtimeCopy('mb36f1f6772', undefined),
      transport: normalizeTransportChoice(stop.transport),
      walkLevel: normalizeWalkLevel(stop.walkLevel),
      duration: String(stop.duration || '').trim() || undefined,
    })
  }
  if (!stops.length) return null

  const pace: FullItineraryDayDraft['pace'] = normalizePace(row.pace)

  const metro =
    row.metroHintFromArea && typeof row.metroHintFromArea === 'object'
      ? (row.metroHintFromArea as Record<string, string>)
      : { custom: runtimeCopy3('m4f6b1c05b6', undefined) }

  const rawTitle = String(row.title || runtimeCopy('m98cd75602d', { p0: (day) })).trim()
  const cleanTitle = rawTitle.slice(0, 20).replace(/\s*[&,，、·\-]\s*$/, '').trim()
  return {
    day,
    title: cleanTitle || rawTitle.slice(0, 20),
    theme: String(row.theme || '').trim() || runtimeCopy('me3c015188d', undefined),
    pace,
    summary: String(row.summary || '').trim() || runtimeCopy('m0e4c137d43', undefined),
    metroHintFromArea: metro,
    stops,
  }
}

function pickJsonStringField(text: string, field: string): string | undefined {
  const re = new RegExp(`"${field}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`)
  const match = text.match(re)
  if (!match?.[1]) return undefined
  try {
    return JSON.parse(`"${match[1]}"`) as string
  } catch {
    return match[1]
  }
}

function extractStreamingDayPreview(
  text: string,
  fallbackDay: number,
): { day: number; title?: string; theme?: string } | null {
  const rawTitle = pickJsonStringField(text, 'title')?.trim()
  const theme = pickJsonStringField(text, 'theme')?.trim()
  if (!rawTitle && !theme) return null
  const cleanTitle = rawTitle
    ? rawTitle.slice(0, 20).replace(/\s*[&,，、·\-]\s*$/, '').trim()
    : undefined
  return {
    day: fallbackDay,
    title: cleanTitle || rawTitle?.slice(0, 20) || undefined,
    theme: theme || undefined,
  }
}

/**
 * Models sometimes return the day as a nested object, a `days[]` item, or
 * flattened onto the root (`day: 3` + `title`/`stops` siblings). Accept all.
 */
function pickSingleDayRow(
  parsed: Record<string, unknown>,
  fallbackDay: number,
): Record<string, unknown> | null {
  const nested = parsed.day
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    return nested as Record<string, unknown>
  }
  if (Array.isArray(parsed.days)) {
    const first = parsed.days.find(
      (row) => row && typeof row === 'object' && !Array.isArray(row),
    )
    if (first) return first as Record<string, unknown>
  }
  // Flattened root: day is a number/string, stops live beside it.
  if (Array.isArray(parsed.stops)) {
    const dayNum = Number(parsed.day)
    return {
      ...parsed,
      day: Number.isFinite(dayNum) && dayNum >= 1 ? dayNum : fallbackDay,
    }
  }
  return null
}

/**
 * Regenerate a single itinerary day with the same hard rules as full generation,
 * while avoiding places already used on other days.
 */
export async function generateSingleDayItinerary(
  input: GenerateSingleDayItineraryInput,
): Promise<SingleDayItineraryDraft> {
  if (!isLlmConfigured()) {
    throw new LlmRequestError(runtimeCopy('ma8ce6d4840', undefined), 'missing_key')
  }

  const n = Math.max(1, Math.min(30, Math.floor(input.dayCount) || 1))
  const dayNumber = Math.max(1, Math.min(n, Math.floor(input.dayNumber) || 1))
  const prefs = input.recommendationPreferences
  const disneyDay = prefs.includeDisneyDay && n >= 3 ? n - 1 : null
  const isFirst = dayNumber === 1
  const isLast = dayNumber === n && n > 1
  const isDisney = disneyDay != null && dayNumber === disneyDay
  const locale = getLocale()
  const isEn = locale === 'en'
  const hotelArea =
    input.hotel.area ||
    input.hotel.areaKey ||
    (isEn ? localizedCopy('m412dec02ce', undefined, 'en') : localizedCopy('m412dec02ce', undefined, 'zh-CN'))

  const roleRules: string[] = buildSingleDayRoleRules(
    dayNumber,
    disneyDay,
    prefs,
    isFirst,
    isLast,
    isDisney,
    locale,
  )

  const occupiedNames = input.occupiedPlaces
    .map((p) => p.name?.trim())
    .filter(Boolean)
  const occupiedIds = input.occupiedPlaces
    .map((p) => p.placeId?.trim())
    .filter(Boolean)

  const role = isEn
    ? localizedCopy('mafee72c991', { p0: (input.destination || (isEn ? englishPromptFragments('m296e0c9a1b') : runtimeCopy('me203a4c760', undefined))), p1: (seasonForDate(input.calendarDate || input.itineraryStartDate, locale)) }, 'en')
    : localizedCopy('mafee72c991', { p0: (input.destination || runtimeCopy('me203a4c760', undefined)), p1: (seasonForDate(input.calendarDate || input.itineraryStartDate, locale)) }, 'zh-CN')
  const langRule = getLlmLanguageInstruction(locale)
  const outputFormat = isEn
    ? localizedCopy('m11269ea89f', undefined, 'en')
    : localizedCopy('m11269ea89f', undefined, 'zh-CN')
  const jsonShape = '{ places: [{ key, googlePlaceId, name, nameLocal?, type: "cafe|attraction|restaurant|transport|hotel", area?, description, durationHint? }], day: { day, title, theme, pace: "relaxed|moderate|park|self-drive", summary, metroHintFromArea: { custom: "string" }, stops: [{ time: "HH:MM", placeKey, note, transport?: "transit|walking", walkLevel: "minimal|short|moderate", duration? }] } }'
  const jsonExample = isEn
    ? localizedCopy('m5f25914412', undefined, 'en')
    : localizedCopy('m5f25914412', undefined, 'zh-CN')
  const hardRules = isEn
    ? localizedCopy('m157baffbe4', { p0: (dayNumber), p1: (dayNumber), p2: (dayNumber), p3: (roleRules.map((r) => `- ${r}`).join('\n')), p4: (prefs.dayStartTime), p5: (prefs.preferLowWalking
          ? englishPrompt('m9dbc30a490')
          : englishPrompt('m8645e3e7b4')), p6: (prefs.avoidLouvreAndVersailles
          ? englishPrompt('m1345d16985')
          : englishPrompt('m1f3b1cacd2')) }, 'en')
    : localizedCopy('m157baffbe4', { p0: (dayNumber), p1: (dayNumber), p2: (dayNumber), p3: (roleRules.map((r) => `- ${r}`).join('\n')), p4: (prefs.dayStartTime), p5: (prefs.preferLowWalking
        ? chinesePromptFragments('mefd4b93896')
        : chinesePromptFragments('m7e6249b075')), p6: (prefs.avoidLouvreAndVersailles
        ? chinesePromptFragments('mbd01ca4386')
        : chinesePromptFragments('m63cc2fb15d')) }, 'zh-CN')

  const system = buildPrompt(
    role,
    null,
    langRule,
    getCommonRules(locale),
    getPlaceResearchDiscipline(locale),
    getCafeVsRestaurantRule(locale),
    stopCardIntroCopy('rules', undefined, locale),
    openingCopy('rule'),
    input.openingRepair ? openingCopy('repairRule') : '',
    input.compact ? '' : `<output_format>${outputFormat}</output_format>`,
    input.compact ? hardRules.split('\n').filter((line) => !/places\[\]|metroHintFromArea|title\/theme\/pace\/summary/.test(line)).join('\n') : hardRules,
    input.compact
      ? englishPrompt('mc6da50dfc9', { p0: (dayNumber) })
      : jsonContract(jsonShape, jsonExample, locale),
  )

  const user = JSON.stringify({
    openingRepair: input.openingRepair,
    trip: {
      destination: input.destination || (isEn ? localizedCopy('mde73486121', undefined, 'en') : localizedCopy('mde73486121', undefined, 'zh-CN')),
      dayCount: n,
      nights: input.nights ?? Math.max(0, n - 1),
      tripStartDate: input.tripStartDate,
      tripEndDate: input.tripEndDate,
      itineraryStartDate: input.itineraryStartDate,
      explicitRequest: input.preferences || null,
      recommendationPreferences: recommendationPreferencesPrompt(prefs, { locale }),
    },
    regenerate: {
      dayNumber,
      calendarDate: input.calendarDate || null,
      role: isFirst
        ? 'arrival'
        : isLast
          ? 'return'
          : isDisney
            ? 'disney'
            : 'mid',
    },
    hotel: {
      name: input.hotel.name,
      address: input.hotel.address,
      area: hotelArea,
      areaKey: input.hotel.areaKey || null,
      lat: input.hotel.lat,
      lng: input.hotel.lng,
      nearestMetro: input.hotel.nearestMetro || null,
    },
    outboundFlight: input.outbound || null,
    returnFlight: input.returnFlight || null,
    occupiedElsewhere: {
      names: occupiedNames,
      placeIds: occupiedIds,
      detail: input.occupiedPlaces.slice(0, 80),
    },
    verifiedCandidates: input.compact ? input.verifiedCandidates.map((row, index) => ({ key: `p${index}`, name: row.name, type: row.type, address: row.address, location: row.location, distanceMeters: row.distanceMeters, openingWindows: openingWindows(row.openingSchedule, input.calendarDate || input.itineraryStartDate) })) : input.verifiedCandidates.map(row => ({ ...row, openingWindows: openingWindows(row.openingSchedule, input.calendarDate || input.itineraryStartDate) })),
  })

  const text = await generateText(system, user, {
    strict: true,
    task: 'itineraryDayGenerate',
    json: true,
    // Arrival / return / Disney: skip web_search for speed. Mid days: model chooses.
    webSearch: isFirst || isLast || isDisney ? false : 'auto',
    signal: input.signal,
    preflightContext: {
      destination: input.destination,
      dayNumber: input.dayNumber,
      recommendationPreferences: input.recommendationPreferences,
    },
    userText: input.preferences || input.destination,
    onDelta: input.onDayPreview
      ? (_delta, full) => {
          const preview = extractStreamingDayPreview(full, dayNumber)
          if (preview) input.onDayPreview?.(preview)
        }
      : undefined,
  })
  if (!text) {
    throw new LlmRequestError(runtimeCopy3('m8e24503f06', undefined))
  }

  const parsed = extractJsonObject(text)
  if (!parsed) {
    throw new LlmRequestError(
      runtimeCopy3('mdc12471a08', { p0: (text.slice(0, 240).replace(/\s+/g, ' ')) }),
      'invalid_json',
    )
  }

  if (input.compact) {
    parsed.places = input.verifiedCandidates.map((row, index) => ({ key: `p${index}`, name: row.name, googlePlaceId: row.id }))
  }
  const rawPlaces = Array.isArray(parsed.places) ? (parsed.places as unknown[]) : []
  const places = parseItineraryPlaces(rawPlaces, input.verifiedCandidates)

  const dayRow = pickSingleDayRow(parsed, dayNumber)
  if (!dayRow) {
    throw new LlmRequestError(
      runtimeCopy3('m00f4728c54', { p0: (text.slice(0, 240).replace(/\s+/g, ' ')) }),
      'empty_day',
    )
  }

  const parsedDay = parseItineraryDay(dayRow, dayNumber)
  const allowedKeys = new Set(places.map((place) => place.key))
  const specialKeys = new Set([
    'hotel-selected',
    'attr-disney',
    'attr-cdg',
    'attr-champs',
    'attr-arc',
  ])
  const day = parsedDay
    ? {
        ...parsedDay,
        stops: parsedDay.stops.filter(
          (stop) => allowedKeys.has(stop.placeKey) || specialKeys.has(stop.placeKey),
        ),
      }
    : null
  if (!day || !day.stops.length) {
    throw new LlmRequestError(runtimeCopy3('m840997ab9d', undefined))
  }

  return {
    day: { ...day, day: dayNumber },
    places: input.compact ? places.filter((place) => day.stops.some((stop) => stop.placeKey === place.key)) : places,
  }
}

// ---------------------------------------------------------------------------
// Translation-only itinerary pass
// ---------------------------------------------------------------------------
//
// The full `generateFullItinerary` and single-day regen re-roll the entire
// plan, including places and stops. That's expensive (and can disrupt
// places the user has manually adjusted). When the user just switches
// UI language, we want a cheaper pass: keep the day structure (day number,
// pace, placeKey / placeId, time, transport / walkLevel codes, theme tags,
// metroHintFromArea keys) verbatim, and translate only the human-readable
// text — day.title, day.theme, day.summary, day.metroHintFromArea[*] values,
// and each stop's `note` + `duration`.

export interface TranslateItineraryTextInput {
  days: DayPlan[]
  sourceLocale: Locale
  targetLocale: Locale
  signal?: AbortSignal
  onProgress?: (partialDays: DayPlan[]) => void
}

export interface TranslateItineraryTextResult {
  days: DayPlan[]
}

/** Heuristic for the case when the caller doesn't know the source language.
 *
 * Counts the number of CJK chars across all user-facing strings (title /
 * theme / summary / stop note / duration / metro hints). If more than ~30%
 * of the visible characters are CJK, treat the source as `zh-CN`; otherwise
 * `en`. The threshold prevents stray CJK characters (e.g. a single Chinese
 * hotel name) in an otherwise English trip from fooling the detector.
 */
function detectLocaleFromDays(days: DayPlan[]): Locale {
  let cjk = 0
  let nonCjk = 0
  const bump = (raw: string | undefined) => {
    if (!raw) return
    for (const ch of raw) {
      if (isCjk(ch)) cjk += 1
      else if (isLatinOrDigit(ch)) nonCjk += 1
    }
  }
  for (const d of days) {
    bump(d.title)
    bump(d.theme)
    bump(d.summary)
    for (const stop of d.stops || []) {
      bump(stop.note)
      bump(stop.duration)
    }
    if (d.metroHintFromArea) {
      for (const v of Object.values(d.metroHintFromArea)) bump(v)
    }
  }
  if (cjk === 0) return 'en'
  if (nonCjk === 0) return 'zh-CN'
  // Mostly CJK: zh-CN. Mostly Latin: en. Mixed text defaults to en since
  // the LLM's prompt explicitly tells it the source language, so a wrong
  // guess just means a no-op translation rather than a destructive one.
  return cjk / (cjk + nonCjk) >= 0.3 ? 'zh-CN' : 'en'
}

/** True when cached itinerary copy is actually written in `locale`. */
export function itineraryCopyMatchesLocale(
  days: DayPlan[] | undefined | null,
  locale: Locale,
): boolean {
  if (!days || days.length === 0) return false
  return detectLocaleFromDays(days) === locale
}

function isCjk(ch: string): boolean {
  const code = ch.charCodeAt(0)
  return code >= 0x3400 && code <= 0x9fff
}

function isLatinOrDigit(ch: string): boolean {
  const code = ch.charCodeAt(0)
  return (
    (code >= 0x30 && code <= 0x39) || // 0-9
    (code >= 0x41 && code <= 0x5a) || // A-Z
    (code >= 0x61 && code <= 0x7a) // a-z
  )
}

/** Build the system prompt for `translateItineraryText`. Exported for tests. */
export function buildTranslateSystemPrompt(
  targetLocale: Locale,
  sourceLocale: Locale,
  langRule: string,
): string {
  const role =
    targetLocale === 'en'
      ? localizedCopy('m087572949b', undefined, 'en')
      : localizedCopy('m087572949b', undefined, 'zh-CN')
  const hardRules =
    targetLocale === 'en'
      ? localizedCopy('me092cd7a76', { p0: (langRule) }, 'en')
      : localizedCopy('me092cd7a76', { p0: (langRule) }, 'zh-CN')

  const sourceNote =
    sourceLocale === targetLocale
      ? ''
      : translationDirection(sourceLocale, targetLocale)
  return buildPrompt(
    role,
    null,
    langRule,
    sourceNote,
    hardRules,
    jsonContract(
      englishPrompt('m549911f96f'),
      targetLocale === 'en'
        ? localizedCopy('m379a6fcd78', undefined, 'en')
        : localizedCopy('m379a6fcd78', undefined, 'zh-CN'),
      targetLocale,
    ),
  )
}

export async function translateItineraryText(
  input: TranslateItineraryTextInput,
): Promise<TranslateItineraryTextResult> {
  if (!isLlmConfigured()) {
    throw new LlmRequestError(runtimeCopy3('mc35e8b33b6', undefined), 'missing_key')
  }
  if (input.sourceLocale === input.targetLocale) {
    return { days: input.days }
  }
  const { days, sourceLocale, targetLocale, signal, onProgress } = input
  const langRule = getLlmLanguageInstruction(targetLocale)
  const system = buildTranslateSystemPrompt(targetLocale, sourceLocale, langRule)

  // Emit initial empty template so UI immediately displays graceful skeleton shimmers
  if (onProgress) {
    const initialBlank = days.map((source) =>
      mergeTranslatedDay(source, undefined, true /* isStreaming */),
    )
    onProgress(initialBlank)
  }

  // Active snapshot of merged days updated progressively by parallel streams
  const currentMergedDays: DayPlan[] = days.map((source) =>
    mergeTranslatedDay(source, undefined, true /* isStreaming */),
  )

  const translateSingleDay = async (sourceDay: DayPlan, dayIndex: number): Promise<DayPlan> => {
    const compactDay = {
      day: sourceDay.day,
      title: sourceDay.title,
      theme: sourceDay.theme,
      summary: sourceDay.summary,
      metroHintFromArea: sourceDay.metroHintFromArea,
      stops: sourceDay.stops.map((s) => ({
        time: s.time,
        placeId: s.placeId,
        note: s.note,
        duration: s.duration,
        transport: s.transport,
      })),
    }
    const user = JSON.stringify({ days: [compactDay] })

    const onDelta = onProgress
      ? (_delta: string, fullText: string) => {
          const parsed = parsePartialJson<{ days?: unknown[] } | Partial<DayPlan>>(fullText)
          let partialDay: Partial<DayPlan> | undefined
          if (parsed && typeof parsed === 'object') {
            if ('days' in parsed && Array.isArray(parsed.days) && parsed.days.length > 0) {
              partialDay = parsed.days[0] as Partial<DayPlan>
            } else if ('title' in parsed || 'stops' in parsed || 'summary' in parsed) {
              partialDay = parsed as Partial<DayPlan>
            }
          }
          if (partialDay) {
            currentMergedDays[dayIndex] = mergeTranslatedDay(
              sourceDay,
              partialDay as DayPlan,
              true /* isStreaming */,
            )
            onProgress([...currentMergedDays])
          }
        }
      : undefined

    try {
      const raw = await generateText(system, user, {
        strict: false,
        task: 'itineraryTranslate',
        json: true,
        thinking: { enabled: false, effort: 'low' },
        preflight: false,
        signal,
        onDelta,
      })

      if (!raw) {
        return sourceDay
      }

      const parsed = extractJsonObject(raw) as { days?: unknown } | Partial<DayPlan> | null
      let translatedDay: DayPlan | undefined
      if (parsed && typeof parsed === 'object') {
        if ('days' in parsed && Array.isArray(parsed.days) && parsed.days.length > 0) {
          translatedDay = parsed.days[0] as DayPlan
        } else if ('title' in parsed || 'stops' in parsed || 'summary' in parsed) {
          translatedDay = parsed as DayPlan
        }
      }

      const finalDay = mergeTranslatedDay(sourceDay, translatedDay, false /* isStreaming */)
      currentMergedDays[dayIndex] = finalDay
      if (onProgress) {
        onProgress([...currentMergedDays])
      }
      return finalDay
    } catch {
      // Graceful fallback to source day on individual day failure
      const fallbackDay = mergeTranslatedDay(sourceDay, undefined, false /* isStreaming */)
      currentMergedDays[dayIndex] = fallbackDay
      if (onProgress) {
        onProgress([...currentMergedDays])
      }
      return fallbackDay
    }
  }

  const translatedDays = await Promise.all(
    days.map((d, i) => translateSingleDay(d, i)),
  )

  if (!itineraryCopyMatchesLocale(translatedDays, targetLocale)) {
    throw new LlmRequestError(
      targetLocale === 'en'
        ? localizedCopy('m1c136e10eb', undefined, 'en')
        : localizedCopy('m1c136e10eb', undefined, 'zh-CN'),
      'translate_incomplete',
    )
  }

  return { days: translatedDays }
}

/**
 * Combine a source `DayPlan` (trusted) with an LLM-translated `DayPlan`
 * (untrusted). The source's structured fields always win; the translated
 * object's string fields win, with safe fallbacks if the LLM dropped any.
 */
function mergeTranslatedDay(
  source: DayPlan,
  translated: DayPlan | undefined,
  isStreaming = false,
): DayPlan {
  if (!translated) {
    if (isStreaming) {
      return {
        ...source,
        title: '',
        theme: '',
        summary: '',
        stops: source.stops.map((s) => ({ ...s, note: '', duration: '' })),
      }
    }
    return source
  }
  const merged: DayPlan = {
    ...source,
    title:
      typeof translated.title === 'string'
        ? isStreaming
          ? translated.title
          : translated.title.trim() || source.title
        : isStreaming
        ? ''
        : source.title,
    theme:
      typeof translated.theme === 'string'
        ? isStreaming
          ? translated.theme
          : translated.theme.trim() || source.theme
        : isStreaming
        ? ''
        : source.theme,
    summary:
      typeof translated.summary === 'string'
        ? isStreaming
          ? translated.summary
          : translated.summary.trim() || source.summary
        : isStreaming
        ? ''
        : source.summary,
    metroHintFromArea: {
      ...source.metroHintFromArea,
      ...(translated.metroHintFromArea || {}),
    },
  }
  if (Array.isArray(translated.stops)) {
    merged.stops = source.stops.map((sourceStop, j) => {
      const trStop = translated.stops[j]
      if (!trStop) {
        return isStreaming
          ? { ...sourceStop, note: '', duration: '' }
          : sourceStop
      }
      return {
        ...sourceStop,
        note:
          typeof trStop?.note === 'string'
            ? isStreaming
              ? trStop.note
              : trStop.note.trim() || sourceStop.note
            : isStreaming
            ? ''
            : sourceStop.note,
        duration:
          typeof trStop?.duration === 'string'
            ? isStreaming
              ? trStop.duration
              : trStop.duration.trim() || sourceStop.duration
            : isStreaming
            ? ''
            : sourceStop.duration,
      }
    })
  } else if (isStreaming) {
    merged.stops = source.stops.map((s) => ({ ...s, note: '', duration: '' }))
  }
  return merged
}

export { detectLocaleFromDays }
