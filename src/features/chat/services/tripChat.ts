import { englishPromptFragments, chinesePromptFragments } from '../../../shared/i18n/prompts/tripChat-fragments-e9ecae'
import { runtimeCopy5 } from '../../../shared/i18n/copy/tripChat-runtime5-e9ecae'
import { chatInstruction } from '../../../shared/i18n/copy/chatInstructions'
import { runtimeCopy } from '../../../shared/i18n/copy/tripChat-runtime-e9ecae'
import { localizedCopy } from '../../../shared/i18n/copy/tripChat-e9ecae'
import { budgetChatHistory } from './chatHistoryBudget'
import { parseChatPlaceReferences, type ChatPlaceReference } from './chatPlaceReferences'
import { tryJevRoute } from '../../../shared/services/llm/jev-router'
import { stripLlmJsonWrapper } from '../../../shared/services/llm/json'
import type {
  DayPlan,
  FlightInfo,
  HotelCandidate,
  Place,
  PlaceType,
  SelectedHotel,
} from '../../../types'
import { getPlace } from '../../place/constants/places'
import {
  extractLlmJsonObject,
  getThinkingMode,
  LlmRequestError,
  openaiChat,
  openaiChatStream,
  openaiResponsesWithWebSearch,
  resolveThinkingForTask,
  type ChatMessageContentPart,
  type OpenAIChatMessage,
  type ResolvedThinking,
  type ResolvedThinkingEffort,
  type ThinkingEffortUi,
} from '../../../shared/services/llm/llm'
import { dateForTripDay, formatTripDayLabel } from '../../itinerary/services/tripDates'
import { searchNearbyGooglePlaceCandidates } from '../../map/services/googlePlaceDetails'
import {
  buildPrompt,
  getCommonRules,
  getChatOutputRules,
  getNoHallucinationRule,
  getPlaceResearchDiscipline,
  getRouterExamples,
  jsonContract,
} from '../../../shared/services/llm/prompts'
import { getLocale, getLlmLanguageInstruction } from '../../../shared/i18n'
export type TripChatAction =
  | { type: 'switch_day'; day: number }
  | { type: 'clear_places'; days?: number[]; placeTypes?: Array<'cafe' | 'restaurant' | 'attraction'> }
  | { type: 'select_place'; placeName: string }
  | {
      type: 'remove_place'
      day?: number
      placeName: string
    }
  | {
      type: 'add_place'
      day?: number
      placeName: string
      placeType?: PlaceType
      /** best = 最顺路插入；end = 加到当天最后。默认 best。 */
      mode?: 'best' | 'end'
      note?: string
      /**
       * explicit = user named the place → apply immediately;
       * recommend = model picked a place → detail-page confirm.
       * Default when omitted: recommend (safer).
       */
      source?: 'explicit' | 'recommend'
    }
  | {
      type: 'replace_place'
      day?: number
      /** Optional when user said「换一家X」without naming the old stop — resolve via type. */
      fromPlaceName?: string
      toPlaceName: string
      placeType?: PlaceType
      note?: string
      /**
       * explicit = user named the replacement → apply immediately;
       * recommend = model picked a replacement → detail-page confirm.
       * Default when omitted: recommend (safer).
       */
      source?: 'explicit' | 'recommend'
    }
  | {
      type: 'reorder_place'
      day?: number
      placeName: string
      /** 0-based target index within that day's stops */
      toIndex: number
    }
  | {
      type: 'select_hotel'
      hotelName: string
    }
  | {
      type: 'add_hotel'
      hotelName: string
      /** default true — also make it the selected stay */
      select?: boolean
    }
  | {
      type: 'remove_hotel'
      hotelName: string
    }
  | {
      /** Re-recommend a full hotel candidate batch from user preferences. */
      type: 'refresh_hotels'
      preferences?: string
      /** Keep custom-address cards (default true). */
      keepCustom?: boolean
    }
  | {
      /** Replace one candidate: explicit toHotelName and/or preference-driven pick. */
      type: 'replace_hotel'
      fromHotelName: string
      toHotelName?: string
      preferences?: string
      select?: boolean
    }
  | {
      /** Replace several candidates with preference-driven picks. */
      type: 'replace_hotels'
      fromHotelNames: string[]
      preferences?: string
    }

export interface TripChatResult {
  reply: string
  actions: TripChatAction[]
  places?: ChatPlaceReference[]
  rejectedActions?: number
}

export interface TripChatWorkStep {
  id: string
  label: string
  badges?: string[]
  status: 'pending' | 'active' | 'done' | 'skipped'
}

export interface TripChatTurn {
  role: 'user' | 'assistant'
  content: string
  places?: ChatPlaceReference[]
  images?: string[]
  /** Quoted excerpt shown above the user bubble (Ask about). */
  quoteContext?: string
  quote?: string
  /** When true, kept in API history but not shown as a chat bubble. */
  hidden?: boolean
  /** Pipeline steps persisted after a successful assistant reply. */
  steps?: TripChatWorkStep[]
  /** Optional thinking/reasoning text when the model exposes it. */
  reasoning?: string
}

/** Destination meta for prompts; only `name` is required from app state today. */
export interface TripChatDestination {
  name: string
  /** Local / native name when known (e.g. Paris). */
  locale?: string | null
  /** Country when known (e.g. 法国 / France). */
  country?: string | null
}

/** What the user is currently viewing in a detail overlay (PlacePanel / hotel popup). */
export type TripChatViewingTarget =
  | {
      type: 'place'
      id: string
      name: string
      nameLocal?: string | null
      placeType?: PlaceType
      description?: string | null
      cuisine?: string | null
      priceHint?: string | null
      ratingHint?: string | null
      /** Day number when this place is a stop on the current viewing day. */
      day?: number | null
      note?: string | null
    }
  | {
      type: 'hotel'
      id: string
      name: string
      address?: string | null
      area?: string | null
      description?: string | null
      priceHint?: string | null
      nearestMetro?: string | null
      reason?: string | null
      tripFit?: string | null
    }

export interface TripChatContext {
  hotel: SelectedHotel
  hotelCandidates: HotelCandidate[]
  days: DayPlan[]
  currentDay: number
  customPlaces: Record<string, Place>
  /** Primary destination from DestinationPanel / trip meta. */
  destination?: TripChatDestination | string | null
  /** Free-text trip preferences when the UI collects them. */
  preferences?: string | null
  /** Trip calendar range from TripDatesPanel (YYYY-MM-DD). */
  tripStartDate?: string | null
  tripEndDate?: string | null
  /** Day 1 calendar date (may differ from tripStartDate on late arrival). */
  itineraryStartDate?: string | null
  outbound?: FlightInfo | null
  returnFlight?: FlightInfo | null
  /**
   * Detail overlay the user currently has open (PlacePanel / hotel GooglePlacePage).
   * When set, 「这个 / 多少钱」等指代优先指向该对象。
   */
  viewing?: TripChatViewingTarget | null
}

function normalizeDestination(
  raw: TripChatContext['destination'],
): TripChatDestination | null {
  if (!raw) return null
  if (typeof raw === 'string') {
    const name = raw.trim()
    return name ? enrichKnownDestination({ name }) : null
  }
  const name = String(raw.name || '').trim()
  if (!name) return null
  return enrichKnownDestination({
    name,
    locale: raw.locale?.trim() || null,
    country: raw.country?.trim() || null,
  })
}

function looksLikeParis(parts: Array<string | null | undefined>): boolean {
  return /巴黎|paris/i.test(parts.filter(Boolean).join(' '))
}

/** Fill locale/country for well-known destinations when app only stores a name. */
function enrichKnownDestination(dest: TripChatDestination): TripChatDestination {
  if (looksLikeParis([dest.name, dest.locale, dest.country])) {
    return {
      name: dest.name,
      locale: dest.locale || 'Paris',
      country: dest.country || runtimeCopy('md4ac60484d', undefined),
    }
  }
  return dest
}

/** True when destination is Paris (current product default + Paris-only rules). */
export function isParisDestination(destination: TripChatContext['destination']): boolean {
  const dest = normalizeDestination(destination)
  if (!dest) return false
  return looksLikeParis([dest.name, dest.locale, dest.country])
}

/** Northern-hemisphere season label derived from a YYYY-MM-DD date (not hard-coded). */
export function seasonFromIsoDate(isoDate: string | null | undefined): string | null {
  if (!isoDate) return null
  const month = new Date(`${isoDate}T12:00:00`).getMonth() + 1
  if (Number.isNaN(month)) return null
  if (month >= 3 && month <= 5) return runtimeCopy('m58ecc8701f', undefined)
  if (month >= 6 && month <= 8) return runtimeCopy('m76e4fbe256', undefined)
  if (month >= 9 && month <= 11) return runtimeCopy('mce4e99b183', undefined)
  return runtimeCopy('mc63d5b7467', undefined)
}

function maxDayFromContext(ctx: TripChatContext): number {
  const fromDays = ctx.days?.length || 0
  return Math.max(1, fromDays, ctx.currentDay || 1)
}

function buildFlightSnapshot(flight: FlightInfo | null | undefined) {
  if (!flight?.flightNumber) return null
  return {
    flightNumber: flight.flightNumber,
    airline: flight.airline || '',
    from: flight.from
      ? {
          code: flight.from.code || '',
          city: flight.from.city || '',
          scheduled: flight.from.scheduled || '',
          actual: flight.from.actual || '',
        }
      : null,
    to: flight.to
      ? {
          code: flight.to.code || '',
          city: flight.to.city || '',
          scheduled: flight.to.scheduled || '',
          actual: flight.to.actual || '',
        }
      : null,
    duration: flight.duration || '',
    status: flight.status || '',
  }
}

function buildDestinationSnapshot(ctx: TripChatContext) {
  const dest = normalizeDestination(ctx.destination)
  if (!dest) {
    return {
      name: null,
      locale: null,
      country: null,
      isParis: false,
    }
  }
  return {
    name: dest.name,
    locale: dest.locale || null,
    country: dest.country || null,
    isParis: isParisDestination(dest),
  }
}

function buildTripDatesSnapshot(ctx: TripChatContext) {
  const start = ctx.tripStartDate || null
  const end = ctx.tripEndDate || null
  const itineraryStart = ctx.itineraryStartDate || start
  const currentCal =
    itineraryStart && ctx.currentDay
      ? dateForTripDay(itineraryStart, ctx.currentDay)
      : null
  const seasonAnchor = itineraryStart || start
  return {
    tripStartDate: start,
    tripEndDate: end,
    itineraryStartDate: itineraryStart,
    currentDay: ctx.currentDay,
    currentDayDate: currentCal,
    dayCount: maxDayFromContext(ctx),
    /** Derived from trip dates — never invent a season when dates are missing. */
    season: seasonFromIsoDate(seasonAnchor),
    labels: {
      tripStart: start ? formatTripDayLabel(start) : null,
      tripEnd: end ? formatTripDayLabel(end) : null,
      itineraryStart: itineraryStart ? formatTripDayLabel(itineraryStart) : null,
      currentDay: currentCal ? formatTripDayLabel(currentCal) : null,
    },
    outbound: buildFlightSnapshot(ctx.outbound),
    returnFlight: buildFlightSnapshot(ctx.returnFlight),
  }
}

function buildHotelSnapshot(ctx: TripChatContext) {
  return {
    selected: {
      id: ctx.hotel.id,
      name: ctx.hotel.name,
      address: ctx.hotel.address,
      areaKey: ctx.hotel.areaKey,
      nearestMetro: ctx.hotel.nearestMetro,
      description: ctx.hotel.description || '',
      ratingHint: ctx.hotel.ratingHint || '',
      source: ctx.hotel.source,
    },
    candidates: ctx.hotelCandidates.map((h) => ({
      id: h.id,
      name: h.name,
      area: h.area,
      address: h.address,
      description: h.description,
      priceHint: h.priceHint,
      nearestMetro: h.nearestMetro,
      reason: h.reason || '',
      isBest: Boolean(h.isBest),
      source: h.source,
      selected: h.id === ctx.hotel.id,
    })),
  }
}

function buildItinerarySnapshot(ctx: TripChatContext) {
  const itineraryStart = ctx.itineraryStartDate || ctx.tripStartDate || undefined
  return ctx.days.map((d) => {
    const cal = itineraryStart ? dateForTripDay(itineraryStart, d.day) : null
    return {
      day: d.day,
      date: cal,
      dateLabel: cal ? formatTripDayLabel(cal) : null,
      title: d.title,
      theme: d.theme,
      pace: d.pace,
      summary: d.summary,
      stops: d.stops.map((s, i) => {
        try {
          const p = getPlace(s.placeId, ctx.customPlaces)
          return {
            index: i,
            stopId: s.id || `d${d.day}-${s.placeId}-${i}`,
            placeId: s.placeId,
            name: p.name,
            nameLocal: p.nameLocal || '',
            type: p.type,
            note: s.note,
            time: s.time,
          }
        } catch {
          return {
            index: i,
            stopId: s.id || `d${d.day}-${s.placeId}-${i}`,
            placeId: s.placeId,
            name: s.placeId,
            nameLocal: '',
            type: 'attraction',
            note: s.note,
            time: s.time,
          }
        }
      }),
    }
  })
}

function buildViewingSnapshot(ctx: TripChatContext) {
  const v = ctx.viewing
  if (!v || (v.type !== 'place' && v.type !== 'hotel')) return null
  if (v.type === 'place') {
    return {
      type: 'place' as const,
      id: v.id,
      name: v.name,
      nameLocal: v.nameLocal || null,
      placeType: v.placeType || null,
      description: v.description || null,
      cuisine: v.cuisine || null,
      priceHint: v.priceHint || null,
      ratingHint: v.ratingHint || null,
      day: v.day ?? null,
      note: v.note || null,
    }
  }
  return {
    type: 'hotel' as const,
    id: v.id,
    name: v.name,
    address: v.address || null,
    area: v.area || null,
    description: v.description || null,
    priceHint: v.priceHint || null,
    nearestMetro: v.nearestMetro || null,
    reason: v.reason || null,
    tripFit: v.tripFit || null,
  }
}

function systemPrompt(ctx: TripChatContext, plan: TripChatRequestPlan): string {
  const dates = buildTripDatesSnapshot(ctx)
  const destination = buildDestinationSnapshot(ctx)
  const destName = destination.name || runtimeCopy('me203a4c760', undefined)
  const hasTripDates = Boolean(dates.tripStartDate && dates.tripEndDate)
  const dayCount = dates.dayCount
  const dayRange = `1-${dayCount}`
  const currentDayLabel = dates.labels.currentDay
    ? runtimeCopy('m250b4a823a', { p0: (dates.labels.currentDay), p1: (dates.currentDayDate) })
    : ''
  const prefs = String(ctx.preferences || '').trim()

  // -----------------------------------------------------------------------
  // Role + context. The role line lives in <role>…</role> so it's the first
  // thing the model sees, and the trip-state snapshot is framed as DATA not
  // instructions (handled by COMMON_RULES.data_isolation).
  // -----------------------------------------------------------------------
  const activeLocale = getLocale()
  const langRule = getLlmLanguageInstruction()
  const role = activeLocale === 'en'
    ? localizedCopy('m130649e895', { p0: (destName), p1: (langRule) }, 'en')
    : localizedCopy('m130649e895', { p0: (destName), p1: (langRule) }, 'zh-CN')

  const contextParts: string[] = []
  if (dates.season) {
    contextParts.push(
      chatInstruction('mfe971d9cc7', { p0: (dates.season) }),
    )
  } else {
    contextParts.push(chatInstruction('m980ea0bd24'))
  }

  if (hasTripDates) {
    contextParts.push(
      chatInstruction('m6246ee3ebf', { p0: (dates.tripStartDate), p1: (dates.labels.tripStart), p2: (dates.tripEndDate), p3: (dates.labels.tripEnd), p4: (dates.itineraryStartDate), p5: (dates.labels.itineraryStart), p6: (dayCount) }),
    )
  } else {
    contextParts.push(
      chatInstruction('m43e536f986'),
    )
  }

  if (!destination.name) {
    contextParts.push(
      chatInstruction('ma96dc1e488'),
    )
  } else if (destination.isParis) {
    contextParts.push(
      chatInstruction('mda66546dd3'),
    )
  }

  if (prefs) {
    contextParts.push(chatInstruction('m55003ac08b'))
  }

  const viewing = buildViewingSnapshot(ctx)
  if (viewing) {
    const label =
      viewing.type === 'place'
        ? runtimeCopy('m07b930df67', { p0: (viewing.name), p1: (viewing.nameLocal ? `（${viewing.nameLocal}）` : '') })
        : runtimeCopy('mcc85884dd5', { p0: (viewing.name) })
    contextParts.push(
      chatInstruction('med022b0b76', { p0: (label) }),
    )
  } else {
    contextParts.push(
      chatInstruction('mf09f6d5b26'),
    )
  }

  contextParts.push(
    chatInstruction('mba2d8c821f', { p0: (ctx.currentDay), p1: (currentDayLabel) }),
  )

  contextParts.push(
    activeLocale === 'en'
      ? localizedCopy('m8ecd025b6b', undefined, 'en')
      : localizedCopy('m8ecd025b6b', undefined, 'zh-CN'),
  )

  contextParts.push(
    activeLocale === 'en'
      ? localizedCopy('me1dce588f9', undefined, 'en')
      : localizedCopy('me1dce588f9', undefined, 'zh-CN'),
  )

  const context = contextParts.join('\n\n')

  // -----------------------------------------------------------------------
  // Hard rules. Re-grouped by concern (vs the original flat bullet list)
  // so the model can scan to the right section.
  // -----------------------------------------------------------------------
  const itineraryRules = activeLocale === 'en'
    ? localizedCopy('m119c85e580', { p0: (dayRange), p1: (dayRange), p2: (dayCount) }, 'en')
    : localizedCopy('m119c85e580', { p0: (dayRange), p1: (dayRange), p2: (dayCount) }, 'zh-CN')

  // -----------------------------------------------------------------------
  // Few-shot examples. Two short cases that disambiguate the trickiest
  // boundaries (add vs replace_place, with/without explicit naming).
  // -----------------------------------------------------------------------
  const examples = activeLocale === 'en'
    ? localizedCopy('me9fbba0303', undefined, 'en')
    : localizedCopy('me9fbba0303', undefined, 'zh-CN')

  // -----------------------------------------------------------------------
  // Assemble. `buildPrompt` lays sections out as <role>/<context>/[hard rules]
  // /<json_contract> in that order. plan.intent==="answer" skips the action
  // sections so the prompt stays compact for pure Q&A.
  // -----------------------------------------------------------------------
  const base = buildPrompt(
    role,
    context,
    getCommonRules(activeLocale),
    getChatOutputRules(activeLocale),
    plan.intent === 'answer'
      ? ''
      : [
          getPlaceResearchDiscipline(activeLocale),
          getNoHallucinationRule(activeLocale),
          itineraryRules,
          examples,
        ]
          .filter(Boolean)
          .join('\n\n'),
    jsonContract(
      plan.intent === 'answer'
        ? (activeLocale === 'en'
            ? localizedCopy('mef43272e0c', undefined, 'en')
            : localizedCopy('mef43272e0c', undefined, 'zh-CN'))
        : (activeLocale === 'en'
            ? localizedCopy('m42483e2b11', undefined, 'en')
            : localizedCopy('m42483e2b11', undefined, 'zh-CN')),
      plan.intent === 'answer'
        ? (activeLocale === 'en'
            ? localizedCopy('mb9e81e3b91', undefined, 'en')
            : localizedCopy('mb9e81e3b91', undefined, 'zh-CN'))
        : (activeLocale === 'en'
            ? localizedCopy('m29d83e10b7', undefined, 'en')
            : localizedCopy('m29d83e10b7', undefined, 'zh-CN')),
      activeLocale,
    ),
  )

  return base
}

/** Heuristic: user is asking for live/public facts beyond the itinerary plan. */
export function tripChatNeedsWebResearch(userMessage: string, hasImages = false): boolean {
  const text = userMessage.trim()
  if (!text && !hasImages) return false
  // An explicit request to browse always wins over the automatic heuristic.
  if (
    /联网|上网|网络搜索|网页搜索|web\s*search|search\s+the\s+web|搜一下|搜索一下|网上查|查查网上/i.test(
      text,
    )
  ) {
    return true
  }
  // Pure visual recognition questions on attached images (e.g. "这是什么地方", "图中是什么建筑")
  // should not trigger web search unless explicitly asking for live details.
  if (
    hasImages &&
    !/价格|价位|人均|多少钱|贵不贵|便宜吗|营业|开门|关门|几点开|几点关|open(ing)?\s*hours?|门票|票价|预约|天气|几度|下雨/i.test(
      text,
    )
  ) {
    return false
  }
  // Open-ended recommendations need live candidates and ratings before the
  // model chooses a place. This is handled primarily by Google Places below.
  if (isLivePlaceRecommendationRequest(text)) return true
  // Pure itinerary edits usually don't need web search.
  if (
    /^(帮我)?(把|将)?.{0,24}(换成|改成|替换成|换成别的)/.test(text) &&
    !/(价格|多少钱|菜单|营业|开门|票价|门票)/.test(text)
  ) {
    return false
  }
  if (
    /^(加|加上|新增|删除|去掉|移除|选中|切换到|换成第)/.test(text) &&
    !/(价格|多少钱|菜单|营业|票价|门票|天气)/.test(text)
  ) {
    return false
  }
  return /价格|价位|人均|多少钱|贵不贵|便宜吗|菜单|menu|营业|开门|关门|几点开|几点关|open(ing)?\s*hours?|营业时间|门票|票价|预约|订位|排队|天气|气温|几度|下雨|降雨|forecast|ticket|price|活动|展览|展会|演出|音乐会|节庆|市集|event|exhibition|concert|festival|€|\byen\b|欧元|法郎/i.test(
    text,
  )
}

export function isLivePlaceRecommendationRequest(text: string): boolean {
  const hasPlaceKind =
    /餐厅|饭店|晚餐|午餐|早餐|咖啡|甜品|酒吧|景点|博物馆|商店|购物|restaurant|cafe|coffee|museum/i.test(
      text,
    )
  if (!hasPlaceKind) return false
  return /推荐|帮我找|找一家|找一个|找个|换一家|换一个|换个|换成别的|附近|近一点|更近/i.test(
    text,
  )
}

function recommendationSearchQuery(ctx: TripChatContext, userMessage: string): {
  textQuery: string
  maxDistanceMeters: number
} | null {
  if (!isLivePlaceRecommendationRequest(userMessage)) return null
  if (
    !Number.isFinite(ctx.hotel.lat) ||
    !Number.isFinite(ctx.hotel.lng) ||
    (ctx.hotel.lat === 0 && ctx.hotel.lng === 0)
  ) {
    return null
  }

  const type = inferPlaceTypeFromText(userMessage) || 'attraction'
  const normalizedDestination = normalizeDestination(ctx.destination)
  const destination =
    normalizedDestination?.locale || normalizedDestination?.name || 'Paris'
  let category = type === 'cafe' ? 'cafe' : type === 'restaurant' ? 'restaurant' : englishPromptFragments('me0263e292b')
  const cuisineHints: Array<[RegExp, string]> = [
    [/中餐|中国菜|川菜|粤菜/, englishPromptFragments('mdeafa943ec')],
    [/法餐|法国菜/, englishPromptFragments('mcbf0ea2b20')],
    [/意大利|披萨|pizza/i, englishPromptFragments('md09aca256e')],
    [/日料|日本菜|寿司|sushi/i, englishPromptFragments('mcdf36a9c5e')],
    [/韩餐|韩国菜/, englishPromptFragments('m27c3e2ed51')],
    [/素食|vegan|vegetarian/i, englishPromptFragments('md3a193e374')],
    [/海鲜|seafood/i, englishPromptFragments('maa80b73ae4')],
    [/牛排|steak/i, 'steakhouse'],
  ]
  const cuisine = cuisineHints.find(([pattern]) => pattern.test(userMessage))?.[1]
  if (cuisine) category = cuisine

  const explicitlyNearbyHotel =
    /离.{0,6}酒店.{0,8}(近|附近)|酒店.{0,8}(附近|近一点|更近)/.test(userMessage)
  const maxDistanceMeters = explicitlyNearbyHotel
    ? 5_000
    : type === 'restaurant' || type === 'cafe'
      ? 20_000
      : 75_000
  return { textQuery: `${category} ${destination}`, maxDistanceMeters }
}

async function fetchGooglePlaceRecommendationResearch(input: {
  ctx: TripChatContext
  userMessage: string
}): Promise<string | null> {
  const query = recommendationSearchQuery(input.ctx, input.userMessage)
  if (!query) return null
  try {
    const candidates = await searchNearbyGooglePlaceCandidates({
      textQuery: query.textQuery,
      location: { lat: input.ctx.hotel.lat, lng: input.ctx.hotel.lng },
      maxDistanceMeters: query.maxDistanceMeters,
      limit: 5,
    })
    if (!candidates.length) return null
    const rows = candidates.map((candidate, index) => {
      const rating = candidate.rating != null ? candidate.rating.toFixed(1) : runtimeCopy('m5dbd015496', undefined)
      const reviews = candidate.userRatingCount != null ? runtimeCopy('m6a8bb9403f', { p0: (candidate.userRatingCount) }) : runtimeCopy('ma4af10fb35', undefined)
      const distance = runtimeCopy('m5cca5d695f', { p0: ((candidate.distanceMeters / 1000).toFixed(1)) })
      const price = candidate.priceLevel ? runtimeCopy('ma6b0d87966', { p0: (candidate.priceLevel) }) : ''
      return runtimeCopy5('m4009d33f3b', { p0: (index + 1), p1: (candidate.name), p2: (rating), p3: (reviews), p4: (distance), p5: (price), p6: (candidate.address || runtimeCopy5('addressMissing')) })
    })
    return [
      runtimeCopy5('md585a00891', undefined),
      runtimeCopy5('m80bac2b3af', { p0: (Math.round(query.maxDistanceMeters / 1000)) }),
      ...rows,
      runtimeCopy5('m1b0bb2527a', undefined),
    ].join('\n')
  } catch {
    return null
  }
}

function webResearchInstructions(ctx: TripChatContext): string {
  const dest = buildDestinationSnapshot(ctx)
  const destName = dest.name || runtimeCopy('me203a4c760', undefined)
  const dates = buildTripDatesSnapshot(ctx)
  const viewing = buildViewingSnapshot(ctx)
  const locale = getLocale()

  const contextParts: string[] = [
    `<destination>${destName}${dest.country ? ` (${dest.country})` : ''}</destination>`,
    dates.tripStartDate && dates.tripEndDate
      ? locale === 'en'
        ? localizedCopy('m12ad7a89d9', { p0: (dates.tripStartDate), p1: (dates.tripEndDate) }, 'en')
        : localizedCopy('m12ad7a89d9', { p0: (dates.tripStartDate), p1: (dates.tripEndDate) }, 'zh-CN')
      : locale === 'en'
        ? localizedCopy('ma3e2f61a82', undefined, 'en')
        : localizedCopy('ma3e2f61a82', undefined, 'zh-CN'),
  ]
  if (viewing) {
    const subject =
      viewing.type === 'place'
        ? locale === 'en'
          ? localizedCopy('m4806a6d16b', { p0: (viewing.name), p1: (viewing.nameLocal ? ` / ${viewing.nameLocal}` : '') }, 'en')
          : localizedCopy('m4806a6d16b', { p0: (viewing.name), p1: (viewing.nameLocal ? ` / ${viewing.nameLocal}` : '') }, 'zh-CN')
        : locale === 'en'
          ? localizedCopy('m1e77e5cf5d', { p0: (viewing.name), p1: (viewing.address ? ` (${viewing.address})` : '') }, 'en')
          : localizedCopy('m1e77e5cf5d', { p0: (viewing.name), p1: (viewing.address ? `（${viewing.address}）` : '') }, 'zh-CN')
    contextParts.splice(
      1,
      0,
      locale === 'en'
        ? localizedCopy('mceaa174238', { p0: (subject) }, 'en')
        : localizedCopy('mceaa174238', { p0: (subject) }, 'zh-CN'),
    )
  }

  return buildPrompt(
    locale === 'en'
      ? localizedCopy('m2fd2673685', undefined, 'en')
      : localizedCopy('m2fd2673685', undefined, 'zh-CN'),
    contextParts.join('\n\n'),
    locale === 'en'
      ? localizedCopy('m59dd8255e4', undefined, 'en')
      : localizedCopy('m59dd8255e4', undefined, 'zh-CN'),
    locale === 'en'
      ? localizedCopy('m9334006693', undefined, 'en')
      : localizedCopy('m9334006693', undefined, 'zh-CN'),
  )
}

/**
 * OpenAI Responses + web_search research step for trip chat.
 * Returns null when search is unavailable or fails (chat continues without it).
 */
export async function fetchTripChatWebResearch(input: {
  ctx: TripChatContext
  userMessage: string
  signal?: AbortSignal
  onSearch?: (detail: TripChatWebSearchDetail) => void
}): Promise<string | null> {
  const googleQuery = recommendationSearchQuery(input.ctx, input.userMessage)
  if (googleQuery) {
    input.onSearch?.({ source: 'google_places', query: googleQuery.textQuery })
  }
  const googleResearch = await fetchGooglePlaceRecommendationResearch(input)
  if (googleResearch) {
    const lines = googleResearch.split('\n').filter((l) => /^\d+\./.test(l))
    if (googleQuery) {
      input.onSearch?.({
        source: 'google_places',
        query: googleQuery.textQuery,
        sourcesCount: lines.length || 5,
      })
    }
    return googleResearch
  }
  try {
    // Provisional detail until the stream reveals the real query.
    input.onSearch?.({ source: 'web', query: input.userMessage })
    const dates = buildTripDatesSnapshot(input.ctx)
    const datedQuery =
      dates.tripStartDate && dates.tripEndDate
        ? runtimeCopy5('m6fffb47e62', { p0: (dates.tripStartDate), p1: (dates.tripEndDate), p2: (input.userMessage) })
        : input.userMessage
    const result = await openaiResponsesWithWebSearch({
      instructions: webResearchInstructions(input.ctx),
      user: datedQuery,
      signal: input.signal,
      // Forward each `web_search_call` query as soon as the stream sees it,
      // so the work-step flips from "<userText>" → "<real query>" while the
      // search is still in flight, not after.
      onWebSearchQuery: (q) => {
        input.onSearch?.({ source: 'web', query: q })
      },
    })
    // Belt-and-suspenders: if the streaming callback somehow didn't fire
    // (older bundle, non-stream fallback, etc.), still promote the first
    // real query to the work-step so the user sees it after completion.
    const realQuery = result.webSearchQueries[0] || input.userMessage
    input.onSearch?.({
      source: 'web',
      query: realQuery,
      sourcesCount: Math.max(1, result.webSearchQueries.length),
    })
    const trimmed = result.text.trim()
    return trimmed || null
  } catch {
    return null
  }
}

function buildTripChatMessages(input: {
  ctx: TripChatContext
  history: TripChatTurn[]
  userMessage: string
  images?: string[]
  webResearch?: string | null
  plan: TripChatRequestPlan
}): OpenAIChatMessage[] {
  const messages: OpenAIChatMessage[] = [
    { role: 'system', content: systemPrompt(input.ctx, input.plan) },
    ...budgetChatHistory(input.history).map((t) => {
      const text = t.quote ? [t.quoteContext ? englishPromptFragments('m5f3a628488', { p0: (JSON.stringify(t.quoteContext)) }) : '', t.quote, t.content].filter(Boolean).join('\n') : t.content
      if (t.role === 'user' && t.images && t.images.length > 0) {
        const parts: ChatMessageContentPart[] = [
          { type: 'text', text },
          ...t.images.map((img) => ({
            type: 'image_url' as const,
            image_url: { url: img },
          })),
        ]
        return { role: 'user' as const, content: parts }
      }
      return { role: t.role, content: text }
    }),
  ]
  const contextBlocks: string[] = [
    '<app_state_data>\n' +
      runtimeCopy5('m213890a550', undefined) +
      JSON.stringify({
        destination: buildDestinationSnapshot(input.ctx),
        dates: buildTripDatesSnapshot(input.ctx),
        currentDay: input.ctx.currentDay,
        viewing: buildViewingSnapshot(input.ctx),
        recommendationPreferences: input.ctx.preferences || '',
        hotel: buildHotelSnapshot(input.ctx),
        itinerary: buildItinerarySnapshot(input.ctx),
      }) +
      '\n</app_state_data>',
  ]

  const research = String(input.webResearch || '').trim()
  if (research) {
    const isGooglePlacesShortlist = (['en', 'zh-CN'] as const).some((locale) => research.includes(runtimeCopy5('md585a00891', undefined, locale)))
    contextBlocks.push(
      '<untrusted_research_data>\n' +
        (isGooglePlacesShortlist
          ? runtimeCopy5('m4f7664f4ae', undefined) +
            runtimeCopy5('m99d2396747', undefined)
          : runtimeCopy5('m5059afe7c5', undefined) +
            runtimeCopy5('mc7ecaf37e0', undefined) +
            runtimeCopy5('m612966edfb', undefined)) +
        '\n\n' +
        research +
        '\n</untrusted_research_data>',
    )
  }

  const contextPrefix = contextBlocks.join('\n\n')
  // Keep terse / verbatim user requests inside the reply field. Otherwise
  // JSON-mode providers may mask a plain-text answer into an empty stream.
  const requestText = `${contextPrefix}\n\n${input.userMessage}\n\n${chatInstruction('executionContract')}\n${chatInstruction('responseEnvelope')}`

  if (input.images && input.images.length > 0) {
    const parts: ChatMessageContentPart[] = [
      { type: 'text', text: requestText },
      ...input.images.map((img) => ({
        type: 'image_url' as const,
        image_url: { url: img },
      })),
    ]
    messages.push({ role: 'user', content: parts })
  } else {
    messages.push({ role: 'user', content: requestText })
  }

  return messages
}

function normalizePlaceType(raw: unknown): PlaceType | undefined {
  const v = String(raw || '').toLowerCase()
  if (!v) return undefined
  if (v.includes('cafe') || v.includes('coffee') || v === '咖啡馆') return 'cafe'
  if (v.includes('restaurant') || v.includes('food') || v === '餐厅') return 'restaurant'
  if (v.includes('hotel') || v === '酒店') return 'hotel'
  if (v.includes('transport') || v === '交通') return 'transport'
  return 'attraction'
}

/** explicit = named by user; recommend = model pick (default when omitted). */
function parsePlaceActionSource(row: Record<string, unknown>): 'explicit' | 'recommend' {
  if (row.source != null && String(row.source).trim() !== '') {
    const v = String(row.source).toLowerCase().trim()
    if (v === 'explicit' || v === 'named' || v === 'user' || v === 'direct') return 'explicit'
    return 'recommend'
  }
  // Legacy confirm flag: false = apply immediately (no detail-page confirm).
  if (row.confirm === false || row.confirm === 'false' || row.confirm === 0) return 'explicit'
  return 'recommend'
}

/** Normalize model action type aliases → canonical snake_case. */
function normalizeActionType(raw: unknown): string {
  const v = String(raw || '')
    .trim()
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toLowerCase()
  if (v === 'addplace' || v === 'add_stop' || v === 'addstop') return 'add_place'
  if (v === 'replaceplace' || v === 'replacestop' || v === 'replace_stop') return 'replace_place'
  if (v === 'removeplace' || v === 'removestop' || v === 'remove_stop' || v === 'delete_place')
    return 'remove_place'
  if (v === 'selectplace' || v === 'select_stop') return 'select_place'
  if (v === 'reorderplace' || v === 'reorder_stop') return 'reorder_place'
  if (v === 'switchday' || v === 'set_day' || v === 'setday') return 'switch_day'
  if (v === 'selecthotel') return 'select_hotel'
  if (v === 'addhotel') return 'add_hotel'
  if (v === 'removehotel') return 'remove_hotel'
  if (v === 'refreshhotels' || v === 'refresh_hotel') return 'refresh_hotels'
  if (v === 'replacehotel') return 'replace_hotel'
  if (v === 'replacehotels') return 'replace_hotels'
  if (['clear_itinerary', 'clear_days', 'clear_stops', 'remove_all_places', 'delete_all_places'].includes(v)) return 'clear_places'
  return v
}

/** Coerce actions field: array, single object, or JSON string. */
function coerceActionsArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    const text = raw.trim()
    if (!text) return []
    try {
      const parsed = JSON.parse(text) as unknown
      if (Array.isArray(parsed)) return parsed
      if (parsed && typeof parsed === 'object') return [parsed]
    } catch {
      return []
    }
    return []
  }
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>
    // Some models wrap as { actions: [...] } again or emit a lone action object.
    if (Array.isArray(obj.actions)) return obj.actions
    if (obj.type != null) return [obj]
  }
  return []
}

function parseActions(raw: unknown, maxDay = 30): TripChatAction[] {
  const list = coerceActionsArray(raw)
  const out: TripChatAction[] = []
  const dayOk = (day: number) => Number.isInteger(day) && day >= 1 && day <= maxDay

  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const type = normalizeActionType(row.type)
    // Invalid explicit targets must never become an edit to the current day.
    if (row.day != null && !dayOk(Number(row.day))) continue

    if (type === 'clear_places') {
      const rawDays = row.days ?? (row.day != null ? [row.day] : undefined)
      if (!Array.isArray(rawDays) || !rawDays.length || !rawDays.every(d => dayOk(Number(d)))) continue
      const rawTypes = row.placeTypes
      // An omitted category must not accidentally broaden "clear cafes" to all activities.
      if (!Array.isArray(rawTypes) || !rawTypes.length || !rawTypes.every(t => ['cafe', 'restaurant', 'attraction'].includes(String(t)))) continue
      out.push({ type, ...(rawDays ? { days: [...new Set((rawDays as unknown[]).map(Number))] } : {}), ...(rawTypes ? { placeTypes: rawTypes as Array<'cafe' | 'restaurant' | 'attraction'> } : {}) })
      continue
    }

    if (type === 'switch_day') {
      const day = Number(row.day)
      if (dayOk(day)) out.push({ type: 'switch_day', day })
      continue
    }

    if (type === 'select_place') {
      const placeName = String(row.placeName || '').trim()
      if (placeName) out.push({ type: 'select_place', placeName })
      continue
    }

    if (type === 'remove_place') {
      const placeName = String(row.placeName || '').trim()
      if (!placeName) continue
      const day = Number(row.day)
      out.push({
        type: 'remove_place',
        placeName,
        day: dayOk(day) ? day : undefined,
      })
      continue
    }

    if (type === 'add_place') {
      const placeName = String(row.placeName || row.name || '').trim()
      if (!placeName) continue
      const day = Number(row.day)
      const modeRaw = String(row.mode || 'best').toLowerCase()
      // Default to best (最顺路). Only honor explicit "end".
      const mode = modeRaw === 'end' || modeRaw === 'last' || modeRaw === '最后' ? 'end' : 'best'
      out.push({
        type: 'add_place',
        placeName,
        placeType: normalizePlaceType(row.placeType || row.typeHint),
        mode,
        source: parsePlaceActionSource(row),
        note: String(row.note || '').trim() || undefined,
        day: dayOk(day) ? day : undefined,
      })
      continue
    }

    if (type === 'replace_place') {
      // fromPlaceName is optional —「换一家餐厅」often omits the old stop; resolve side infers it.
      // Bare `placeName` is the NEW place when to* fields are absent (common model shorthand).
      const toPlaceName = String(
        row.toPlaceName || row.newPlaceName || row.replaceWith || row.placeName || '',
      ).trim()
      const fromPlaceName = String(row.fromPlaceName || row.oldPlaceName || '').trim()
      if (!toPlaceName) continue
      const day = Number(row.day)
      out.push({
        type: 'replace_place',
        fromPlaceName: fromPlaceName || undefined,
        toPlaceName,
        placeType: normalizePlaceType(row.placeType || row.typeHint),
        source: parsePlaceActionSource(row),
        note: String(row.note || '').trim() || undefined,
        day: dayOk(day) ? day : undefined,
      })
      continue
    }

    if (type === 'reorder_place') {
      const placeName = String(row.placeName || '').trim()
      const toIndex = Number(row.toIndex)
      if (!placeName || !Number.isFinite(toIndex)) continue
      const day = Number(row.day)
      out.push({
        type: 'reorder_place',
        placeName,
        toIndex: Math.max(0, Math.floor(toIndex)),
        day: dayOk(day) ? day : undefined,
      })
      continue
    }

    if (type === 'select_hotel') {
      const hotelName = String(row.hotelName || row.name || row.placeName || '').trim()
      if (hotelName) out.push({ type: 'select_hotel', hotelName })
      continue
    }

    if (type === 'add_hotel') {
      const hotelName = String(row.hotelName || row.name || row.placeName || '').trim()
      if (!hotelName) continue
      const select =
        row.select === false || row.select === 'false' || row.select === 0 ? false : true
      out.push({ type: 'add_hotel', hotelName, select })
      continue
    }

    if (type === 'remove_hotel') {
      const hotelName = String(row.hotelName || row.name || row.placeName || '').trim()
      if (hotelName) out.push({ type: 'remove_hotel', hotelName })
      continue
    }

    if (type === 'refresh_hotels') {
      const keepCustom =
        row.keepCustom === false || row.keepCustom === 'false' || row.keepCustom === 0
          ? false
          : true
      out.push({
        type: 'refresh_hotels',
        preferences: String(row.preferences || row.preference || row.query || '').trim() || undefined,
        keepCustom,
      })
      continue
    }

    if (type === 'replace_hotel') {
      const fromHotelName = String(
        row.fromHotelName || row.oldHotelName || row.hotelName || row.from || '',
      ).trim()
      if (!fromHotelName) continue
      const toHotelName = String(row.toHotelName || row.newHotelName || row.to || '').trim() || undefined
      const select =
        row.select === true || row.select === 'true' || row.select === 1 ? true : undefined
      out.push({
        type: 'replace_hotel',
        fromHotelName,
        toHotelName,
        preferences: String(row.preferences || row.preference || '').trim() || undefined,
        select,
      })
      continue
    }

    if (type === 'replace_hotels') {
      const namesRaw = row.fromHotelNames || row.hotelNames || row.names
      const fromHotelNames = Array.isArray(namesRaw)
        ? namesRaw.map((n) => String(n || '').trim()).filter(Boolean)
        : String(namesRaw || '')
            .split(/[,，、]/)
            .map((n) => n.trim())
            .filter(Boolean)
      if (!fromHotelNames.length) continue
      out.push({
        type: 'replace_hotels',
        fromHotelNames,
        preferences: String(row.preferences || row.preference || '').trim() || undefined,
      })
    }
  }

  return out
}

function pickChatReplyText(parsed: Record<string, unknown>): string {
  const keys = ['reply', 'message', 'content', 'answer', 'text', '回复', '介绍']
  for (const key of keys) {
    const value = parsed[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  let longest = ''
  for (const [key, value] of Object.entries(parsed)) {
    if (key === 'actions' || key === 'action' || key === 'ops') continue
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (trimmed.length > longest.length) longest = trimmed
  }
  return longest.length >= 12 ? longest : ''
}

function parseTripChatResult(
  text: string,
  userMessage: string,
  currentDay: number,
  maxDay = 30,
  history: TripChatTurn[] = [],
): TripChatResult {
  const parsed = extractLlmJsonObject(text)
  const activeLocale = getLocale()

  if (!parsed) {
    // Last-ditch: if the model emitted a JSON-looking blob we couldn't parse
    // (truncated stream, extra wrapper, etc.), try to salvage the reply field
    // directly. Without this, a partial JSON string leaks into the UI bubble.
    const salvaged = extractReplyFromLooseJson(text)
    if (salvaged) {
      const trimmed = salvaged.trim()
      if (trimmed) return { reply: trimmed, actions: [] }
    }
    const cleanText = text.trim()
    if (cleanText && !cleanText.startsWith('{') && !cleanText.endsWith('}')) {
      return { reply: cleanText, actions: [] }
    }
    throw new LlmRequestError(
      activeLocale === 'en'
        ? localizedCopy('m9c0fa2400c', undefined, 'en')
        : localizedCopy('m9c0fa2400c', undefined, 'zh-CN'),
      'invalid_json',
    )
  }

  const rawReply = pickChatReplyText(parsed)
  // Prefer top-level actions; fall back if the model nestled them oddly.
  const rawActions =
    parsed.actions ??
    parsed.action ??
    (Array.isArray(parsed.ops) ? parsed.ops : undefined)
  const parsedActions = parseActions(rawActions, maxDay)
  const rejectedActions = coerceActionsArray(rawActions).length - parsedActions.length
  const actions = pinActionsToCurrentDay(
    parsedActions,
    operationScopeMessage(userMessage, history),
    currentDay,
    maxDay,
  )

  if (!rawReply) {
    if (actions.length > 0) {
      const reply = activeLocale === 'en' ? localizedCopy('mc975e0c4bc', undefined, 'en') : localizedCopy('mc975e0c4bc', undefined, 'zh-CN')
      return { reply, actions }
    }
    const salvaged = extractReplyFromLooseJson(text)?.trim()
    if (salvaged) return { reply: salvaged, actions }
    throw new LlmRequestError(
      activeLocale === 'en'
        ? localizedCopy('mb308fc9ad1', undefined, 'en')
        : localizedCopy('mb308fc9ad1', undefined, 'zh-CN'),
      'empty_reply',
    )
  }

  const places = parseChatPlaceReferences(parsed.places, rawReply)
  return { reply: rawReply, actions, ...(places.length ? { places } : {}), ...(rejectedActions ? { rejectedActions } : {}) }
}

/**
 * Best-effort salvage when the streaming buffer can't be parsed as a full JSON
 * object (e.g. truncated stream, extra prefix/suffix, or unbalanced quotes in
 * the model's reply field). Greps the first `"reply":"..."` block out of the
 * raw text and decodes JSON escape sequences. Returns null if no plausible
 * reply field exists.
 *
 * Intentionally tolerant: stops at the next unescaped `"` after the opening
 * quote, accepts Chinese / multibyte / non-ASCII content, and never throws.
 */
function extractReplyFromLooseJson(text: string): string | null {
  if (!text) return null
  const keyIdx = text.indexOf('"reply"')
  if (keyIdx < 0) return null
  // Find the first " after the colon, allowing any whitespace.
  let i = keyIdx + '"reply"'.length
  while (i < text.length && /\s/.test(text[i]!)) i++
  if (text[i] !== ':') return null
  i++
  while (i < text.length && /\s/.test(text[i]!)) i++
  if (text[i] !== '"') return null
  i++
  let out = ''
  while (i < text.length) {
    const c = text[i]!
    if (c === '\\') {
      if (i + 1 >= text.length) return out || null
      const n = text[i + 1]!
      if (n === 'n') out += '\n'
      else if (n === 'r') out += '\r'
      else if (n === 't') out += '\t'
      else if (n === '"' || n === '\\' || n === '/') out += n
      else if (n === 'u') {
        const hex = text.slice(i + 2, i + 6)
        if (hex.length < 4) return out || null
        out += String.fromCharCode(parseInt(hex, 16))
        i += 4
      } else {
        out += n
      }
      i += 2
      continue
    }
    if (c === '"') return out || null
    out += c
    i++
  }
  // Stream cut off mid-field; still salvage what we have.
  return out || null
}

async function repairTripChatJson(
  text: string,
  signal?: AbortSignal,
): Promise<string> {
  text = stripLlmJsonWrapper(text)
  if (/^```(?:json)?(?:\s|$)/i.test(text)) {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  }
  if (!text) {
    throw new LlmRequestError(localizedCopy('mb308fc9ad1'), 'empty_reply')
  }
  if (extractLlmJsonObject(text)) return text
  // Plain prose is already supported by the result parser. Sending it to a
  // JSON fixer can replace the actual answer with a request for JSON input.
  const looksLikeJson = /^(?:```(?:json)?\s*)?[{[]/i.test(text) ||
    /"(?:reply|message|actions)"\s*:/.test(text)
  if (!looksLikeJson) return text
  try {
    const repaired = await openaiChat(
      [
        {
          role: 'system',
          content:
            chatInstruction('m7c85ee8129'),
        },
        { role: 'user', content: text.slice(0, 16000) },
      ],
      {
        task: 'tripChat',
        thinking: { enabled: false, effort: 'low' },
        preflight: false,
        webSearch: false,
        responseFormat: 'json_object',
        signal,
      },
    )
    // Repair output is internal: never display its plain-text explanation as
    // the assistant's answer. Fall back to salvaging the original reply.
    const parsed = extractLlmJsonObject(repaired)
    if (parsed && typeof parsed.reply === 'string' && (parsed.reply.trim() ||
      (Array.isArray(parsed.actions) && parsed.actions.length > 0))) return repaired
    return text
  } catch (error) {
    if (signal?.aborted) throw error
    return text
  }
}

export type TripChatWebSearchPhase = 'start' | 'done' | 'skip'
export interface TripChatWebSearchDetail {
  source: 'google_places' | 'web'
  query: string
  sourcesCount?: number
}

export type TripChatVisualAnalysisPhase = 'start' | 'done' | 'skip'
export interface TripChatVisualAnalysisDetail {
  imageCount: number
  isProxy: boolean
}

export type TripChatRequestPlanPhase = 'start' | 'done'

/** Preflight decision made before search, generation, or itinerary actions. */
export interface TripChatRequestPlan {
  intent: 'answer' | 'recommend' | 'mutate'
  needsWeb: boolean
  recommendedEffort: ResolvedThinkingEffort
  thinking: ResolvedThinking
  source: 'jev' | 'model' | 'fallback'
  reason?: string
}

function fallbackTripChatIntent(text: string): TripChatRequestPlan['intent'] {
  if (isLivePlaceRecommendationRequest(text) || /推荐|比较|哪家更好|住哪里/.test(text)) {
    return 'recommend'
  }
  if (/添加|加上|新增|删除|去掉|移除|清空|清理|执行|替换|换成|重排|调整|修改|选中|切换|移到|移动|挪到|\b(?:add|remove|delete|clear|replace|reorder|apply|execute)\b/i.test(text)) {
    return 'mutate'
  }
  return 'answer'
}

function parseThinkingEffort(value: unknown): ResolvedThinkingEffort | null {
  const effort = String(value || '').trim().toLowerCase()
  if (effort === 'off' || effort === 'low' || effort === 'medium' || effort === 'high') {
    return effort
  }
  return null
}

function planningContext(input: {
  ctx: TripChatContext
  history: TripChatTurn[]
  userMessage: string
  images?: string[]
}) {
  const destination = buildDestinationSnapshot(input.ctx)
  const dates = buildTripDatesSnapshot(input.ctx)
  const viewing = buildViewingSnapshot(input.ctx)
  const recentHistory = input.history
    .slice(-4)
    .map((turn) => ({
      role: turn.role,
      content: (turn.quote ? [turn.quote, turn.content].filter(Boolean).join('\n') : turn.content).slice(
        0,
        500,
      ),
    }))
  const attachedImagesCount = input.images ? input.images.length : 0
  return {
    request: input.userMessage,
    attachedImagesCount,
    destination,
    dates,
    currentDay: input.ctx.currentDay,
    selectedHotel: input.ctx.hotel.id !== 'hotel-pending'
      ? { name: input.ctx.hotel.name, address: input.ctx.hotel.address }
      : null,
    viewing,
    recentHistory,
  }
}

/**
 * Lightweight semantic router for a chat turn. It intentionally runs with
 * thinking disabled; its job is only to decide tools and final-answer effort.
 */
export async function planTripChatRequest(input: {
  ctx: TripChatContext
  history: TripChatTurn[]
  userMessage: string
  images?: string[]
  signal?: AbortSignal
  webSearch?: boolean | 'auto'
}): Promise<TripChatRequestPlan> {
  const hasImages = Boolean(input.images && input.images.length > 0)
  const fallbackNeedsWeb = tripChatNeedsWebResearch(input.userMessage, hasImages)
  const fallbackThinking = resolveThinkingForTask(
    getThinkingMode(),
    input.userMessage,
    'tripChat',
  )
  let modelNeedsWeb: boolean | null = null
  let modelEffort: ResolvedThinkingEffort | null = null
  let modelIntent: TripChatRequestPlan['intent'] | null = null
  let reason = ''
  let source: TripChatRequestPlan['source'] = 'fallback'

  const jev = await tryJevRoute('chat', planningContext(input), input.signal)
  if (jev) {
    modelIntent = jev.intent ?? null
    modelNeedsWeb = jev.needsWeb
    modelEffort = jev.reasoningEffort
    source = 'jev'
  }

  const routerLocale = getLocale()
  const routerIsEn = routerLocale === 'en'
  if (!jev) {
    try {
      const raw = await openaiChat(
        [
          {
            role: 'system',
            content: buildPrompt(
              routerIsEn
                ? localizedCopy('mf8fdda57a4', undefined, 'en')
                : localizedCopy('mf8fdda57a4', undefined, 'zh-CN'),
              null,
              routerIsEn
                ? localizedCopy('m6990f05acb', undefined, 'en')
                : localizedCopy('m6990f05acb', undefined, 'zh-CN'),
              routerIsEn
                ? chatInstruction('m93c7ba505f')
                : chatInstruction('m0926a7eb79'),
              routerIsEn
                ? localizedCopy('mbe3cf5d147', undefined, 'en')
                : localizedCopy('mbe3cf5d147', undefined, 'zh-CN'),
              getRouterExamples(routerLocale),
              jsonContract(
                routerIsEn
                  ? localizedCopy('m65f2917d5b', undefined, 'en')
                  : localizedCopy('m65f2917d5b', undefined, 'zh-CN'),
                routerIsEn
                  ? localizedCopy('m8cab2c5946', undefined, 'en')
                  : localizedCopy('m8cab2c5946', undefined, 'zh-CN'),
                routerLocale,
              ),
            ),
          },
          {
            role: 'user',
            content: JSON.stringify(planningContext(input)),
          },
        ],
        {
          task: 'tripChat',
          userText: input.userMessage,
          thinking: { enabled: false, effort: 'low' },
          preflight: false,
          webSearch: false,
          responseFormat: 'json_object',
          signal: input.signal,
        },
      )
      const parsed = extractLlmJsonObject(raw)
      if (parsed) {
        if (typeof parsed.needsWeb === 'boolean') modelNeedsWeb = parsed.needsWeb
        if (
          parsed.intent === 'answer' ||
          parsed.intent === 'recommend' ||
          parsed.intent === 'mutate'
        ) {
          modelIntent = parsed.intent
        }
        modelEffort = parseThinkingEffort(parsed.reasoningEffort ?? parsed.effort)
        reason = String(parsed.reason || '').trim().slice(0, 160)
        if (modelNeedsWeb != null || modelEffort != null) source = 'model'
      }
    } catch (error) {
      if (input.signal?.aborted) throw error
      // The deterministic fallback keeps chat available when planning fails.
    }
  }

  const mode = input.webSearch ?? 'auto'
  const needsWeb =
    mode === true
      ? true
      : mode === false
        ? false
        : Boolean(modelNeedsWeb || fallbackNeedsWeb)
  const recommendedEffort =
    modelEffort || (fallbackThinking.enabled ? fallbackThinking.effort : 'off')
  const thinkingMode = getThinkingMode()
  const thinking =
    thinkingMode === 'auto'
      ? recommendedEffort === 'off'
        ? { enabled: false, effort: 'low' as ThinkingEffortUi, source: 'auto' as const }
        : { enabled: true, effort: recommendedEffort, source: 'auto' as const }
      : resolveThinkingForTask(thinkingMode, input.userMessage, 'tripChat')

  return {
    intent: modelIntent || fallbackTripChatIntent(input.userMessage),
    needsWeb,
    recommendedEffort,
    thinking,
    source,
    ...(reason ? { reason } : {}),
  }
}

async function resolveTripChatWebResearch(input: {
  ctx: TripChatContext
  userMessage: string
  signal?: AbortSignal
  plan: TripChatRequestPlan
  onWebSearch?: (phase: TripChatWebSearchPhase, detail?: TripChatWebSearchDetail) => void
}): Promise<string | null> {
  if (!input.plan.needsWeb) {
    input.onWebSearch?.('skip')
    return null
  }
  input.onWebSearch?.('start')
  const research = await fetchTripChatWebResearch({
    ctx: input.ctx,
    userMessage: input.userMessage,
    signal: input.signal,
    onSearch: (detail) => input.onWebSearch?.('start', detail),
  })
  if (!research) {
    input.onWebSearch?.('skip')
  } else {
    input.onWebSearch?.('done')
  }
  return research
}

export async function sendTripChatMessage(input: {
  ctx: TripChatContext
  history: TripChatTurn[]
  userMessage: string
  images?: string[]
  signal?: AbortSignal
  /** auto (default) = heuristic; true/false force on/off. Uses OpenAI web_search. */
  webSearch?: boolean | 'auto'
  onRequestPlan?: (phase: TripChatRequestPlanPhase, plan?: TripChatRequestPlan) => void
  onVisualAnalysis?: (
    phase: TripChatVisualAnalysisPhase,
    detail?: TripChatVisualAnalysisDetail,
  ) => void
  onWebSearch?: (phase: TripChatWebSearchPhase, detail?: TripChatWebSearchDetail) => void
}): Promise<TripChatResult> {
  input.onRequestPlan?.('start')
  const plan = await planTripChatRequest({ ...input, images: input.images })
  input.onRequestPlan?.('done', plan)
  const webResearch = await resolveTripChatWebResearch({ ...input, plan })
  const imageCount = input.images?.length ?? 0
  if (imageCount) input.onVisualAnalysis?.('start', { imageCount, isProxy: false })
  else input.onVisualAnalysis?.('skip')
  const messages = buildTripChatMessages({ ...input, webResearch, plan })
  const rawText = await openaiChat(messages, {
    task: 'tripChat',
    userText: input.userMessage,
    thinking: plan.thinking,
    preflight: false,
    webSearch: false,
    responseFormat: 'json_object',
    signal: input.signal,
  })
  if (imageCount) input.onVisualAnalysis?.('done', { imageCount, isProxy: false })
  const text = await repairTripChatJson(rawText, input.signal)
  return parseTripChatResult(
    text,
    input.userMessage,
    input.ctx.currentDay,
    maxDayFromContext(input.ctx),
    input.history,
  )
}

/**
 * Receive trip-chat JSON over a stream, then parse it before surfacing a reply.
 * Mutation replies wait for the UI executor's verified receipts.
 * Optional `onReasoningDelta` surfaces model CoT when the API sends it
 * (thinking mode); never mixed into reply parsing.
 *
 * When the question needs live facts (prices/hours/weather/…), optionally runs
 * OpenAI Responses `web_search` first and injects a research summary into
 * context — streaming + action JSON parsing stay on the normal chat path.
 */
export async function sendTripChatMessageStream(input: {
  ctx: TripChatContext
  history: TripChatTurn[]
  userMessage: string
  images?: string[]
  signal?: AbortSignal
  /** auto (default) = heuristic; true/false force on/off. Uses OpenAI web_search. */
  webSearch?: boolean | 'auto'
  onRequestPlan?: (phase: TripChatRequestPlanPhase, plan?: TripChatRequestPlan) => void
  onVisualAnalysis?: (
    phase: TripChatVisualAnalysisPhase,
    detail?: TripChatVisualAnalysisDetail,
  ) => void
  onWebSearch?: (phase: TripChatWebSearchPhase, detail?: TripChatWebSearchDetail) => void
  /** Parsed, non-operational reply; mutation receipts are supplied by the UI. */
  onReplyDelta?: (reply: string) => void
  /** Model reasoning tokens when thinking is enabled and the API emits them. */
  onReasoningDelta?: (delta: string, fullReasoning: string) => void
}): Promise<TripChatResult> {
  input.onRequestPlan?.('start')
  const plan = await planTripChatRequest({ ...input, images: input.images })
  input.onRequestPlan?.('done', plan)
  const webResearch = await resolveTripChatWebResearch({ ...input, plan })
  const imageCount = input.images?.length ?? 0
  if (imageCount) input.onVisualAnalysis?.('start', { imageCount, isProxy: false })
  else input.onVisualAnalysis?.('skip')
  const messages = buildTripChatMessages({ ...input, webResearch, plan })
  const rawText = await openaiChatStream(messages, {
    task: 'tripChat',
    userText: input.userMessage,
    thinking: plan.thinking,
    preflight: false,
    webSearch: false,
    responseFormat: 'json_object',
    signal: input.signal,
    // The reply can predict successful edits before actions even arrive. Only
    // expose it after parsing; mutation replies are replaced by execution receipts.
    onReasoningDelta: (delta, fullReasoning) => {
      input.onReasoningDelta?.(delta, fullReasoning)
    },
  })
  if (imageCount) input.onVisualAnalysis?.('done', { imageCount, isProxy: false })
  const text = await repairTripChatJson(rawText, input.signal)

  let result = parseTripChatResult(
    text,
    input.userMessage,
    input.ctx.currentDay,
    maxDayFromContext(input.ctx),
    input.history,
  )
  const needsActions = plan.intent === 'mutate' && input.ctx.days.length > 0
  if (!result.actions.length && (needsActions || ((plan.intent === 'mutate' || fallbackTripChatIntent(input.userMessage) === 'mutate') && replyClaimsItineraryApplied(result.reply)))) {
    // One bounded retry using the original request, history and current state.
    // Never derive deletions by scraping the model's purported success summary.
    try {
      const recovery = await openaiChat([...messages, { role: 'assistant', content: JSON.stringify(result) }, {
        role: 'user', content: chatInstruction('missingActions'),
      }], { task: 'tripChat', userText: input.userMessage, thinking: plan.thinking, preflight: false, webSearch: false, responseFormat: 'json_object', signal: input.signal })
      result = parseTripChatResult(await repairTripChatJson(recovery, input.signal), input.userMessage, input.ctx.currentDay, maxDayFromContext(input.ctx), input.history)
    } catch (error) {
      if (input.signal?.aborted) throw error
      // Preserve the no-actions result so the UI reports no change honestly.
    }
  }
  if (!result.actions.length && !result.rejectedActions && !replyClaimsItineraryApplied(result.reply)) {
    input.onReplyDelta?.(result.reply)
  }
  return result
}

/** True when assistant copy claims the itinerary was already mutated. */
export function replyClaimsItineraryApplied(reply: string): boolean {
  const text = reply.trim()
  if (!text) return false
  return /已(经)?(正式)?加入|已经加[入进]|已加到|已添加到|已插入|已帮你加|已经帮你加|已写入行程|已更新行程|已放进行程|已(经)?替换|已经换[成好]|(?:已|都|全部|一并).{0,8}(?:删除|移除|清空|清理|清掉|删掉|移到|重排)|(?:删除|清空|清掉|删掉)了|清理后|已(?:经)?(?:切换|选中|设为)|已(?:经)?.{0,8}完成|(?:按|照)方案.{0,8}执行|\b(?:removed|deleted|cleared|added|replaced|reordered|updated|switched|selected)\b/i.test(
    text,
  )
}

/** True when assistant copy tells the user to confirm on the place detail page. */
export function replyClaimsDetailConfirm(reply: string): boolean {
  const text = reply.trim()
  if (!text) return false
  return /请在详情页确认|详情页确认是否|在详情页.*确认|尚未改动.*确认/.test(text)
}

/** Strip misleading “confirm on detail page” claims when no confirm UI will open. */
export function stripDetailConfirmClaim(reply: string): string {
  return reply
    .replace(/行程尚未改动[—–-]*请在详情页确认[^。！？\n]*[。！？]?/g, '')
    .replace(/请在详情页确认[^。！？\n]*[。！？]?/g, '')
    .replace(/详情页确认是否[^。！？\n]*[。！？]?/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Pull candidate place names from assistant reply (「店名」/ “Name”).
 * Skips generic labels like「餐厅」.
 */
export function extractQuotedPlaceNames(reply: string): string[] {
  const names: string[] = []
  const push = (raw: string) => {
    const name = raw.trim()
    if (!name || name.length < 2 || name.length > 80) return
    if (isGenericPlaceLabel(name)) return
    if (/详情|确认|行程|替换|加入/.test(name)) return
    if (!names.some((n) => n.toLowerCase() === name.toLowerCase())) names.push(name)
  }
  for (const m of reply.matchAll(/「([^」]{2,80})」/g)) push(m[1])
  for (const m of reply.matchAll(/“([^”]{2,80})”/g)) push(m[1])
  for (const m of reply.matchAll(/"([^"]{2,80})"/g)) push(m[1])
  return names
}

const CN_DAY: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
}

/** Detect an explicitly named trip day in the user message (第N天 / Day N). */
export function explicitDayFromMessage(message: string): number | null {
  const text = message.trim()
  if (!text) return null

  const digit = text.match(/(?:第\s*)(\d{1,2})\s*天|(?:day|Day)\s*(\d{1,2})/)
  if (digit) {
    const n = Number(digit[1] || digit[2])
    if (n >= 1 && n <= 30) return n
  }

  const cn = text.match(/第\s*([一二三四五六七八九十])\s*天/)
  if (cn && CN_DAY[cn[1]]) return CN_DAY[cn[1]]

  return null
}

/** A short acceptance inherits the most recent proposed operation's scope. */
function operationScopeMessage(message: string, history: TripChatTurn[]): string {
  if (!/^(?:好[的]?|可以|确认|按|就|执行|照|用|yes|ok|do it|go ahead|apply)/i.test(message.trim()) || explicitDaysFromMessage(message) != null) return message
  const proposal = [...history].reverse().find(turn => turn.role === 'assistant')
  if (!proposal) return message
  const choice = message.match(/(?:方案|option|plan)\s*([123一二三])/i)
  if (choice) {
    const n = CN_DAY[choice[1]] ?? Number(choice[1])
    const sections = proposal.content.split(/(?=(?:方案|option|plan)\s*[123一二三])/i)
    const selected = sections.find(section => new RegExp(`^(?:方案|option|plan)\\s*(?:${n}|${['', '一', '二', '三'][n]})`, 'i').test(section))
    if (selected) return `${message}\n${selected}`
  }
  return `${message}\n${proposal.content}`
}

/** Explicit ranges and lists are scopes, never a reason to collapse to today's day. */
export function explicitDaysFromMessage(message: string, maxDay = 30): number[] | null {
  if (/所有(?:日期|天|行程)|全部(?:日期|天|行程)|每一天|每天|全程|all\s+(?:days|itinerary)|entire\s+(?:trip|itinerary)/i.test(message)) return Array.from({ length: maxDay }, (_, i) => i + 1)
  const number = (s: string) => CN_DAY[s] ?? Number(s)
  const range = message.match(/(?:第|days?\s*)([一二三四五六七八九十\d]{1,2})\s*(?:天)?\s*[-–—~～至到]\s*(?:第|day\s*)?([一二三四五六七八九十\d]{1,2})\s*天?/i)
  if (range) {
    const from = number(range[1]), to = number(range[2])
    if (from >= 1 && to >= from && to <= maxDay) return Array.from({ length: to - from + 1 }, (_, i) => from + i)
    return []
  }
  const list = message.match(/(?:第|days?\s*)([\d一二三四五六七八九十、,，和及\s]+)天/i)
  if (list && /[、,，和及]/.test(list[1])) return [...new Set(list[1].split(/[、,，和及\s]+/).filter(Boolean).map(number))].filter(n => n >= 1 && n <= maxDay)
  const matches = [...message.matchAll(/第\s*([\d一二三四五六七八九十]{1,2})\s*天|day\s*(\d{1,2})/gi)]
  return matches.length ? [...new Set(matches.map(m => number(m[1] || m[2])))].filter(n => n >= 1 && n <= maxDay) : null
}

export function pinActionsToCurrentDay(
  actions: TripChatAction[],
  userMessage: string,
  currentDay: number,
  maxDay = 30,
): TripChatAction[] {
  const scope = explicitDaysFromMessage(userMessage, maxDay)
  // Dates are resolved against trip dates in the model's application context.
  const calendarScope = /\d{1,2}\s*(?:月|\/|-)\s*\d{1,2}/.test(userMessage)
  return actions.flatMap((action): TripChatAction[] => {
    if (action.type === 'clear_places') {
      const days = scope ? (action.days?.filter(day => scope.includes(day)) ?? scope) : (calendarScope ? action.days ?? [currentDay] : [currentDay])
      return days.length ? [{ ...action, days }] : []
    }
    if (action.type === 'switch_day') return scope || calendarScope ? [action] : []
    if (['remove_place', 'add_place', 'replace_place', 'reorder_place'].includes(action.type)) {
      const edit = action as Extract<TripChatAction, { day?: number }>
      const day = scope ? (scope.length === 1 ? scope[0] : edit.day ?? scope[0]) : calendarScope ? edit.day ?? currentDay : currentDay
      if (scope && !scope.includes(day)) return []
      return [{ ...edit, day }]
    }
    return [action]
  })
}

function normalizeHotelQuery(hotelName: string): string {
  return hotelName
    .toLowerCase()
    .trim()
    .replace(/那家|这家|那个|这个|酒店|hotel/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function areaAliases(area: string): string[] {
  const a = area.toLowerCase()
  const aliases = [a]
  if (/marais|玛黑/.test(a)) aliases.push('marais', '玛黑', englishPromptFragments('m326a59bf1f'))
  if (/opéra|opera|欧培拉|saint-lazare/.test(a)) aliases.push('opera', 'opéra', '欧培拉')
  // Digit-safe: 12e ≠ 2e, 16e ≠ 6e
  if (/boulevard|(?:^|[^\d])2\s*(?:e|ème|eme)|泊松/.test(a)) aliases.push('boulevards', '大道')
  if (/saint-germain|saint germain|圣日耳曼|(?:^|[^\d])6\s*(?:e|ème|eme)|(?:^|[^\d])6\s*区/.test(a))
    aliases.push('saint-germain', '圣日耳曼', '左岸')
  if (/latin|拉丁|odeon|odéon|(?:^|[^\d])5\s*(?:e|ème|eme)|(?:^|[^\d])5\s*区/.test(a))
    aliases.push('latin', '拉丁')
  if (/trocad|特罗卡德罗|passy|(?:^|[^\d])16\s*(?:e|ème|eme)|(?:^|[^\d])16\s*区|75116|75016/.test(a))
    aliases.push('trocadero', chinesePromptFragments('m27e98cf065'), '16区', 'passy')
  return aliases
}

/** Match a hotel name against candidate cards. */
export function matchHotelCandidate(
  candidates: HotelCandidate[],
  hotelName: string,
): HotelCandidate | null {
  const raw = hotelName.toLowerCase().trim()
  const q = normalizeHotelQuery(hotelName)
  if (!raw) return null

  let best: { hotel: HotelCandidate; score: number } | null = null
  for (const hotel of candidates) {
    const name = hotel.name.toLowerCase()
    const area = hotel.area.toLowerCase()
    const aliases = areaAliases(hotel.area)
    let score = 0
    if (name === raw || name === q) score = 100
    else if (name.includes(q) || (q && q.includes(name))) score = 80
    else if (aliases.some((a) => a.includes(q) || q.includes(a))) score = 55
    else if (area.includes(q) || raw.includes(area)) score = 40
    else if (name.split(/\s+/).some((w) => w.length > 2 && (q.includes(w) || raw.includes(w))))
      score = 35
    if (!score) continue
    if (!best || score > best.score) best = { hotel, score }
  }
  return best?.hotel || null
}

export type TripChatPlaceMatch = {
  stopIndex: number
  placeId: string
  stopId: string
  place: Place
}

/** Match a place name against itinerary stops (name / local name / substring). */
export function matchPlaceInDay(
  day: DayPlan,
  customPlaces: Record<string, Place>,
  placeName: string,
): TripChatPlaceMatch | null {
  const q = placeName.toLowerCase().trim()
  if (!q) return null

  let bestScore = 0
  let bestStopIndex = -1
  let bestPlaceId = ''
  let bestStopId = ''
  let bestPlace: Place | null = null

  for (let i = 0; i < day.stops.length; i++) {
    const s = day.stops[i]
    let place: Place
    try {
      place = getPlace(s.placeId, customPlaces)
    } catch {
      continue
    }
    const name = place.name.toLowerCase()
    const local = (place.nameLocal || '').toLowerCase()
    let score = 0
    if (name === q || local === q) score = 100
    else if (name.includes(q) || local.includes(q) || q.includes(name)) score = 80
    else if (name.split(/\s+/).some((w) => w && q.includes(w))) score = 40
    if (!score || score <= bestScore) continue
    bestScore = score
    bestStopIndex = i
    bestPlaceId = s.placeId
    bestStopId = s.id || `d${day.day}-${s.placeId}-${i}`
    bestPlace = place
  }

  if (!bestPlace || bestStopIndex < 0) return null
  return {
    stopIndex: bestStopIndex,
    placeId: bestPlaceId,
    stopId: bestStopId,
    place: bestPlace,
  }
}

/**
 * True when the user is asking to swap an existing stop (换一家/换个/替换…),
 * not merely add a new one. Hotel-only swaps are excluded.
 */
export function isReplacePlaceIntent(message: string): boolean {
  const t = message.trim()
  if (!t) return false
  const hotelOnly =
    /换.*(?:一批)?(?:酒店|住宿|宾馆|hotel)/i.test(t) &&
    !/(餐厅|饭店|餐馆|美食|晚餐|午餐|早饭|早餐|咖啡|景点|地方|店)/.test(t)
  if (hotelOnly) return false
  return /换\s*(一|另)?\s*(家|个)|换掉|换成|替换|换一家|换个|换间|不要这家|换成别/.test(t)
}

/** Infer place type from loose user / model wording (中餐厅、咖啡馆…). */
export function inferPlaceTypeFromText(text: string): PlaceType | undefined {
  const t = text.toLowerCase()
  if (!t.trim()) return undefined
  if (/咖啡|cafe|coffee|brunch|早午餐/.test(t)) return 'cafe'
  if (/餐|饭|菜|美食|dinner|lunch|restaurant|用餐|晚饭|午饭|早饭|早餐|晚餐|午餐/.test(t))
    return 'restaurant'
  if (/景点|博物|museum|塔|宫|公园|park|attraction|打卡/.test(t)) return 'attraction'
  return undefined
}

function isGenericPlaceLabel(name: string): boolean {
  const t = name.trim().toLowerCase()
  if (!t) return true
  return /^(中餐(厅)?|中国菜|餐厅|餐馆|饭店|晚餐|午餐|早饭|早餐|咖啡馆?|咖啡店|景点|地方|店)$/i.test(
    t,
  )
}

function dayStopMatches(
  day: DayPlan,
  customPlaces: Record<string, Place>,
  index: number,
): TripChatPlaceMatch | null {
  const s = day.stops[index]
  if (!s) return null
  try {
    const place = getPlace(s.placeId, customPlaces)
    if (place.type === 'hotel' || place.type === 'transport') return null
    return {
      stopIndex: index,
      placeId: s.placeId,
      stopId: s.id || `d${day.day}-${s.placeId}-${index}`,
      place,
    }
  } catch {
    return null
  }
}

/**
 * Resolve which stop to replace for「换一家X」when the model omits/misses a real
 * fromPlaceName. Prefers name match, then same type (last of that type), with a
 * light 中餐 cue when the user asked for Chinese food.
 */
export function findReplaceTargetInDay(
  day: DayPlan,
  customPlaces: Record<string, Place>,
  opts: {
    fromPlaceName?: string
    placeType?: PlaceType
    userMessage?: string
    /** Skip recommending the same place back onto itself. */
    excludePlaceName?: string
  } = {},
): TripChatPlaceMatch | null {
  const from = String(opts.fromPlaceName || '').trim()
  if (from && !isGenericPlaceLabel(from)) {
    const hit = matchPlaceInDay(day, customPlaces, from)
    if (hit) return hit
  }

  const hintText = [opts.userMessage, from, opts.placeType].filter(Boolean).join(' ')
  const type =
    opts.placeType ||
    inferPlaceTypeFromText(hintText) ||
    (from && isGenericPlaceLabel(from) ? inferPlaceTypeFromText(from) : undefined)

  const exclude = String(opts.excludePlaceName || '').trim().toLowerCase()
  const chineseCue = /中餐|中国|川菜|粤菜|湘菜|火锅|饺子|面条|chinese/i.test(hintText)

  const candidates: TripChatPlaceMatch[] = []
  for (let i = 0; i < day.stops.length; i++) {
    const hit = dayStopMatches(day, customPlaces, i)
    if (!hit) continue
    if (exclude && hit.place.name.toLowerCase() === exclude) continue
    if (type && hit.place.type !== type) continue
    candidates.push(hit)
  }

  if (!candidates.length) return null
  if (candidates.length === 1) return candidates[0]

  if (chineseCue) {
    const chinese = candidates.filter((c) =>
      /中|chinese|sichuan|cantonese|shanghai|beijing|dim\s*sum|noodle|dumpling|hot\s*pot|川|粤|湘|京|沪|火锅|饺子|面/i.test(
        `${c.place.name} ${c.place.nameLocal || ''} ${c.place.description || ''}`,
      ),
    )
    if (chinese.length) return chinese[chinese.length - 1]
  }

  // Prefer the last matching stop (dinner / later meal slots often sit at the end).
  return candidates[candidates.length - 1]
}
