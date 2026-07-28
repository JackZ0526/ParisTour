import type { DayPlan, HotelCandidate, Place, PlaceType, SelectedHotel } from '../types'
import { getPlace } from '../data/places'
import {
  extractLlmJsonObject,
  openaiChat,
  type OpenAIChatMessage,
} from './llm'

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
      fromPlaceName: string
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

export interface TripChatTurn {
  role: 'user' | 'assistant'
  content: string
  /** When true, kept in API history but not shown as a chat bubble. */
  hidden?: boolean
}

export interface TripChatContext {
  hotel: SelectedHotel
  hotelCandidates: HotelCandidate[]
  days: DayPlan[]
  currentDay: number
  customPlaces: Record<string, Place>
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
  return ctx.days.map((d) => ({
    day: d.day,
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
  }))
}

function systemPrompt(ctx: TripChatContext): string {
  return [
    '你是 Paris Tour 行程助手，帮助用户了解与调整巴黎秋季行程与住宿。',
    '用简洁中文回复。可以介绍地点/酒店、解释节奏、建议改动，并在需要时输出可执行操作。',
    '不要推荐卢浮宫或凡尔赛。',
    '当用户要求添加/删除/替换/重排/切换日期/选中地点，或选择/增加/删除/换一批/替换酒店时，必须在 JSON 的 actions 里给出操作；纯问答时 actions 为空数组。',
    '介绍当前酒店或候选项时：直接根据「酒店快照」回答，不要编造不存在的酒店；无需 actions。',
    '添加地点时 placeName 用 Google Maps 可搜到的正式名称。',
    '类型区分：placeType=cafe 指咖啡馆（精品咖啡、面包/甜点、brunch/早午餐小店），不是法语里常当餐厅的 café / brasserie；正餐用 restaurant。',
    '日期默认（硬规则）：用户说「今天/本日/这天」或未指定日期时，一律针对「当前查看的日期」操作；actions 里不要填 day 字段（省略即可，系统会用当前日）。',
    '只有用户明确说「第N天 / Day N / 换成第N天」时，才设置 day=N，或使用 switch_day。不要因为行程快照里其它天有同名地点就擅自改其它天。',
    'select_place / 介绍地点：优先当前查看日；不要为了找到地点自动跳到其它天，除非用户点名了那一天。',
    '删除/重排/替换时地点名尽量匹配行程快照里的 name；酒店名尽量匹配酒店快照里的 name 或 area。',
    '酒店操作：',
    '- select_hotel：从候选项中选中当前住宿',
    '- add_hotel：按店名/地址新增候选项（select 默认 true）',
    '- remove_hotel：从候选项移除',
    '- refresh_hotels：按用户偏好重新推荐一整批酒店（「换一批」「重新推荐」「想住左岸/更便宜」等）。把关键偏好写入 preferences；默认保留自定义酒店 keepCustom=true',
    '- replace_hotel：只改列表里的某一家。用户指定新店名时用 toHotelName；否则用 preferences 让系统重推替换。fromHotelName 可写店名或区位（如「玛黑那家」）',
    '- replace_hotels：一次替换多家（fromHotelNames 数组 + preferences）',
    '若用户说行程地点「不喜欢A换成B」：必须使用 replace_place（不要拆成 remove+add）。酒店替换用 replace_hotel / replace_hotels，不要用 replace_place。',
    '若是「新增/加上」某地点（不是替换）：使用 add_place，且 mode 必须为 "best"（系统会按当日路线算最顺路：第1天 机场→酒店入住→其他地点，其余天从酒店出发）。不要传 insertAt。仅当用户明确说「加到最后/末尾」时 mode 才用 "end"。第1天酒店入住点不可删除。',
    'add_place / replace_place 必须带 source 字段（硬规则）：',
    '- source="explicit"：用户话里已经点名了目标地点（店名/景点名），系统会立刻改行程、不弹确认。例：「加上 Café Kitsuné」「把 Les Ombres 换成 Jules Verne」「加入某某咖啡馆」。',
    '- source="recommend"：用户只说了类型/槽位、没点名新地点，需要你挑一家推荐，系统会先出详情页让用户确认。例：「换一家」「换个晚餐」「推荐另一家餐厅替换今天的晚餐」「帮我加附近一家咖啡馆」。',
    '- replace_place：toPlaceName 由用户点名 → explicit；toPlaceName 由你推荐 → recommend（fromPlaceName 可以是用户点的旧点）。',
    '- remove_place 始终立刻生效，不需要 source。',
    '只输出一个 JSON 对象，不要输出其它说明文字。',
    '格式：{"reply":"给用户看的中文回复","actions":[...]}',
    'actions 可选：',
    '{"type":"switch_day","day":1-7}',
    '{"type":"select_place","placeName":"..."}',
    '{"type":"remove_place","day":1-7?,"placeName":"..."}',
    '{"type":"add_place","day":1-7?,"placeName":"...","placeType":"attraction|cafe|restaurant","mode":"best|end","source":"explicit|recommend","note":"..."}',
    '{"type":"replace_place","day":1-7?,"fromPlaceName":"旧地点","toPlaceName":"新地点","placeType":"attraction|cafe|restaurant","source":"explicit|recommend","note":"..."}',
    '{"type":"reorder_place","day":1-7?,"placeName":"...","toIndex":0}',
    '{"type":"select_hotel","hotelName":"..."}',
    '{"type":"add_hotel","hotelName":"...","select":true}',
    '{"type":"remove_hotel","hotelName":"..."}',
    '{"type":"refresh_hotels","preferences":"左岸、地铁方便、中档","keepCustom":true}',
    '{"type":"replace_hotel","fromHotelName":"旧酒店或区位","toHotelName":"新店名?","preferences":"更安静/更便宜?"} ',
    '{"type":"replace_hotels","fromHotelNames":["酒店A","酒店B"],"preferences":"..."}',
    `当前查看第 ${ctx.currentDay} 天（默认操作日；未点名其它天时所有行程改动都作用于此日）`,
    `酒店快照：${JSON.stringify(buildHotelSnapshot(ctx))}`,
    `行程快照：${JSON.stringify(buildItinerarySnapshot(ctx))}`,
  ].join('\n')
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

function parseActions(raw: unknown): TripChatAction[] {
  if (!Array.isArray(raw)) return []
  const out: TripChatAction[] = []

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const type = String(row.type || '').trim()

    if (type === 'switch_day') {
      const day = Number(row.day)
      if (day >= 1 && day <= 7) out.push({ type: 'switch_day', day })
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
        day: day >= 1 && day <= 7 ? day : undefined,
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
        day: day >= 1 && day <= 7 ? day : undefined,
      })
      continue
    }

    if (type === 'replace_place') {
      const fromPlaceName = String(row.fromPlaceName || row.oldPlaceName || row.placeName || '').trim()
      const toPlaceName = String(row.toPlaceName || row.newPlaceName || row.replaceWith || '').trim()
      if (!fromPlaceName || !toPlaceName) continue
      const day = Number(row.day)
      out.push({
        type: 'replace_place',
        fromPlaceName,
        toPlaceName,
        placeType: normalizePlaceType(row.placeType || row.typeHint),
        source: parsePlaceActionSource(row),
        note: String(row.note || '').trim() || undefined,
        day: day >= 1 && day <= 7 ? day : undefined,
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
        day: day >= 1 && day <= 7 ? day : undefined,
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

export async function sendTripChatMessage(input: {
  ctx: TripChatContext
  history: TripChatTurn[]
  userMessage: string
}): Promise<TripChatResult> {
  const messages: OpenAIChatMessage[] = [
    { role: 'system', content: systemPrompt(input.ctx) },
    ...input.history.map((t) => ({ role: t.role, content: t.content })),
    { role: 'user', content: input.userMessage },
  ]

  const text = await openaiChat(messages)
  const parsed = extractLlmJsonObject(text)

  if (!parsed) {
    return { reply: text.trim() || '我暂时没法解析回复，请再说一次。', actions: [] }
  }

  const reply = String(parsed.reply || parsed.message || '').trim() || '好的。'
  const actions = pinActionsToCurrentDay(
    parseActions(parsed.actions),
    input.userMessage,
    input.ctx.currentDay,
  )
  return { reply, actions }
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

/** Match a place name against itinerary stops (name / local name / substring). */
export function matchPlaceInDay(
  day: DayPlan,
  customPlaces: Record<string, Place>,
  placeName: string,
): { stopIndex: number; placeId: string; stopId: string; place: Place } | null {
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
