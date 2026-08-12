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
  CAFE_VS_RESTAURANT_RULE,
  COMMON_RULES,
  PLACE_RESEARCH_DISCIPLINE,
  buildPrompt,
  jsonContract,
} from '../prompts'
import { LlmRequestError } from '../errors'
import { callOpenAIMessagesStream } from '../transport'
import { extractPartialJsonStringField } from '../stream'
import { extractJsonObject } from '../json'
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

export type {
  RecommendPlaceType,
  PlaceRecommendation,
  VerifiedPlaceCandidate,
}

function discoveredCandidateId(
  type: RecommendPlaceType,
  name: string,
  address?: string,
) {
  const source = `${type}|${name.trim().toLowerCase()}|${(address || '').trim().toLowerCase()}`
  let hash = 2166136261
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `llm:${type}:${(hash >>> 0).toString(36)}`
}

/**
 * Discover a durable trip-wide candidate pool with web-grounded LLM research.
 * Coordinates are intentionally omitted: only places selected by the itinerary
 * are geocoded later, which keeps the public place service out of the hot path.
 */
export async function discoverItineraryCandidates(input: {
  destination: string
  hotelName: string
  hotelAddress?: string
  hotelArea?: string
  recommendationPreferences: RecommendationPreferences
  countPerType?: number
  signal?: AbortSignal
}): Promise<VerifiedPlaceCandidate[]> {
  if (!isLlmConfigured()) return []
  const countPerType = Math.max(6, Math.min(14, input.countPerType || 10))
  const system = buildPrompt(
    '旅行地点研究员。联网查找真实存在、适合编排行程的地点候选；只做候选发现，不编排行程。',
    null,
    COMMON_RULES,
    PLACE_RESEARCH_DISCIPLINE,
    CAFE_VS_RESTAURANT_RULE,
    `<hard_rules>
- 分别提供 ${countPerType} 个 cafe、restaurant、attraction，共 ${countPerType * 3} 个候选。
- name 必须是商家或景点当前使用的正式原文名称；address 尽量给出完整地址或明确街区。
- 候选必须位于目的地城市内，并优先覆盖酒店周边及交通方便的主要游览片区。
- 不得虚构名称、分店、地址、评分、营业时间或坐标；无法核实的地点不要输出。
- cafe 是精品咖啡、烘焙或早午餐小店；restaurant 是正餐；attraction 是景点、博物馆、公园或街区。
- 不输出经纬度。坐标将在地点最终入选后由独立地点服务校验。
</hard_rules>`,
    jsonContract(
      '{ candidates: [{ name, type: "cafe|restaurant|attraction", address? }] }',
      '{ "candidates": [{ "name": "Musée Rodin", "type": "attraction", "address": "77 Rue de Varenne, 75007 Paris" }] }',
    ),
  )
  const user = JSON.stringify({
    destination: input.destination,
    hotel: {
      name: input.hotelName,
      address: input.hotelAddress || null,
      area: input.hotelArea || null,
    },
    countPerType,
    recommendationPreferences: recommendationPreferencesPrompt(
      input.recommendationPreferences,
    ),
  })
  const text = await generateText(system, user, {
    strict: true,
    task: 'placeRecommend',
    json: true,
    webSearch: true,
    signal: input.signal,
    userText: `${input.destination} 真实咖啡馆、餐厅和景点候选`,
    preflightContext: {
      destination: input.destination,
      hotel: input.hotelName,
      countPerType,
    },
  })
  const parsed = text ? extractJsonObject(text) : null
  const rows = Array.isArray(parsed?.candidates)
    ? (parsed.candidates as unknown[])
    : []
  const output: VerifiedPlaceCandidate[] = []
  const seen = new Set<string>()
  const counts: Record<RecommendPlaceType, number> = {
    cafe: 0,
    restaurant: 0,
    attraction: 0,
  }
  for (const item of rows) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const name = String(row.name || '').trim()
    const address = String(row.address || row.area || '').trim() || undefined
    const rawType = String(row.type || '').trim().toLowerCase()
    const type: RecommendPlaceType | null =
      rawType === 'cafe' || rawType === 'restaurant' || rawType === 'attraction'
        ? rawType
        : null
    if (!name || !type || counts[type] >= countPerType) continue
    const key = `${type}:${name.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    counts[type] += 1
    output.push({
      id: discoveredCandidateId(type, name, address),
      name,
      type,
      address,
    })
  }
  return output
}

/** Cheap, always-cached place blurb. */
export async function generatePlaceDescription(input: {
  name: string
  type: string
  address?: string
  googleSummary?: string
}): Promise<string | null> {
  const key = `place-desc:${input.name}|${input.type}|${input.address || ''}|${input.googleSummary || ''}`
  return memoizeLlmCall(
    key,
    async () => {
      const system = buildPrompt(
        '旅行文案助手。用简洁中文为地点写简介。',
        null,
        '<output_format>2–3 句正文，不要列表，不要夸张营销套话，不要标题。</output_format>',
        CAFE_VS_RESTAURANT_RULE,
      )
      const user = [
        `地点：${input.name}`,
        `类型：${input.type}`,
        input.address ? `地址：${input.address}` : '',
        input.googleSummary ? `参考信息：${input.googleSummary}` : '',
        '请直接输出简介正文，不要标题。',
      ]
        .filter(Boolean)
        .join('\n')

      return generateText(system, user, { task: 'placeDescription', userText: input.name })
    },
    { durable: true },
  )
}

/** Rich place narrative for the detail popup (same structure as hotel). */
export async function generatePlaceDetailCopy(input: {
  name: string
  nameLocal?: string
  type: string
  address?: string
  existingDescription?: string
  stopNote?: string
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

  const system = buildPrompt(
    '旅行顾问。为地点详情页写简洁中文点评。',
    null,
    `<hard_rules>
- intro：2–3 句地点简介（氛围、看点、适合谁），可吸收 existingDescription。
- reason：1–2 句说明为何值得放进行程 / 为何出现在当天；可参考 stopNote。
- tripFit：固定输出空字符串（地点详情页不展示此项）。
- 不要推荐卢浮宫或凡尔赛；不要编造营业时间与价格。
- 字段顺序：先写 intro（用户可见简介），再写 reason；不要先输出 reason。
</hard_rules>`,
    jsonContract(
      '{ intro: "string", reason: "string", tripFit: "" }',
      '{ "intro": "塞纳河畔的玻璃金字塔入口，馆藏横跨古典与近东。", "reason": "适合安排在右岸经典日的上午，避开下午人流高峰。", "tripFit": "" }',
    ),
  )
  const user = JSON.stringify({
    place: {
      name: input.name,
      nameLocal: input.nameLocal || '',
      type: input.type,
      address: input.address || '',
      existingDescription: input.existingDescription || '',
      stopNote: input.stopNote || '',
    },
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
    intro: intro || input.existingDescription || `${input.name}，适合安排进巴黎行程。`,
    reason: reason || input.stopNote || '适合补充进今天的行程节奏。',
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
}): { title: string; theme: string; summary: string } {
  const highlights = input.placeNames.slice(0, 3).join('、')
  const lastDay = input.totalDays && input.totalDays > 0 ? input.totalDays : undefined
  const title =
    input.pace === '乐园日'
      ? '迪士尼日'
      : input.pace === '自驾日'
        ? '近郊自驾'
        : input.day === 1
          ? '抵达巴黎'
          : lastDay != null && input.day === lastDay
            ? '返程日'
            : highlights.slice(0, 6) || `第 ${input.day} 天`

  return {
    title,
    theme: `${input.pace}节奏`,
    summary: highlights
      ? `今天主要安排：${highlights}${input.placeNames.length > 3 ? '等' : ''}。可根据体力微调顺序与停留时间。`
      : '今天还没有安排地点。',
  }
}

/** Day card headline + theme + summary, with a deterministic fallback. */
export async function generateDayCopy(input: {
  day: number
  pace: string
  placeNames: string[]
  hotelArea?: string
  /** Chinese label for hotel district (e.g. 16区特罗卡德罗) — use this in 落脚点 copy */
  hotelAreaLabel?: string
  /** Calendar date for this itinerary day (YYYY-MM-DD), after timezone-aware start */
  calendarDate?: string
  /** Total daytime days in this itinerary (not a fixed 7) */
  totalDays?: number
}): Promise<{ title: string; theme: string; summary: string } | null> {
  if (!input.placeNames.length) {
    return {
      title: `第 ${input.day} 天`,
      theme: '自由安排',
      summary: '今天还没有安排地点，添加景点后会自动生成标题与总结。',
    }
  }

  const totalDays = input.totalDays && input.totalDays > 0 ? input.totalDays : undefined
  const hotelLabel = (input.hotelAreaLabel || input.hotelArea || '').trim()
  const key = `day-copy:${input.day}|${totalDays || ''}|${input.calendarDate || ''}|${input.pace}|${hotelLabel}|${input.placeNames.join('>')}`
  return memoizeLlmCall(
    key,
    async () => {
      const lengthHint = totalDays ? `${totalDays} 日行程` : '本次行程'
      const baseRule = hotelLabel
        ? `<hard_rules>
- 若提到酒店落脚片区，必须写「${hotelLabel}」，不要写成其他区（如圣日耳曼、玛黑）。
</hard_rules>`
        : '<hard_rules>不要编造错误的酒店落脚片区。</hard_rules>'
      const system = buildPrompt(
        `巴黎${lengthHint}编辑。根据当天地点列表，用简体中文生成短标题、主题与总结。`,
        null,
        '<output_format>标题 2–6 字（如「西侧经典」「左岸轻松」），主题一句话，总结 2 句说明节奏与亮点。只输出 JSON。</output_format>',
        baseRule,
        jsonContract(
          '{ title: "string", theme: "string", summary: "string" }',
          '{ "title": "西侧经典", "theme": "埃菲尔铁塔与塞纳河", "summary": "上午登特罗卡德罗平台，下午沿塞纳河步道散步到特罗卡德罗。傍晚在附近小馆用餐，回 16区酒店。" }',
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

      const text = await generateText(system, user, {
        task: 'dayCopy',
        json: true,
        userText: input.placeNames.join('、'),
      })
      if (!text) return fallbackDayCopy(input)

      const parsed = extractJsonObject(text)
      if (!parsed) return fallbackDayCopy(input)

      const title = String(parsed.title || '').trim()
      const theme = String(parsed.theme || '').trim()
      const summary = String(parsed.summary || '').trim()
      if (!title || !summary) return fallbackDayCopy(input)

      return {
        title: title.slice(0, 12),
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

  const system = buildPrompt(
    '巴黎旅行顾问。根据游客当天已有行程和推荐偏好，从已验证候选中挑选互补、少重复的地点。',
    null,
    COMMON_RULES,
    PLACE_RESEARCH_DISCIPLINE,
    CAFE_VS_RESTAURANT_RULE,
    `<hard_rules>
- 只推荐 requestedTypes 中的类别；每个类别严格给出 ${countPerType} 个地点，共 ${
      requestedTypes.length * countPerType
    } 个。
- cafe 类：优先高分 specialty coffee、烘焙店可坐位、brunch/早午餐小店；不要推荐以正餐为主的 brasserie / café-restaurant。
- restaurant 类：正餐（午餐/晚餐），可含 bistro、brasserie、各国菜；不要用咖啡店/纯甜品店凑数。
- 严禁推荐 alreadyOnThisDay 与 alreadyOnTrip 中的地点。
- 尽量避开 avoidAlso（上一批推荐）；batch>1 时必须给出明显不同的新名单，不要复用上一批。
- name 使用 OpenStreetMap/Nominatim 可检索的正式原文名称，可附 nameLocal 中文名。
- 只能从 verifiedCandidates 选择地点；name 与 googlePlaceId 必须原样复制，禁止另造店名、地址、评分或距离。
- 比较候选时同时考虑距离、评分和评论量；没有评分不等于低质量，但不得自行补评分。
- ${
    input.recommendationPreferences.avoidLouvreAndVersailles
      ? '软偏好：默认避开卢浮宫和凡尔赛；用户明确要求时可以推荐。'
      : '卢浮宫和凡尔赛可正常参与候选比较。'
  }
- reason：一句话说明为何适合插入今天。
- intro：2–3 句中文介绍。
</hard_rules>`,
    jsonContract(
      '{ recommendations: [{ name, googlePlaceId?, nameLocal?, type: "cafe|attraction|restaurant", reason, intro, area? }] }',
      '{ "recommendations": [{ "name": "Du Pain et des Idées", "googlePlaceId": "...", "type": "cafe", "reason": "近 10区运河，brunch 评分 4.6，避开玛黑热门点。", "intro": "巴黎老牌手工面包与早午餐小店，店面小巧但出品稳定。", "area": "10区" }] }',
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

  // Non-stream chat: await full completion body before JSON parse (not SSE).
  const text = await generateText(system, user, {
    strict: true,
    task: 'placeRecommend',
    json: true,
    webSearch: false,
    preflightContext: {
      day: input.day,
      types: input.types,
      candidateCount: input.verifiedCandidates.length,
    },
    userText: [input.title, input.theme, input.pace].filter(Boolean).join(' '),
  })
  if (!text) {
    throw new LlmRequestError('大模型没有返回内容，请再试一次。')
  }

  const parsed = extractJsonObject(text)
  const list = (parsed?.recommendations as unknown[]) || []
  if (!Array.isArray(list) || !list.length) {
    const looksTruncated =
      !parsed && (text.includes('"recommendations"') || /```/.test(text) || text.includes('{'))
    throw new LlmRequestError(
      looksTruncated
        ? '推荐结果不完整（可能被截断），请再点「换一批」。'
        : '大模型返回了内容，但无法解析成地点列表，请再点「换一批」。',
    )
  }

  const out: PlaceRecommendation[] = []
  const seen = new Set<string>()
  const typeCounts: Record<RecommendPlaceType, number> = {
    attraction: 0,
    cafe: 0,
    restaurant: 0,
  }
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

  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const proposedName = String(row.name || '').trim()
    const proposedId = String(row.googlePlaceId || '').trim()
    const verified =
      (proposedId ? verifiedById.get(proposedId) : undefined) ||
      verifiedByName.get(proposedName.toLowerCase())
    if (!verified) continue
    const name = verified.name
    const key = name.toLowerCase()
    if (itineraryExclude.has(key) || seen.has(key)) continue
    const type = verified.type
    if (!requestedTypes.includes(type) || typeCounts[type] >= countPerType) continue
    const reason = String(row.reason || '适合补充进今天的行程').trim()
    const intro = String(row.intro || row.description || reason).trim()
    out.push({
      googlePlaceId: verified.id,
      name,
      nameLocal: String(row.nameLocal || '').trim() || undefined,
      type,
      reason,
      intro: intro || reason,
      area: String(row.area || '').trim() || undefined,
    })
    seen.add(key)
    typeCounts[type] += 1
  }

  return out
}
