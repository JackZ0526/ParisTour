/**
 * LLM call sites for hotels (detail copy / recommendation).
 */
import {
  COMMON_RULES,
  PLACE_RESEARCH_DISCIPLINE,
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
      ? 'Travel accommodation advisor. Write a concise recommendation memo for the hotel detail page.'
      : '旅行住宿顾问。为酒店详情页写一段简洁的推荐理由。',
    null,
    `<hard_rules>
- ${langRule}
- 只输出 reason 一个字段，3–5 句连贯文案，不要分标题或小标题。
- 综合 hotel 资料与 featuredReviews：区位、评分细项、设施亮点、住客好评/差评要点。
- 可轻点与 trip / userPreferences 的匹配，但不要写成单独的段落。
- 不要编造房价；不要把卢浮宫/凡尔赛周边当唯一卖点。
- 若无精选评论，仅依据酒店资料写推荐理由。
</hard_rules>`,
    jsonContract(
      '{ reason: "string" }',
      activeLocale === 'en'
        ? '{ "reason": "Located in Le Marais within walking distance of Centre Pompidou and Place des Vosges, guests praise its central location and attentive staff. Convenient metro connections make exploring the city seamless." }'
        : '{ "reason": "玛黑区步行可达蓬皮杜与孚日广场，Booking 住客普遍称赞位置与员工服务；地铁 3、4 号线方便衔接本次右岸经典日与迪士尼安排，适合追求在地体验的旅客。" }',
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
      ? 'Travel accommodation advisor. Write a single concise English summary sentence for the hotel candidate card.'
      : '旅行住宿顾问。为酒店候选项卡片写一句中文简介。',
    null,
    isEn
      ? `<hard_rules>
- Output strictly in English.
- Output exactly one field "blurb": exactly 1 fluent English sentence, about 12–25 words, no bullet points.
- Highlight the 1–2 most recognizable features: district/neighborhood, star rating, or key facilities/metro proximity.
- Do not invent rates, ratings, or distances.
- Avoid meta descriptions like "custom hotel" or "recommendation reason".
</hard_rules>`
      : `<hard_rules>
- 只输出 blurb 一个字段：恰好 1 句中文，约 18–40 字，不要句号堆砌，不要分点。
- 抓住最有辨识度的 1–2 个点：区位/星级/一两个设施或交通，不要翻译或压缩 Booking 英文长简介。
- 不要编造房价、评分或距离；资料没有的信息不要写。
- 不要出现「自定义」「推荐理由」等元叙述。
</hard_rules>`,
    jsonContract(
      '{ blurb: "string" }',
      isEn
        ? '{ "blurb": "4-star boutique hotel in Trocadéro within walking distance of the Eiffel Tower." }'
        : '{ "blurb": "特罗卡德罗四星酒店，步行可到埃菲尔铁塔，住客评分很高。" }',
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
    throw new LlmRequestError('未配置 OpenAI API Key，无法推荐酒店。', 'missing_key')
  }

  const batch = Math.max(1, input?.batch || 1)
  const count = Math.max(1, Math.min(8, input?.count || 5))
  const preferences = input?.preferences?.trim() || ''
  const dayCount = input?.dayCount && input.dayCount > 0 ? input.dayCount : undefined
  const tripLabel = dayCount ? `${dayCount}日巴黎行程` : '巴黎行程'
  const system = buildPrompt(
    `巴黎旅行住宿顾问。为温哥华出发的${tripLabel}从已验证候选中挑选酒店。`,
    null,
    COMMON_RULES,
    PLACE_RESEARCH_DISCIPLINE,
    `<hard_rules>
- 恰好推荐 ${count} 家真实酒店（中档为主，可含 1 家稍高档）。
- area 统一写成「N区 (Français / 中文)」格式，例如「4区 (Marais / 玛黑)」「9区 (Opéra / 歌剧院)」「16区 (Trocadéro / 特罗卡德罗)」。
- 优先 3–4区玛黑 / 2区大林荫道 / 9区歌剧院 / 6区圣日耳曼 / 5区拉丁区 等地铁便利区。
- 若提供 userPreferences，必须优先满足（区位、预算、风格、安静/便利等）。
- name 使用 Booking 返回的正式店名；尽量附带含邮编的 address（如 75004 Paris）。
- 只能从 verifiedCandidates 中选择；name、bookingHotelId 与 address 必须原样复制，不得编造酒店或评分。
- ${
    count === 1
      ? '仅 1 家时 isBest 必须为 true。'
      : '恰好 1 家 isBest=true 作为最优推荐，其余 false。'
  }
- batch>1 时给出明显不同的新名单，避开 avoidAlso。
- description：2 句中文；reason：一句话为何适合本次行程/用户偏好。
</hard_rules>`,
    jsonContract(
      '{ hotels: [{ name, bookingHotelId?, area: "N区 (Français / 中文)", address?, description, nearestMetro?, priceHint?, reason, isBest: boolean }] }',
      '{ "hotels": [{ "name": "Hôtel du Petit Moulin", "bookingHotelId": "...", "area": "4区 (Marais / 玛黑)", "address": "29-31 rue de Poitou, 75003 Paris", "description": "玛黑心脏地带的精品酒店，由 Christian Lacroix 设计内饰。步行可达多家小馆与画廊。", "nearestMetro": "Saint-Sébastien – Froissart (8号线)", "priceHint": "€€€", "reason": "玛黑中心、地铁 8 号线，去右岸经典与迪士尼换乘都方便。", "isBest": true }] }',
    ),
  )
  const user = JSON.stringify({
    trip: dayCount
      ? `Paris ${dayCount}-day trip, metro-first`
      : 'Paris trip, metro-first',
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
    throw new LlmRequestError('大模型没有返回酒店推荐。')
  }

  const parsed = extractJsonObject(text)
  const list = (parsed?.hotels as unknown[]) || []
  if (!Array.isArray(list) || !list.length) {
    throw new LlmRequestError('无法解析酒店推荐列表，请再试一次。')
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
      area: String(row.area || '巴黎市区').trim() || '巴黎市区',
      address: verified.address || String(row.address || '').trim() || undefined,
      description:
        String(row.description || row.reason || '').trim() || `${name}，适合巴黎行程住宿。`,
      nearestMetro: String(row.nearestMetro || '').trim() || undefined,
      priceHint: String(row.priceHint || '').trim() || undefined,
      reason: String(row.reason || '地铁便利，适合本次行程').trim(),
      isBest: Boolean(row.isBest),
    })
    seen.add(key)
  }

  if (!out.length) {
    throw new LlmRequestError('酒店推荐为空，请再试一次。')
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
