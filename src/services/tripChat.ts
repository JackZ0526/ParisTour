import type {
  DayPlan,
  FlightInfo,
  HotelCandidate,
  Place,
  PlaceType,
  SelectedHotel,
} from '../types'
import { getPlace } from '../data/places'
import {
  extractLlmJsonObject,
  extractPartialJsonStringField,
  openaiChat,
  openaiChatStream,
  type OpenAIChatMessage,
} from './llm'
import { dateForTripDay, formatTripDayLabel } from './tripDates'
export type TripChatAction =
  | { type: 'switch_day'; day: number }
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
}

export interface TripChatWorkStep {
  id: string
  label: string
  status: 'pending' | 'active' | 'done' | 'skipped'
}

export interface TripChatTurn {
  role: 'user' | 'assistant'
  content: string
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
      country: dest.country || '法国',
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
  if (month >= 3 && month <= 5) return '春季'
  if (month >= 6 && month <= 8) return '夏季'
  if (month >= 9 && month <= 11) return '秋季'
  return '冬季'
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

function systemPrompt(ctx: TripChatContext): string {
  const dates = buildTripDatesSnapshot(ctx)
  const destination = buildDestinationSnapshot(ctx)
  const destName = destination.name || '目的地'
  const hasTripDates = Boolean(dates.tripStartDate && dates.tripEndDate)
  const dayCount = dates.dayCount
  const dayRange = `1-${dayCount}`
  const currentDayLabel = dates.labels.currentDay
    ? `（日历日 ${dates.labels.currentDay} / ${dates.currentDayDate}）`
    : ''
  const prefs = String(ctx.preferences || '').trim()
  const seasonLine = dates.season
    ? `由行程日期推导的季节参考（仅作穿着/天气语境，禁止当成唯一出行窗口）：${dates.season}。`
    : '日期未定时不要编造季节窗口（例如「只有秋季约9–11月」）。'

  const lines: string[] = [
    `你是行程助手，帮助用户了解与调整「${destName}」行程与住宿。`,
    '用简洁中文回复。可以介绍地点/酒店、解释节奏、建议改动，并在需要时输出可执行操作。',
    '只依据下方快照中的事实回答（目的地、日期、航班、酒店、行程）。缺少的信息就如实说尚未选定或快照里没有，禁止编造具体日期、模糊季节窗口、或不存在的酒店/地点。',
    seasonLine,
  ]

  if (destination.isParis) {
    lines.push('目的地规则（仅巴黎）：不要推荐卢浮宫或凡尔赛。')
    lines.push(
      '类型区分：placeType=cafe 指咖啡馆（精品咖啡、面包/甜点、brunch/早午餐小店），不是法语里常当餐厅的 café / brasserie；正餐用 restaurant。',
    )
  } else {
    lines.push(
      '类型区分：placeType=cafe 指咖啡馆（咖啡/轻食/brunch 类小店）；正餐用 restaurant；attraction 为景点。',
    )
  }

  if (hasTripDates) {
    lines.push(
      `旅行日期已确定（硬规则）：出发/去程日 ${dates.tripStartDate}（${dates.labels.tripStart}），返程日 ${dates.tripEndDate}（${dates.labels.tripEnd}）；行程第1天日历日起算 ${dates.itineraryStartDate}（${dates.labels.itineraryStart}）；共 ${dayCount} 个行程日。回答天气、穿着、季节、是否适合某活动时必须用这些具体日期，禁止改口说模糊季节窗口，也禁止声称不知道出发/返程日。`,
    )
  } else {
    lines.push(
      '旅行日期尚未在应用中选定：若用户问具体出发/返程日，如实说明尚未选定；不要编造具体日期或笼统季节窗口。',
    )
  }

  if (!destination.name) {
    lines.push('目的地尚未在应用中选定：讨论具体城市景点前先说明快照里没有目的地；不要默认巴黎或其他城市。')
  }

  if (prefs) {
    lines.push(`用户行程偏好（来自应用状态）：${prefs}`)
  }

  lines.push(
    '当用户要求添加/删除/替换/重排/切换日期/选中地点，或选择/增加/删除/换一批/替换酒店时，必须在 JSON 的 actions 里给出操作；纯问答时 actions 为空数组。',
    '介绍当前酒店或候选项时：直接根据「酒店快照」回答，不要编造不存在的酒店；无需 actions。',
    '添加地点时 placeName 用 Google Maps 可搜到的正式名称。',
    '日期默认（硬规则）：用户说「今天/本日/这天」或未指定日期时，一律针对「当前查看的日期」操作；actions 里不要填 day 字段（省略即可，系统会用当前日）。',
    `只有用户明确说「第N天 / Day N / 换成第N天」时，才设置 day=N（N 须在 ${dayRange}），或使用 switch_day。不要因为行程快照里其它天有同名地点就擅自改其它天。`,
    'select_place / 介绍地点：优先当前查看日；不要为了找到地点自动跳到其它天，除非用户点名了那一天。',
    '删除/重排/替换时地点名尽量匹配行程快照里的 name；酒店名尽量匹配酒店快照里的 name 或 area。',
    '酒店操作：',
    '- select_hotel：从候选项中选中当前住宿',
    '- add_hotel：按店名/地址新增候选项（select 默认 true）',
    '- remove_hotel：从候选项移除',
    '- refresh_hotels：按用户偏好重新推荐一整批酒店（「换一批」「重新推荐」「想住更方便/更便宜」等）。把关键偏好写入 preferences；默认保留自定义酒店 keepCustom=true',
    '- replace_hotel：只改列表里的某一家。用户指定新店名时用 toHotelName；否则用 preferences 让系统重推替换。fromHotelName 可写店名或区位',
    '- replace_hotels：一次替换多家（fromHotelNames 数组 + preferences）',
    '若用户说行程地点「不喜欢A换成B」：必须使用 replace_place（不要拆成 remove+add）。酒店替换用 replace_hotel / replace_hotels，不要用 replace_place。',
    '「换一家 / 换个 / 换成别的 / 替换」类意图（硬规则）：必须用 replace_place，禁止用 add_place。',
    '- fromPlaceName 必须是行程快照里当天已有地点的真实 name（例如当天的中餐厅店名），不要写「中餐厅」「餐厅」「咖啡馆」这类类型词。',
    '- 用户说「换一家中餐厅 / 换个晚餐 / 换一家咖啡馆」且没点名旧店：从快照里选当天对应类型的那一家（同类型多间时优先最后一家），把它的 name 填进 fromPlaceName；toPlaceName 填你推荐的新店；source="recommend"。',
    '- 绝不能把「换」做成新增/顺路插入；替换后当天不应多出一个同类型停点。',
    '若是「新增/加上」某地点（不是替换）：使用 add_place，且 mode 必须为 "best"（系统会按当日路线算最顺路：第1天 机场→酒店入住→其他地点，其余天从酒店出发）。不要传 insertAt。仅当用户明确说「加到最后/末尾」时 mode 才用 "end"。第1天酒店入住点不可删除。',
    'add_place / replace_place 的 note（可选）：写面向旅客的地点简介或用餐/游玩提示（1–2 句，讲这家店本身），不要写插入操作说明（禁止「顺路插入」「加到末尾」「作为第N天晚餐按路线安排」这类句子）。',
    'add_place / replace_place 必须带 source 字段（硬规则）：',
    '- source="explicit"：用户话里已经点名了目标地点（店名/景点名），系统会立刻改行程、不弹确认。例：「加上某某咖啡馆」「把 A 换成 B」。',
    '- source="recommend"：用户只说了类型/槽位、没点名新地点，需要你挑一家推荐，系统会先出详情页让用户确认。例：「加一个中餐厅」「换一家中餐厅」「换个晚餐」「帮我加附近一家咖啡馆」。',
    '- 「加一个…」→ add_place；「换一家/换个…」→ replace_place（不要用 add_place）。',
    '- replace_place：toPlaceName 由用户点名 → explicit；toPlaceName 由你推荐 → recommend（fromPlaceName 必须是快照里的旧点 name）。',
    '- remove_place 始终立刻生效，不需要 source。',
    'reply 与 actions 一致性（硬规则，禁止幻觉成功）：',
    '- 只要要改行程/酒店，actions 绝不能为空；口头答应「好的/这就加」却不给 action = 严重错误。',
    '- source="recommend" 时：行程尚未写入。reply 禁止说「已加入 / 正式加入 / 已经加进行程 / 已帮你加上 / 已替换」。add 候选写「请在详情页确认是否加入」；replace 候选写「请在详情页确认是否替换」。',
    '- source="explicit" 且你输出了对应 action 时，才可以说「已加入/已替换」等完成语。',
    '- 若用户抱怨「没加上 / 行程里没有」：必须再次输出正确的 add_place/replace_place（不要只道歉或空口承诺）。',
    '只输出一个 JSON 对象，不要输出其它说明文字。',
    '为便于流式展示：先写 reply 字段（用户可见的中文），再写 actions；不要先输出一大段 actions。',
    '格式：{"reply":"给用户看的中文回复","actions":[...]}',
    'actions 可选：',
    `{"type":"switch_day","day":${dayRange}}`,
    '{"type":"select_place","placeName":"..."}',
    `{"type":"remove_place","day":${dayRange}?,"placeName":"..."}`,
    `{"type":"add_place","day":${dayRange}?,"placeName":"...","placeType":"attraction|cafe|restaurant","mode":"best|end","source":"explicit|recommend","note":"..."}`,
    `{"type":"replace_place","day":${dayRange}?,"fromPlaceName":"旧地点","toPlaceName":"新地点","placeType":"attraction|cafe|restaurant","source":"explicit|recommend","note":"..."}`,
    `{"type":"reorder_place","day":${dayRange}?,"placeName":"...","toIndex":0}`,
    '{"type":"select_hotel","hotelName":"..."}',
    '{"type":"add_hotel","hotelName":"...","select":true}',
    '{"type":"remove_hotel","hotelName":"..."}',
    '{"type":"refresh_hotels","preferences":"区位、交通、价位偏好","keepCustom":true}',
    '{"type":"replace_hotel","fromHotelName":"旧酒店或区位","toHotelName":"新店名?","preferences":"更安静/更便宜?"} ',
    '{"type":"replace_hotels","fromHotelNames":["酒店A","酒店B"],"preferences":"..."}',
    `当前查看第 ${ctx.currentDay} 天${currentDayLabel}（默认操作日；未点名其它天时所有行程改动都作用于此日）`,
    `目的地快照：${JSON.stringify(destination)}`,
    `旅行日期与航班快照：${JSON.stringify(dates)}`,
    `酒店快照：${JSON.stringify(buildHotelSnapshot(ctx))}`,
    `行程快照：${JSON.stringify(buildItinerarySnapshot(ctx))}`,
  )

  return lines.join('\n')
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
  const dayOk = (day: number) => day >= 1 && day <= maxDay

  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const type = normalizeActionType(row.type)

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

function parseTripChatResult(
  text: string,
  userMessage: string,
  currentDay: number,
  maxDay = 30,
): TripChatResult {
  const parsed = extractLlmJsonObject(text)

  if (!parsed) {
    return { reply: text.trim() || '我暂时没法解析回复，请再说一次。', actions: [] }
  }

  const reply = String(parsed.reply || parsed.message || '').trim() || '好的。'
  // Prefer top-level actions; fall back if the model nestled them oddly.
  const rawActions =
    parsed.actions ??
    parsed.action ??
    (Array.isArray(parsed.ops) ? parsed.ops : undefined)
  const actions = pinActionsToCurrentDay(
    parseActions(rawActions, maxDay),
    userMessage,
    currentDay,
  )
  return { reply, actions }
}

function buildTripChatMessages(input: {
  ctx: TripChatContext
  history: TripChatTurn[]
  userMessage: string
}): OpenAIChatMessage[] {
  return [
    { role: 'system', content: systemPrompt(input.ctx) },
    ...input.history.map((t) => ({ role: t.role, content: t.content })),
    { role: 'user', content: input.userMessage },
  ]
}

export async function sendTripChatMessage(input: {
  ctx: TripChatContext
  history: TripChatTurn[]
  userMessage: string
  signal?: AbortSignal
}): Promise<TripChatResult> {
  const messages = buildTripChatMessages(input)
  const text = await openaiChat(messages, {
    task: 'tripChat',
    userText: input.userMessage,
    signal: input.signal,
  })
  return parseTripChatResult(
    text,
    input.userMessage,
    input.ctx.currentDay,
    maxDayFromContext(input.ctx),
  )
}

/**
 * Stream trip-chat JSON: progressively surface the growing `reply` string,
 * then parse full JSON for actions when the stream completes.
 * Optional `onReasoningDelta` surfaces model CoT when the API sends it
 * (thinking mode); never mixed into reply parsing.
 */
export async function sendTripChatMessageStream(input: {
  ctx: TripChatContext
  history: TripChatTurn[]
  userMessage: string
  signal?: AbortSignal
  /** Progressive user-visible reply extracted from the streaming JSON buffer. */
  onReplyDelta?: (reply: string) => void
  /** Model reasoning tokens when thinking is enabled and the API emits them. */
  onReasoningDelta?: (delta: string, fullReasoning: string) => void
}): Promise<TripChatResult> {
  const messages = buildTripChatMessages(input)
  let lastEmitted = ''

  const text = await openaiChatStream(messages, {
    task: 'tripChat',
    userText: input.userMessage,
    signal: input.signal,
    onDelta: (_delta, fullText) => {
      const partial =
        extractPartialJsonStringField(fullText, 'reply') ??
        extractPartialJsonStringField(fullText, 'message')
      if (partial == null || partial === lastEmitted) return
      lastEmitted = partial
      input.onReplyDelta?.(partial)
    },
    onReasoningDelta: input.onReasoningDelta,
  })

  const result = parseTripChatResult(
    text,
    input.userMessage,
    input.ctx.currentDay,
    maxDayFromContext(input.ctx),
  )
  if (result.reply !== lastEmitted) {
    input.onReplyDelta?.(result.reply)
  }
  return result
}

/** True when assistant copy claims the itinerary was already mutated. */
export function replyClaimsItineraryApplied(reply: string): boolean {
  const text = reply.trim()
  if (!text) return false
  return /已(经)?(正式)?加入|已经加[入进]|已加到|已添加到|已插入|已帮你加|已经帮你加|已写入行程|已更新行程|已放进行程|已(经)?替换|已经换[成好]/.test(
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
    .replace(/行程尚未改动[—–\-]*请在详情页确认[^。！？\n]*[。！？]?/g, '')
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

/**
 * Unless the user named another day, strip action.day / drop switch_day so
 * apply logic falls back to the currently selected day.
 */
export function pinActionsToCurrentDay(
  actions: TripChatAction[],
  userMessage: string,
  currentDay: number,
): TripChatAction[] {
  const explicit = explicitDayFromMessage(userMessage)
  if (explicit != null) {
    return actions.map((action) => {
      if (action.type === 'switch_day') return action
      if (
        action.type === 'remove_place' ||
        action.type === 'add_place' ||
        action.type === 'replace_place' ||
        action.type === 'reorder_place'
      ) {
        return { ...action, day: action.day ?? explicit }
      }
      return action
    })
  }

  const out: TripChatAction[] = []
  for (const action of actions) {
    if (action.type === 'switch_day') continue
    if (
      action.type === 'remove_place' ||
      action.type === 'add_place' ||
      action.type === 'replace_place' ||
      action.type === 'reorder_place'
    ) {
      out.push({ ...action, day: currentDay })
      continue
    }
    out.push(action)
  }
  return out
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
  if (/marais|玛黑/.test(a)) aliases.push('marais', '玛黑', 'le marais')
  if (/opéra|opera|欧培拉|saint-lazare/.test(a)) aliases.push('opera', 'opéra', '欧培拉')
  // Digit-safe: 12e ≠ 2e, 16e ≠ 6e
  if (/boulevard|(?:^|[^\d])2\s*(?:e|ème|eme)|泊松/.test(a)) aliases.push('boulevards', '大道')
  if (/saint-germain|saint germain|圣日耳曼|(?:^|[^\d])6\s*(?:e|ème|eme)|(?:^|[^\d])6\s*区/.test(a))
    aliases.push('saint-germain', '圣日耳曼', '左岸')
  if (/latin|拉丁|odeon|odéon|(?:^|[^\d])5\s*(?:e|ème|eme)|(?:^|[^\d])5\s*区/.test(a))
    aliases.push('latin', '拉丁')
  if (/trocad|特罗卡德罗|passy|(?:^|[^\d])16\s*(?:e|ème|eme)|(?:^|[^\d])16\s*区|75116|75016/.test(a))
    aliases.push('trocadero', '特罗卡德罗', '16区', 'passy')
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
