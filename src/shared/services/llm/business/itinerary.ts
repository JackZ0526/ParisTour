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
  return `${d.getMonth() + 1}月${d.getDate()}日`
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
      ? `去程预计巴黎当地 ${formatZhMonthDay(arrivalDateParis)} 抵达，行程从出发日当天起算。`
      : explicitArrivalDate
        ? `去程航班显示巴黎当地 ${formatZhMonthDay(arrivalDateParis)} 抵达，行程从该日起算。`
        : `航班未提供完整抵达日期；根据已有结构化时刻，行程暂从 ${formatZhMonthDay(arrivalDateParis)} 起算。`,
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
  if (month === 12 || month <= 2) return '冬季'
  if (month <= 5) return '春季'
  if (month <= 8) return '夏季'
  return '秋季'
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
      role: `${destination} ${season} travel planner. Generate a complete multi-day itinerary from the traveler's dates, flights, hotel, and verified place candidates.`,
      hardRules: `<hard_rules>
- Output exactly ${n} days (the "day" field is 1..${n}), each with title / theme / pace / summary / stops. Day title: short and punchy, 2–4 words, max 18 characters (e.g. "Eiffel & Left Bank", "Louvre Classics", "Marais Stroll"). Never list multiple long place names together (e.g. avoid "Champs-Élysées & Arc de Triomphe").
- Day 1 (arrival): the first stop MUST be hotel check-in (placeKey "hotel-selected", type hotel). Keep it light, beat the jet lag first; do not require a coffee shop opener on Day 1.
- For all days except the last: the last stop MUST be returning to the hotel (placeKey "hotel-selected", type hotel). On Day 1, if there are outbound stops too, include both check-in and end-of-day hotel; mid-trip days start from the hotel (the hotel is the origin and need not appear at the top of stops) but the last stop must still be hotel-selected.
- ${
        prefs.preferCafeStart
          ? 'Soft preference: except for Day 1 and the Disney day, prefer starting ordinary sightseeing days with a cafe from verifiedCandidates; skip if route or timing does not work.'
          : 'No requirement to start with a coffee shop.'
      }
- ${
        disneyDay
          ? `Hard rule: the second-to-last day (Day ${disneyDay}) MUST be a full Disney Paris day: pace="park" (乐园日 → code "park"), only one outing stop "attr-disney" plus end-of-day hotel; no in-park dining or other attractions; other days must not include Disney.`
          : 'Itineraries shorter than 3 days, or with Disney preference off, do not get a dedicated Disney day.'
      }
- ${
        prefs.includeChampsAndArc
          ? 'Soft preference: prefer including Champs-Élysées ("attr-champs") and Arc de Triomphe ("attr-arc") when the route allows, ideally on the same day.'
          : 'No requirement to include Champs-Élysées or the Arc de Triomphe.'
      }
- Last day (return): the hotel is only the default origin, do not put hotel-selected in that day\'s stops (no end-of-day hotel either). The day is planned entirely backwards from the return flight\'s departure. Allow 3–3.5 hours to reach CDG including ground transport. If a 10:00 wake-up leaves the day too tight, schedule just the airport stop (placeKey "attr-cdg"); do not force in extra sights; lunch/dinner may be omitted. If the morning still has slack, a light lunch or a quick coffee / pastry / brunch (NOT a brasserie sit-down) is fine before heading to the airport.
- Dedup (hard rule): the same attraction / landmark (same official name or same placeKey) must not appear more than once across the whole itinerary; not within a single day either. The hotel "hotel-selected" and the airport "attr-cdg" are exempt; the Disney day allows exactly one "attr-disney".
- Soft preference: ordinary sightseeing days start around ${prefs.dayStartTime}; flights, reservations, opening hours, and explicit user requests take priority.
- ${
        prefs.preferLunchAndDinner
          ? 'Soft preference: when timing allows, prefer scheduling both lunch and dinner (type=restaurant); may be reduced on flight days, Disney days, or tight-pace days.'
          : 'Plan meals flexibly per route and time of day; never substitute cafe for a sit-down meal.'
      }
- Day 1 meals: after hotel check-in, if there is still time in the day, add lunch and/or dinner; if arrival is late, only dinner.
- ${
        prefs.preferLowWalking
          ? 'Soft preference: cluster same-area spots on the same day; prefer minimal walking and transfers.'
          : 'Moderate walking for richer itineraries is acceptable when the route is sound.'
      }
- Transport classification (hard rule): transport must be one of "transit" or "walking" (codes). Do NOT guess specific lines, train numbers, station names, or taxis. The note for a stop should describe only what happens AT that stop, not the transport that leaves it. walkLevel is the walking intensity for the segment arriving at this stop, and must agree with transport.
- ${
        prefs.avoidLouvreAndVersailles
          ? 'Soft preference: do not volunteer Louvre or Versailles; honour the user if they explicitly ask for one.'
          : 'Louvre and Versailles are fair game based on route and time.'
      }
- The "places[]" array\'s ordinary entries MUST come from verifiedCandidates. Copy "name" and "googlePlaceId" verbatim; never invent places, addresses, ratings, or distances.
- User "explicitRequest" is the highest priority; "recommendationPreferences" is a soft preference; flights, date boundaries, place authenticity, and output structure are hard constraints.
- Reserved placeKeys (do not duplicate in places[]): "hotel-selected" (hotel), "attr-disney" (Disney), "attr-cdg" (Charles de Gaulle), "attr-champs" (Champs-Élysées), "attr-arc" (Arc de Triomphe).
- metroHintFromArea: at least one English metro/transit hint under "custom".
- time uses HH:MM. The airport-bound day may use "back-calculated from flight".
</hard_rules>`,
      outputFormat: 'Output JSON only. No markdown. No explanation. Use the target locale language for user-visible copy (concise, lightly playful but not cheesy).',
      jsonShape: '{ places: [{ key, googlePlaceId, name, nameLocal?, type: "cafe|attraction|restaurant|transport|hotel", area?, description, durationHint? }], days: [{ day, title, theme, pace: "relaxed|moderate|park|self-drive", summary, metroHintFromArea: { custom: "string" }, stops: [{ time: "HH:MM", placeKey, note, transport?: "transit|walking", walkLevel: "minimal|short|moderate", duration? }] }] }',
      jsonExample: '{ "places": [{ "key": "cafe-day2", "googlePlaceId": "...", "name": "Café Kitsuné Palais Royal", "type": "cafe", "area": "1st arr.", "description": "Specialty coffee shop inside the Royal Palace in the 1st, with seating." }], "days": [{ "day": 1, "title": "Arrival in Paris", "theme": "Settle in", "pace": "relaxed", "summary": "After landing at CDG, head straight to the hotel to check in and unwind; a short stroll nearby in the afternoon.", "metroHintFromArea": { "custom": "Pick a route that fits real-time conditions." }, "stops": [{ "time": "15:30", "placeKey": "hotel-selected", "note": "Check in and rest briefly.", "transport": "transit", "walkLevel": "minimal" }] }] }',
    }
  }
  // Chinese (default)
  return {
    role: `${destination}${season}旅行规划师。根据旅客的日期、航班、酒店和已验证地点候选生成完整多日行程。`,
    hardRules: `<hard_rules>
- 必须输出恰好 ${n} 天（day 字段为 1..${n}），每天都有 title/theme/pace/summary/stops。标题极简：2–5 字（如「西侧经典」「左岸轻松」），切勿罗列多个长地名。
- Day 1：抵达日。第一站必须是酒店办理入住（placeKey 用 "hotel-selected"，type hotel）。轻行程、倒时差优先；Day 1 不强制咖啡馆开场。
- 除最后一天外：每一天的最后一站必须是回酒店过夜（placeKey "hotel-selected"，type hotel）。Day 1 若还有出门行程，则首站入住酒店 + 末站回酒店过夜（可两个 hotel-selected）；中间日早晨从酒店出发（酒店为原点，不必写在 stops 开头），末站仍须写回酒店。
- ${
      prefs.preferCafeStart
        ? '软偏好：除 Day 1 与迪士尼日外，普通游览日优先以 verifiedCandidates 中的 cafe 开始；路线或时间不合适时可不安排。'
        : '不要求以咖啡馆开始。'
    }
- ${
      disneyDay
        ? `硬规则：倒数第二天（Day ${disneyDay}）必须为巴黎迪士尼全日：pace=乐园日，出游站只保留一个 "attr-disney" 与末站回酒店，不另列园内餐饮或其它景点；其它天禁止安排迪士尼。`
        : '行程不足 3 天或未开启迪士尼偏好时，不安排独立迪士尼日。'
    }
- ${
      prefs.includeChampsAndArc
        ? '软偏好：优先包含香榭丽舍大街（"attr-champs"）与凯旋门（"attr-arc"），适合时同日顺路安排。'
        : '不强制包含香榭丽舍大街与凯旋门。'
    }
- 最后一天（返程日）：酒店仅作默认出发原点，不要把 hotel-selected 写入当天 stops（也不要末站回酒店）。完全由返程航班起飞时间倒推。国际航班预留 3–3.5 小时到 CDG（含交通）。若约 10:00 起床后时间紧张，可只安排机场一站（placeKey "attr-cdg"），不要硬塞景点；此时午餐/晚餐可省略。若上午仍有空档，可在去机场前安排一顿午餐或轻量咖啡馆（咖啡/甜点/brunch，非正餐 brasserie）。
- 去重（硬规则）：整个行程不要重复同一景点/地标（同一正式名或同一 placeKey 只出现一次）；同一天内也不要重复。酒店 "hotel-selected"、机场 "attr-cdg" 除外；迪士尼日仅允许一个 "attr-disney"。
- 软偏好：普通游览日约 ${prefs.dayStartTime} 开始；航班、预约、营业时间和用户明确要求优先。
- ${
      prefs.preferLunchAndDinner
        ? '软偏好：时间允许时优先安排午餐与晚餐两顿正餐（type=restaurant）；航班日、迪士尼日或节奏过紧时可减少。'
        : '餐饮站按当天路线与时间灵活安排，正餐不得用 cafe 类型代替。'
    }
- Day 1 餐饮：抵达办入住后若仍有空档，再安排午餐和/或晚餐；落地过晚可只安排晚餐。
- ${
      prefs.preferLowWalking
        ? '软偏好：同日地点尽量同片区聚类，优先少步行、少换乘。'
        : '在路线合理的前提下可接受适量步行以丰富行程。'
    }
- 交通分类（硬规则）：transport 只能输出「公共交通」或「步行」（对应 code "transit" / "walking"），不要猜测或输出具体线路、车次、站名、出租车等；具体路线以 Google Maps 为准。note 只写本站在做什么，不写离开本站的交通。walkLevel 表示到达本站这一段的步行强度，并与 transport 保持一致。
- ${
      prefs.avoidLouvreAndVersailles
        ? '软偏好：默认不主动安排卢浮宫或凡尔赛；用户明确要求时优先服从。'
        : '卢浮宫和凡尔赛可按路线与时间正常考虑。'
    }
- places[] 的普通地点只能从 verifiedCandidates 选择；name 与 googlePlaceId 必须原样复制，禁止另造地点、地址、评分或距离。
- 用户 explicitRequest 是最高优先级；recommendationPreferences 是可让步的偏好；航班时刻、日期边界、地点真实性和输出结构是硬约束。
- 特殊 placeKey 固定："hotel-selected"（酒店）、"attr-disney"（迪士尼）、"attr-cdg"（戴高乐机场）、"attr-champs"（香榭丽舍大街）、"attr-arc"（凯旋门）——这些可不必重复写在 places[]。
- metroHintFromArea 至少给 custom 一条中文地铁/交通提示。
- time 用 HH:MM；最后一天去机场可用「按航班倒推」。
</hard_rules>`,
    outputFormat: '只输出 JSON，不要 markdown，不要解释。文案用简体中文，可带一点俏皮但不油腻。',
    jsonShape: '{ places: [{ key, googlePlaceId, name, nameLocal?, type: "cafe|attraction|restaurant|transport|hotel", area?, description, durationHint? }], days: [{ day, title, theme, pace: "relaxed|moderate|park|self-drive", summary, metroHintFromArea: { custom: "string" }, stops: [{ time: "HH:MM", placeKey, note, transport?: "transit|walking", walkLevel: "minimal|short|moderate", duration? }] }] }',
    jsonExample: '{ "places": [{ "key": "cafe-day2", "googlePlaceId": "...", "name": "Café Kitsuné Palais Royal", "type": "cafe", "area": "1区", "description": "1区皇家宫殿内的精品咖啡小店，可坐位。" }], "days": [{ "day": 1, "title": "抵达巴黎", "theme": "落地 · 安顿", "pace": "relaxed", "summary": "抵达 CDG 后直奔酒店办理入住，下午就近闲逛。", "metroHintFromArea": { "custom": "按实时地图选择合适路线。" }, "stops": [{ "time": "15:30", "placeKey": "hotel-selected", "note": "办理入住，稍作休息。", "transport": "transit", "walkLevel": "minimal" }] }] }',
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
        'Today is Day 1 (arrival). The first stop MUST be hotel check-in (placeKey "hotel-selected", type hotel). Keep it light, beat the jet lag; do not require a coffee shop opener.',
        'If Day 1 has any outbound stops, include both check-in and end-of-day hotel-selected.',
        'Day 1 meals: after check-in, if there is still time, add lunch and/or dinner; if arrival is late, only dinner.',
        disneyDay != null
          ? `Hard rule: the full Disney day is already locked to Day ${disneyDay}; today MUST NOT include Disney.`
          : 'No standalone Disney day today.',
      ]
    }
    if (isLast) {
      return [
        'Today is the last day (return): the hotel is only the default origin, do NOT put hotel-selected in today\'s stops (no end-of-day hotel either). Plan entirely backwards from the return flight\'s departure.',
        'Allow 3–3.5 hours to reach CDG including ground transport. If a 10:00 wake-up leaves the day too tight, schedule just the airport stop (placeKey "attr-cdg"); lunch/dinner may be omitted. If the morning has slack, a light lunch or a quick coffee / pastry / brunch (NOT a brasserie sit-down) is fine before heading to the airport.',
        disneyDay != null
          ? `Hard rule: the full Disney day is already locked to Day ${disneyDay}; today MUST NOT include Disney.`
          : 'No standalone Disney day today.',
      ]
    }
    if (isDisney) {
      return [
        `Hard rule: Day ${dayNumber} is the second-to-last day and MUST be a full Disney Paris day. pace must be "park"; only one outing stop "attr-disney" plus end-of-day hotel (placeKey "hotel-selected"); no in-park dining, cafes, or other attractions.`,
      ]
    }
    return [
      'Mid-trip day: start from the hotel (the hotel is the origin, no need to write it at the top of stops); the last stop MUST be returning to the hotel (placeKey "hotel-selected", type hotel).',
      disneyDay != null
        ? `Hard rule: the full Disney day is already locked to Day ${disneyDay}; today MUST NOT include "attr-disney" or any Disney-related stop.`
        : 'No standalone Disney day today.',
      prefs.preferCafeStart
        ? 'Soft preference: prefer starting ordinary sightseeing days with a cafe from verifiedCandidates; skip if the route does not work.'
        : 'No requirement to start with a coffee shop.',
      prefs.preferLunchAndDinner
        ? 'Soft preference: when timing allows, prefer scheduling both lunch and dinner (type=restaurant).'
        : 'Plan meals flexibly per route and time.',
      prefs.includeChampsAndArc
        ? 'If the route fits and occupiedElsewhere does not yet include Champs-Élysées / Arc de Triomphe, prefer "attr-champs" and "attr-arc".'
        : 'No requirement to include Champs-Élysées or the Arc de Triomphe.',
    ]
  }
  // Chinese (default)
  if (isFirst) {
    return [
      '今天是 Day 1 抵达日。第一站必须是酒店办理入住（placeKey 用 "hotel-selected"，type hotel）。轻行程、倒时差优先；不强制咖啡馆开场。',
      '若 Day 1 还有出门行程，则首站入住酒店 + 末站回酒店过夜（可两个 hotel-selected）。',
      'Day 1 餐饮：抵达办入住后若仍有空档，再安排午餐和/或晚餐；落地过晚可只安排晚餐。',
      disneyDay != null
        ? `硬规则：迪士尼全日已固定在 Day ${disneyDay}，今天禁止安排迪士尼。`
        : '今天不安排独立迪士尼日。',
    ]
  }
  if (isLast) {
    return [
      '今天是最后一天（返程日）：酒店仅作默认出发原点，不要把 hotel-selected 写入当天 stops（也不要末站回酒店）。完全由返程航班起飞时间倒推。',
      '国际航班预留 3–3.5 小时到 CDG（含交通）。若约 10:00 起床后时间紧张，可只安排机场一站（placeKey "attr-cdg"），不要硬塞景点；此时午餐/晚餐可省略。若上午仍有空档，可在去机场前安排一顿午餐或轻量咖啡馆（咖啡/甜点/brunch，非正餐 brasserie）。',
      disneyDay != null
        ? `硬规则：迪士尼全日已固定在 Day ${disneyDay}，今天禁止安排迪士尼。`
        : '今天不安排独立迪士尼日。',
    ]
  }
  if (isDisney) {
    return [
      `硬规则：Day ${dayNumber} 是倒数第二天，必须安排为巴黎迪士尼全日。pace 必须为「乐园日」；出游站只保留一个 "attr-disney"，末站回酒店过夜（placeKey "hotel-selected"）；不另列园内餐饮、咖啡馆或其它景点。`,
    ]
  }
  return [
    '中间日：早晨从酒店出发（酒店为原点，不必写在 stops 开头），末站必须回酒店过夜（placeKey "hotel-selected"，type hotel）。',
    disneyDay != null
      ? `硬规则：迪士尼全日已固定在 Day ${disneyDay}，今天禁止安排 "attr-disney" 或任何迪士尼相关站点。`
      : '今天不安排独立迪士尼日。',
    prefs.preferCafeStart
      ? '软偏好：普通游览日优先以 verifiedCandidates 中的 cafe 开始；路线不合适时可不安排。'
      : '不要求以咖啡馆开始。',
    prefs.preferLunchAndDinner
      ? '软偏好：时间允许时优先安排午餐与晚餐两顿正餐（type=restaurant）。'
      : '餐饮站按当天路线与时间灵活安排。',
    prefs.includeChampsAndArc
      ? '若路线合适且 occupiedElsewhere 尚未包含香榭丽舍/凯旋门，可优先安排 "attr-champs" 与 "attr-arc"。'
      : '不强制安排香榭丽舍或凯旋门。',
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
        ? 'OpenAI API key is not configured; cannot generate itinerary.'
        : '未配置 OpenAI API Key，无法生成行程。',
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
    (isEn ? 'Paris city center' : '巴黎市区')

  const { role, hardRules, outputFormat, jsonShape, jsonExample } = buildFullItineraryPrompt(
    n,
    prefs,
    disneyDay,
    input.destination || (isEn ? 'the destination' : '目的地'),
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
    `<output_format>${outputFormat}</output_format>`,
    hardRules,
    jsonContract(jsonShape, jsonExample, locale),
  )

  const user = JSON.stringify({
    trip: {
      destination: input.destination || (isEn ? 'Paris' : '巴黎'),
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
    throw new LlmRequestError('大模型没有返回行程。')
  }

  const parsed = extractJsonObject(text)
  if (!parsed) {
    throw new LlmRequestError(
      `无法解析行程 JSON，请再试一次。\npreview=${text.slice(0, 240).replace(/\s+/g, ' ')}`,
      'invalid_json',
    )
  }

  const rawPlaces = Array.isArray(parsed.places) ? (parsed.places as unknown[]) : []
  const rawDays = Array.isArray(parsed.days) ? (parsed.days as unknown[]) : []
  if (!rawDays.length) {
    throw new LlmRequestError(
      `行程天数为空，请再试一次。\nkeys=${Object.keys(parsed).join(',') || '(none)'}`,
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
        note: String(stop.note || '').trim() || '按当天节奏灵活调整。',
        transport: normalizeTransportChoice(stop.transport),
        walkLevel: normalizeWalkLevel(stop.walkLevel),
        duration: String(stop.duration || '').trim() || undefined,
      })
    }
    const pace: FullItineraryDayDraft['pace'] = normalizePace(row.pace)

    const metro =
      row.metroHintFromArea && typeof row.metroHintFromArea === 'object'
        ? (row.metroHintFromArea as Record<string, string>)
        : { custom: '按导航或地铁前往下一个地点。' }

    const rawTitle = String(row.title || `第 ${dayNum} 天`).trim()
    const cleanTitle = rawTitle.slice(0, 20).replace(/\s*[&,，、·\-]\s*$/, '').trim()
    days.push({
      day: dayNum,
      title: cleanTitle || rawTitle.slice(0, 20),
      theme: String(row.theme || '').trim() || '巴黎日程',
      pace,
      summary: String(row.summary || '').trim() || '今天按地图与体力微调即可。',
      metroHintFromArea: metro,
      stops,
    })
  }

  if (!days.length) {
    throw new LlmRequestError('无法解析行程天数，请再试一次。')
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
      note: String(stop.note || '').trim() || '按当天节奏灵活调整。',
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
      : { custom: '按导航或地铁前往下一个地点。' }

  const rawTitle = String(row.title || `第 ${day} 天`).trim()
  const cleanTitle = rawTitle.slice(0, 20).replace(/\s*[&,，、·\-]\s*$/, '').trim()
  return {
    day,
    title: cleanTitle || rawTitle.slice(0, 20),
    theme: String(row.theme || '').trim() || '巴黎日程',
    pace,
    summary: String(row.summary || '').trim() || '今天按地图与体力微调即可。',
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
    throw new LlmRequestError('未配置 OpenAI API Key，无法生成行程。', 'missing_key')
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
    (isEn ? 'Paris city center' : '巴黎市区')

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
    ? `${input.destination || (isEn ? 'the destination' : '目的地')} ${seasonForDate(input.calendarDate || input.itineraryStartDate, locale)} travel planner. Re-plan only the specified day based on the traveler's dates, flights, hotel, and verified place candidates.`
    : `${input.destination || '目的地'}${seasonForDate(input.calendarDate || input.itineraryStartDate, locale)}旅行规划师。根据旅客的日期、航班、酒店与已验证地点候选，只重新规划指定的一天。`
  const langRule = getLlmLanguageInstruction(locale)
  const outputFormat = isEn
    ? 'Output JSON only. No markdown. No explanation. Use the target locale language for user-visible copy.'
    : '只输出 JSON，不要 markdown，不要解释。文案用简体中文。'
  const jsonShape = '{ places: [{ key, googlePlaceId, name, nameLocal?, type: "cafe|attraction|restaurant|transport|hotel", area?, description, durationHint? }], day: { day, title, theme, pace: "relaxed|moderate|park|self-drive", summary, metroHintFromArea: { custom: "string" }, stops: [{ time: "HH:MM", placeKey, note, transport?: "transit|walking", walkLevel: "minimal|short|moderate", duration? }] } }'
  const jsonExample = isEn
    ? '{ "places": [{ "key": "cafe-day3", "googlePlaceId": "...", "name": "Café Kitsuné Palais Royal", "type": "cafe", "description": "Specialty coffee shop in the 1st arr." }], "day": { "day": 3, "title": "Right Bank Classics", "theme": "Louvre and Tuileries", "pace": "moderate", "summary": "Louvre in the morning, Tuileries stroll in the afternoon, Seine cruise at sunset.", "metroHintFromArea": { "custom": "Pick a route that fits real-time conditions." }, "stops": [{ "time": "09:30", "placeKey": "attr-louvre", "note": "Early entry; the three masterpieces first.", "transport": "transit", "walkLevel": "minimal" }] } }'
    : '{ "places": [{ "key": "cafe-day3", "googlePlaceId": "...", "name": "Café Kitsuné Palais Royal", "type": "cafe", "description": "1区精品咖啡小店。" }], "day": { "day": 3, "title": "右岸经典", "theme": "卢浮宫与杜伊勒里", "pace": "moderate", "summary": "上午卢浮宫，下午杜伊勒里花园散步，傍晚塞纳河游船。", "metroHintFromArea": { "custom": "按实时地图选择合适路线。" }, "stops": [{ "time": "09:30", "placeKey": "attr-louvre", "note": "早场入馆，先看镇馆三宝。", "transport": "transit", "walkLevel": "minimal" }] } }'
  const hardRules = isEn
    ? `<hard_rules>
- Output only Day ${dayNumber} (the "day" field must equal ${dayNumber}), plus any non-reserved places from the day's "places[]".
- Output structure (hard rule): the top level must include an object field "day" (with title / theme / pace / summary / stops). Do NOT spread title / stops at the root. "day.day" must be the number ${dayNumber}. Day title: short and punchy, 2–4 words, max 18 characters.
${roleRules.map((r) => `- ${r}`).join('\n')}
- Dedup (hard rule): do not use attractions / landmarks already present in occupiedElsewhere (same official name or same placeId); not within today either. The hotel "hotel-selected" and the airport "attr-cdg" are exempt; the Disney day allows exactly one "attr-disney".
- Soft preference: ordinary sightseeing days start around ${prefs.dayStartTime}; flights, reservations, opening hours, and explicit user requests take priority.
- ${
        prefs.preferLowWalking
          ? 'Soft preference: cluster same-area spots on the same day; prefer minimal walking and transfers.'
          : 'Moderate walking for richer days is acceptable when the route is sound.'
      }
- Transport classification (hard rule): transport must be one of "transit" or "walking" (codes). Do NOT guess specific lines, train numbers, station names, or taxis. The note for a stop should describe only what happens AT that stop, not the transport that leaves it. walkLevel is the walking intensity for the segment arriving at this stop, and must agree with transport.
- ${
        prefs.avoidLouvreAndVersailles
          ? 'Soft preference: do not volunteer Louvre or Versailles; honour the user if they explicitly ask for one.'
          : 'Louvre and Versailles are fair game based on route and time.'
      }
- The "places[]" array\'s ordinary entries MUST come from verifiedCandidates. Copy "name" and "googlePlaceId" verbatim; never invent places, ratings, addresses, or distances.
- User "explicitRequest" is the highest priority; "recommendationPreferences" is a soft preference; flights, date boundaries, place authenticity, and output structure are hard constraints.
- Reserved placeKeys (do not duplicate in places[]): "hotel-selected" (hotel), "attr-disney" (Disney), "attr-cdg" (Charles de Gaulle), "attr-champs" (Champs-Élysées), "attr-arc" (Arc de Triomphe).
- metroHintFromArea: at least one English metro/transit hint under "custom".
- time uses HH:MM. The airport-bound day may use "back-calculated from flight".
</hard_rules>`
    : `<hard_rules>
- 只输出 Day ${dayNumber} 这一天（day 字段必须为 ${dayNumber}），以及 places[] 中当天用到的非特殊地点。
- 输出结构硬规则：顶层必须包含对象字段 "day"（含 title/theme/pace/summary/stops），不要把 title/stops 直接摊在根上；"day.day" 必须是数字 ${dayNumber}。标题极简 2–5 字。
${roleRules.map((r) => `- ${r}`).join('\n')}
- 去重（硬规则）：不要使用 occupiedElsewhere 中已出现的景点/地标（同一正式名或同一 placeId）；当天内也不要重复。酒店 "hotel-selected"、机场 "attr-cdg" 除外；迪士尼日仅允许一个 "attr-disney"。
- 软偏好：普通游览日约 ${prefs.dayStartTime} 开始；航班、预约、营业时间和用户明确要求优先。
- ${
      prefs.preferLowWalking
        ? '软偏好：同日地点尽量同片区聚类，优先少步行、少换乘。'
        : '可接受适量步行以换取更丰富的行程。'
    }
- 交通分类（硬规则）：transport 只能输出「公共交通」或「步行」（对应 code "transit" / "walking"），不要猜测或输出具体线路、车次、站名、出租车等；具体路线以 Google Maps 为准。note 只写本站在做什么，不写离开本站的交通。walkLevel 表示到达本站这一段的步行强度，并与 transport 保持一致。
- ${
      prefs.avoidLouvreAndVersailles
        ? '软偏好：默认不主动安排卢浮宫或凡尔赛；用户明确要求时优先服从。'
        : '卢浮宫和凡尔赛可按路线与时间正常考虑。'
    }
- places[] 的普通地点只能从 verifiedCandidates 选择；name 与 googlePlaceId 必须原样复制，禁止另造地点、评分、地址或距离。
- 用户 explicitRequest 是最高优先级；recommendationPreferences 是可让步偏好；航班、日期、地点真实性和输出结构是硬约束。
- 特殊 placeKey 固定："hotel-selected"（酒店）、"attr-disney"（迪士尼）、"attr-cdg"（戴高乐机场）、"attr-champs"（香榭丽舍大街）、"attr-arc"（凯旋门）——这些可不必重复写在 places[]。
- metroHintFromArea 至少给 custom 一条中文地铁/交通提示。
- time 用 HH:MM；最后一天去机场可用「按航班倒推」。
</hard_rules>`

  const system = buildPrompt(
    role,
    null,
    langRule,
    getCommonRules(locale),
    getPlaceResearchDiscipline(locale),
    getCafeVsRestaurantRule(locale),
    `<output_format>${outputFormat}</output_format>`,
    hardRules,
    jsonContract(jsonShape, jsonExample, locale),
  )

  const user = JSON.stringify({
    trip: {
      destination: input.destination || (isEn ? 'Paris' : '巴黎'),
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
    verifiedCandidates: input.verifiedCandidates,
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
    throw new LlmRequestError('大模型没有返回单日行程。')
  }

  const parsed = extractJsonObject(text)
  if (!parsed) {
    throw new LlmRequestError(
      `无法解析单日行程 JSON，请再试一次。\npreview=${text.slice(0, 240).replace(/\s+/g, ' ')}`,
      'invalid_json',
    )
  }

  const rawPlaces = Array.isArray(parsed.places) ? (parsed.places as unknown[]) : []
  const places = parseItineraryPlaces(rawPlaces, input.verifiedCandidates)

  const dayRow = pickSingleDayRow(parsed, dayNumber)
  if (!dayRow) {
    throw new LlmRequestError(
      `单日行程为空，请再试一次。\npreview=${text.slice(0, 240).replace(/\s+/g, ' ')}`,
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
  if (!day) {
    throw new LlmRequestError('无法解析单日行程站点，请再试一次。')
  }

  return {
    day: { ...day, day: dayNumber },
    places,
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
      ? 'Paris itinerary translator. You translate the human-readable copy of a Paris trip from one language to another, preserving the day structure, IDs, and codes verbatim.'
      : '巴黎行程翻译专家。把一段巴黎行程的可读文案从源语言翻成目标语言，严格保留日程结构、ID 与各种 code 字段不译。'
  const sourceLabel = sourceLocale === 'en' ? 'English' : '简体中文'
  const targetLabel = targetLocale === 'en' ? 'English' : '简体中文'
  const hardRules =
    targetLocale === 'en'
      ? `<hard_rules>
- ${langRule}
- Translate EVERY user-facing string. NEVER change day numbers, pace, transport / walkLevel / type / placeKey / placeId values, times, or any other structured field.
- For every stop, translate the string fields: note, duration, and transport (if it is a human-readable label rather than a code).
- Preserve all placeKey values (e.g. "hotel-selected", "attr-cdg", "attr-disney", "attr-champs", "attr-arc") verbatim.
- Preserve all metroHintFromArea KEYS (marais / opera / boulevards / saintGermain / latin / trocadero / custom) verbatim; only translate the string VALUES.
- Translate naturally — no machine-translation stiltedness, no brand-name changes, no emoji added.
- Keep each tag concise. Day titles: 4–8 words. Day themes: 4–8 words. Summaries: 2–4 sentences, 40–80 words.
- For stop.duration: keep the same meaning (a duration estimate like "30–45 min" or "2 hours") and translate the wording. Do NOT drop the duration field.
- For stop.transport: if it is one of the codes "transit" / "walking" / "driving" / "cycling" keep it as the code; if it is a free-form Chinese/English description (e.g. "RER B / taxi from CDG") translate the free-form text.
- Keep the JSON structure EXACTLY identical (same keys, same array lengths, same nested object shape).
- Output the FULL translated days array — do not summarize or omit days.
- Strict JSON output: {"days":[...]} — no markdown, no commentary.
</hard_rules>`
      : `<hard_rules>
- ${langRule}
- 翻译所有面向用户的字符串，绝不改 day 编号 / pace / transport / walkLevel / type / placeKey / placeId / time 等任何结构化字段。
- 每个 stop 都必须翻译字符串字段：note、duration；如果 transport 是人话描述而不是 code，也要翻译。
- 保留所有 placeKey（如 "hotel-selected"、"attr-cdg"、"attr-disney"、"attr-champs"、"attr-arc"）原样。
- 保留所有 metroHintFromArea 的 KEY（marais / opera / boulevards / saintGermain / latin / trocadero / custom）原样，只翻字符串 VALUE。
- 译文自然地道，不要机翻腔、不改品牌名、不加 emoji。
- 标题简短：day.title 4–8 个字，day.theme 4–8 个字，summary 2–4 句 40–80 字。
- stop.duration：保留时长含义（"30–45 min" / "2 小时" 这种），只翻译措辞；不要把 duration 字段丢掉。
- stop.transport：如果是 "transit" / "walking" / "driving" / "cycling" 这些 code，保持原样；如果是中文/英文的人话描述（例如 "RER B / 出租车自戴高乐机场"），翻译人话。
- JSON 结构完全一致（同 key、同数组长度、同嵌套对象）。
- 输出完整 days 数组，不要省略任何一天。
- 严格 JSON 输出：{"days":[...]}，不要 markdown，不要解释。
</hard_rules>`

  const sourceNote =
    sourceLocale === targetLocale
      ? ''
      : `The source content is in ${sourceLabel}; translate it into ${targetLabel}.`
  return buildPrompt(
    role,
    null,
    langRule,
    sourceNote,
    hardRules,
    jsonContract(
      `{"days":[{day,title,theme,pace:"relaxed|moderate|park|self-drive",summary,metroHintFromArea:{custom:"string",...},stops:[{time:"HH:MM",placeKey,note,transport?:"transit|walking"|"free-form text",walkLevel:"minimal|short|moderate",duration?:"duration estimate"}]}]}`,
      targetLocale === 'en'
        ? '{"days":[{"day":1,"title":"Arrival in Paris","theme":"Settle in & jet lag","pace":"relaxed","summary":"After landing at CDG, head straight to the hotel to check in and unwind. A light stroll nearby in the afternoon.","metroHintFromArea":{"custom":"Pick a route that fits real-time conditions."},"stops":[{"time":"15:30","placeKey":"hotel-selected","note":"Check in and rest briefly.","transport":"transit","walkLevel":"minimal","duration":"30–45 min"},{"time":"17:30","placeKey":"cafe-lepro","note":"Coffee near the hotel.","transport":"walking","walkLevel":"short","duration":"45 min"}]}]}'
        : '{"days":[{"day":1,"title":"抵达巴黎","theme":"落地 · 安顿","pace":"relaxed","summary":"抵达 CDG 后直奔酒店办理入住，下午就近闲逛。","metroHintFromArea":{"custom":"按实时地图选择合适路线。"},"stops":[{"time":"15:30","placeKey":"hotel-selected","note":"办理入住，稍作休息。","transport":"transit","walkLevel":"minimal","duration":"30–45 分钟"},{"time":"17:30","placeKey":"cafe-lepro","note":"在酒店附近找家咖啡馆坐坐。","transport":"walking","walkLevel":"short","duration":"45 分钟"}]}]}',
      targetLocale,
    ),
  )
}

export async function translateItineraryText(
  input: TranslateItineraryTextInput,
): Promise<TranslateItineraryTextResult> {
  if (!isLlmConfigured()) {
    throw new LlmRequestError('未配置 OpenAI API Key，无法翻译行程文案。', 'missing_key')
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
        ? 'Itinerary translation did not complete. Please try again.'
        : '行程文案翻译未完成，请重试。',
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
