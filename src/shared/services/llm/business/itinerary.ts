/**
 * LLM call sites for itinerary generation (start / full / single-day).
 *
 * Owns the type contracts for itinerary drafts (the actual public shapes
 * callers import from `llm.ts`; `types.ts` has older/different shapes
 * left over from earlier refactors — this module is the source of truth).
 */
import type { FlightInfo } from '../../../../types'
import {
  CAFE_VS_RESTAURANT_RULE,
  COMMON_RULES,
  PLACE_RESEARCH_DISCIPLINE,
  buildPrompt,
  jsonContract,
} from '../prompts'
import { LlmRequestError } from '../errors'
import { extractJsonObject } from '../json'
import {
  recommendationPreferencesPrompt,
  type RecommendationPreferences,
} from '../../../../features/place/services/recommendationPreferences'
import type { VerifiedPlaceCandidate } from '../types'
import { generateText, isLlmConfigured } from './_service'

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
  transport?: string
  walkLevel?: '很少走' | '短步行' | '中等步行'
  duration?: string
}

export interface FullItineraryDayDraft {
  day: number
  title: string
  theme: string
  pace: '轻松' | '适中' | '乐园日' | '自驾日'
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
  hotel: GenerateFullItineraryInput['hotel']
  outbound?: GenerateFullItineraryInput['outbound']
  returnFlight?: GenerateFullItineraryInput['returnFlight']
  /** Places already used on other days — avoid duplicates. */
  occupiedPlaces: OccupiedPlaceBrief[]
  preferences?: string
  recommendationPreferences: RecommendationPreferences
  verifiedCandidates: VerifiedPlaceCandidate[]
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

function seasonForDate(isoDate: string): string {
  const month = Number(isoDate.slice(5, 7))
  if (month === 12 || month <= 2) return '冬季'
  if (month <= 5) return '春季'
  if (month <= 8) return '夏季'
  return '秋季'
}

// ── resolveItineraryStart ────────────────────────────────────────────────

/** Resolve the itinerary start only from structured flight timestamps. */
export async function resolveItineraryStart(
  input: ItineraryStartInput,
): Promise<ItineraryStartResult | null> {
  const start = input.tripStartDate?.trim()
  if (!start || !input.outbound?.flightNumber) return null
  return fallbackItineraryStart(start, input.outbound, input.tripEndDate)
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
    throw new LlmRequestError('未配置 OpenAI API Key，无法生成行程。', 'missing_key')
  }

  const n = Math.max(1, Math.min(30, Math.floor(input.dayCount) || 1))
  const prefs = input.recommendationPreferences
  const disneyDay = prefs.includeDisneyDay && n >= 3 ? n - 1 : null
  const hotelArea =
    input.hotel.area ||
    input.hotel.areaKey ||
    '巴黎市区'

  const system = buildPrompt(
    `${input.destination || '目的地'}${seasonForDate(input.itineraryStartDate)}旅行规划师。根据旅客的日期、航班、酒店和已验证地点候选生成完整多日行程。`,
    null,
    COMMON_RULES,
    PLACE_RESEARCH_DISCIPLINE,
    CAFE_VS_RESTAURANT_RULE,
    '<output_format>只输出 JSON，不要 markdown，不要解释。文案用简体中文，可带一点俏皮但不油腻。</output_format>',
    `<hard_rules>
- 必须输出恰好 ${n} 天（day 字段为 1..${n}），每天都有 title/theme/pace/summary/stops。
- Day 1：抵达日。第一站必须是酒店办理入住（placeKey 用 "hotel-selected"，type hotel）。轻行程、倒时差优先；Day 1 不强制咖啡馆开场。
- 除最后一天外：每一天的最后一站必须是回酒店过夜（placeKey "hotel-selected"，type hotel）。Day 1 若还有出门行程，则首站入住酒店 + 末站回酒店过夜（可两个 hotel-selected）；中间日早晨从酒店出发（酒店为原点，不必写在 stops 开头），末站仍须写回酒店。
- ${
      prefs.preferCafeStart
        ? '软偏好：除 Day 1 与迪士尼日外，普通游览日优先以 verifiedCandidates 中的 cafe 开始；路线或时间不合适时可不安排。'
        : '不要求以咖啡馆开始。'
    }
- ${
      disneyDay
        ? `软偏好：若航班、天数和用户明确要求没有冲突，优先把倒数第二天（Day ${disneyDay}）安排为巴黎迪士尼全日。若选择迪士尼日，则 pace=乐园日，出游站只保留一个 "attr-disney" 与末站回酒店，不另列园内餐饮或其它景点。`
        : '行程不足 3 天时可不安排独立迪士尼日。'
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
- 文案一致（硬规则）：note 只写本站在做什么（氛围/吃什么/看点），不要写「乘X号线回酒店」「地铁去下一站」等离开本站的具体交通；回酒店/去下一站由时间线站点之间的 Google 导航展示。walkLevel 表示到达本站这一段的步行强度，须与 transport 一致：若 transport 含地铁/公交则 walkLevel 不要写短步行/很少走。
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
    jsonContract(
      '{ places: [{ key, googlePlaceId, name, nameLocal?, type: "cafe|attraction|restaurant|transport|hotel", area?, description, durationHint? }], days: [{ day, title, theme, pace: "轻松|适中|乐园日|自驾日", summary, metroHintFromArea: { custom: "string" }, stops: [{ time: "HH:MM", placeKey, note, transport?, walkLevel: "很少走|短步行|中等步行", duration? }] }] }',
      '{ "places": [{ "key": "cafe-day2", "googlePlaceId": "...", "name": "Café Kitsuné Palais Royal", "type": "cafe", "area": "1区", "description": "1区皇家宫殿内的精品咖啡小店，可坐位。" }], "days": [{ "day": 1, "title": "抵达巴黎", "theme": "落地 · 安顿", "pace": "轻松", "summary": "抵达 CDG 后直奔酒店办理入住，下午就近闲逛。", "metroHintFromArea": { "custom": "16区特罗卡德罗周边 9 号线可换乘多条线路。" }, "stops": [{ "time": "15:30", "placeKey": "hotel-selected", "note": "办理入住，稍作休息。", "transport": "出租车", "walkLevel": "很少走" }] }] }',
    ),
  )

  const user = JSON.stringify({
    trip: {
      destination: input.destination || '巴黎',
      dayCount: n,
      nights: input.nights ?? Math.max(0, n - 1),
      tripStartDate: input.tripStartDate,
      tripEndDate: input.tripEndDate,
      itineraryStartDate: input.itineraryStartDate,
      explicitRequest: input.preferences || null,
      recommendationPreferences: recommendationPreferencesPrompt(prefs),
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
    webSearch: false,
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
    throw new LlmRequestError('无法解析行程 JSON，请再试一次。')
  }

  const rawPlaces = Array.isArray(parsed.places) ? (parsed.places as unknown[]) : []
  const rawDays = Array.isArray(parsed.days) ? (parsed.days as unknown[]) : []
  if (!rawDays.length) {
    throw new LlmRequestError('行程天数为空，请再试一次。')
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
      const walk = String(stop.walkLevel || '').trim()
      stops.push({
        time: String(stop.time || '10:00').trim() || '10:00',
        placeKey,
        note: String(stop.note || '').trim() || '按当天节奏灵活调整。',
        transport: String(stop.transport || '').trim() || undefined,
        walkLevel:
          walk === '很少走' || walk === '短步行' || walk === '中等步行'
            ? walk
            : '短步行',
        duration: String(stop.duration || '').trim() || undefined,
      })
    }
    const paceRaw = String(row.pace || '适中').trim()
    let pace: FullItineraryDayDraft['pace'] = '适中'
    if (paceRaw === '轻松' || paceRaw === '适中' || paceRaw === '乐园日' || paceRaw === '自驾日') {
      pace = paceRaw
    } else if (/disney|迪士尼|乐园/i.test(paceRaw)) pace = '乐园日'
    else if (/自驾/i.test(paceRaw)) pace = '自驾日'
    else if (/轻松/i.test(paceRaw)) pace = '轻松'

    const metro =
      row.metroHintFromArea && typeof row.metroHintFromArea === 'object'
        ? (row.metroHintFromArea as Record<string, string>)
        : { custom: '按导航或地铁前往下一个地点。' }

    days.push({
      day: dayNum,
      title: String(row.title || `第 ${dayNum} 天`).trim().slice(0, 16),
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
    const walk = String(stop.walkLevel || '').trim()
    stops.push({
      time: String(stop.time || '10:00').trim() || '10:00',
      placeKey,
      note: String(stop.note || '').trim() || '按当天节奏灵活调整。',
      transport: String(stop.transport || '').trim() || undefined,
      walkLevel:
        walk === '很少走' || walk === '短步行' || walk === '中等步行'
          ? walk
          : '短步行',
      duration: String(stop.duration || '').trim() || undefined,
    })
  }
  if (!stops.length) return null

  const paceRaw = String(row.pace || '适中').trim()
  let pace: FullItineraryDayDraft['pace'] = '适中'
  if (paceRaw === '轻松' || paceRaw === '适中' || paceRaw === '乐园日' || paceRaw === '自驾日') {
    pace = paceRaw
  } else if (/disney|迪士尼|乐园/i.test(paceRaw)) pace = '乐园日'
  else if (/自驾/i.test(paceRaw)) pace = '自驾日'
  else if (/轻松/i.test(paceRaw)) pace = '轻松'

  const metro =
    row.metroHintFromArea && typeof row.metroHintFromArea === 'object'
      ? (row.metroHintFromArea as Record<string, string>)
      : { custom: '按导航或地铁前往下一个地点。' }

  return {
    day,
    title: String(row.title || `第 ${day} 天`).trim().slice(0, 16),
    theme: String(row.theme || '').trim() || '巴黎日程',
    pace,
    summary: String(row.summary || '').trim() || '今天按地图与体力微调即可。',
    metroHintFromArea: metro,
    stops,
  }
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
  const hotelArea =
    input.hotel.area ||
    input.hotel.areaKey ||
    '巴黎市区'

  const roleRules: string[] = []
  if (isFirst) {
    roleRules.push(
      '今天是 Day 1 抵达日。第一站必须是酒店办理入住（placeKey 用 "hotel-selected"，type hotel）。轻行程、倒时差优先；不强制咖啡馆开场。',
      '若 Day 1 还有出门行程，则首站入住酒店 + 末站回酒店过夜（可两个 hotel-selected）。',
      'Day 1 餐饮：抵达办入住后若仍有空档，再安排午餐和/或晚餐；落地过晚可只安排晚餐。',
    )
  } else if (isLast) {
    roleRules.push(
      '今天是最后一天（返程日）：酒店仅作默认出发原点，不要把 hotel-selected 写入当天 stops（也不要末站回酒店）。完全由返程航班起飞时间倒推。',
      '国际航班预留 3–3.5 小时到 CDG（含交通）。若约 10:00 起床后时间紧张，可只安排机场一站（placeKey "attr-cdg"），不要硬塞景点；此时午餐/晚餐可省略。若上午仍有空档，可在去机场前安排一顿午餐或轻量咖啡馆（咖啡/甜点/brunch，非正餐 brasserie）。',
    )
  } else if (isDisney) {
    roleRules.push(
      `软偏好：若航班、当天时间和用户明确要求没有冲突，可把 Day ${dayNumber} 安排为巴黎迪士尼全日。若选择迪士尼日，则 pace=乐园日，出游站只保留一个 "attr-disney" 与末站回酒店，不另列园内餐饮或其它景点。`,
    )
  } else {
    roleRules.push(
      '中间日：早晨从酒店出发（酒店为原点，不必写在 stops 开头），末站必须回酒店过夜（placeKey "hotel-selected"，type hotel）。',
      prefs.preferCafeStart
        ? '软偏好：普通游览日优先以 verifiedCandidates 中的 cafe 开始；路线不合适时可不安排。'
        : '不要求以咖啡馆开始。',
      prefs.preferLunchAndDinner
        ? '软偏好：时间允许时优先安排午餐与晚餐两顿正餐（type=restaurant）。'
        : '餐饮站按当天路线与时间灵活安排。',
      prefs.includeChampsAndArc
        ? '若路线合适且 occupiedElsewhere 尚未包含香榭丽舍/凯旋门，可优先安排 "attr-champs" 与 "attr-arc"。'
        : '不强制安排香榭丽舍或凯旋门。',
    )
  }

  const occupiedNames = input.occupiedPlaces
    .map((p) => p.name?.trim())
    .filter(Boolean)
  const occupiedIds = input.occupiedPlaces
    .map((p) => p.placeId?.trim())
    .filter(Boolean)

  const system = buildPrompt(
    `${input.destination || '目的地'}${seasonForDate(input.calendarDate || input.itineraryStartDate)}旅行规划师。根据旅客的日期、航班、酒店与已验证地点候选，只重新规划指定的一天。`,
    null,
    COMMON_RULES,
    PLACE_RESEARCH_DISCIPLINE,
    CAFE_VS_RESTAURANT_RULE,
    '<output_format>只输出 JSON，不要 markdown，不要解释。文案用简体中文。</output_format>',
    `<hard_rules>
- 只输出 Day ${dayNumber} 这一天（day 字段必须为 ${dayNumber}），以及 places[] 中当天用到的非特殊地点。
${roleRules.map((r) => `- ${r}`).join('\n')}
- 去重（硬规则）：不要使用 occupiedElsewhere 中已出现的景点/地标（同一正式名或同一 placeId）；当天内也不要重复。酒店 "hotel-selected"、机场 "attr-cdg" 除外；迪士尼日仅允许一个 "attr-disney"。
- 软偏好：普通游览日约 ${prefs.dayStartTime} 开始；航班、预约、营业时间和用户明确要求优先。
- ${
      prefs.preferLowWalking
        ? '软偏好：同日地点尽量同片区聚类，优先少步行、少换乘。'
        : '可接受适量步行以换取更丰富的行程。'
    }
- 文案一致（硬规则）：note 只写本站在做什么（氛围/吃什么/看点），不要写「乘X号线回酒店」「地铁去下一站」等离开本站的具体交通；回酒店/去下一站由时间线站点之间的 Google 导航展示。walkLevel 表示到达本站这一段的步行强度，须与 transport 一致：若 transport 含地铁/公交则 walkLevel 不要写短步行/很少走。
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
</hard_rules>`,
    jsonContract(
      '{ places: [{ key, googlePlaceId, name, nameLocal?, type: "cafe|attraction|restaurant|transport|hotel", area?, description, durationHint? }], day: { day, title, theme, pace: "轻松|适中|乐园日|自驾日", summary, metroHintFromArea: { custom: "string" }, stops: [{ time: "HH:MM", placeKey, note, transport?, walkLevel: "很少走|短步行|中等步行", duration? }] } }',
      '{ "places": [{ "key": "cafe-day3", "googlePlaceId": "...", "name": "Café Kitsuné Palais Royal", "type": "cafe", "description": "1区精品咖啡小店。" }], "day": { "day": 3, "title": "右岸经典", "theme": "卢浮宫与杜伊勒里", "pace": "适中", "summary": "上午卢浮宫，下午杜伊勒里花园散步，傍晚塞纳河游船。", "metroHintFromArea": { "custom": "1/7/8 号线 Palais Royal – Musée du Louvre 站直达。" }, "stops": [{ "time": "09:30", "placeKey": "attr-louvre", "note": "早场入馆，先看镇馆三宝。", "transport": "地铁 1/7 号线", "walkLevel": "很少走" }] } }',
    ),
  )

  const user = JSON.stringify({
    trip: {
      destination: input.destination || '巴黎',
      dayCount: n,
      nights: input.nights ?? Math.max(0, n - 1),
      tripStartDate: input.tripStartDate,
      tripEndDate: input.tripEndDate,
      itineraryStartDate: input.itineraryStartDate,
      explicitRequest: input.preferences || null,
      recommendationPreferences: recommendationPreferencesPrompt(prefs),
    },
    regenerate: {
      dayNumber,
      calendarDate: input.calendarDate || null,
      role: isFirst
        ? 'arrival'
        : isLast
          ? 'return'
          : isDisney
            ? 'disney-preferred'
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
    webSearch: false,
    preflightContext: {
      destination: input.destination,
      dayNumber: input.dayNumber,
      recommendationPreferences: input.recommendationPreferences,
    },
    userText: input.preferences || input.destination,
  })
  if (!text) {
    throw new LlmRequestError('大模型没有返回单日行程。')
  }

  const parsed = extractJsonObject(text)
  if (!parsed) {
    throw new LlmRequestError('无法解析单日行程 JSON，请再试一次。')
  }

  const rawPlaces = Array.isArray(parsed.places) ? (parsed.places as unknown[]) : []
  const places = parseItineraryPlaces(rawPlaces, input.verifiedCandidates)

  let dayRow: Record<string, unknown> | null = null
  if (parsed.day && typeof parsed.day === 'object' && !Array.isArray(parsed.day)) {
    dayRow = parsed.day as Record<string, unknown>
  } else if (Array.isArray(parsed.days) && parsed.days[0] && typeof parsed.days[0] === 'object') {
    dayRow = parsed.days[0] as Record<string, unknown>
  }
  if (!dayRow) {
    throw new LlmRequestError('单日行程为空，请再试一次。')
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
