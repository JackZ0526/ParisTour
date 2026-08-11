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

export type { HotelDetailCopy, HotelRecommendation }

function toExcludeSet(names: string[]): Set<string> {
  return new Set(names.map((n) => n.toLowerCase().trim()).filter(Boolean))
}

/** Rich hotel narrative for the detail popup: intro, why recommended, trip fit. */
export async function generateHotelDetailCopy(input: {
  name: string
  area: string
  address: string
  nearestMetro?: string
  ratingHint?: string
  existingDescription?: string
  existingReason?: string
  isBest?: boolean
  userPreferences?: string
  tripDays?: Array<{ day: number; title: string; pace: string; theme: string }>
}): Promise<HotelDetailCopy | null> {
  if (!isLlmConfigured()) return null

  const system = buildPrompt(
    '旅行住宿顾问。为酒店详情页写简洁中文点评。',
    null,
    `<hard_rules>
- intro：2–3 句酒店简介（氛围、区位、适合谁），可吸收 existingDescription 但要更完整。
- reason：1–2 句说明为何出现在推荐列表 / 为何值得考虑。
- tripFit：2–3 句说明它与本次行程（地铁出行、迪士尼日、自驾日、抵达日倒时差等）以及 userPreferences 的匹配关系；若无偏好则按行程常识写。
- 不要编造具体房价数字；不要把卢浮宫/凡尔赛周边当唯一卖点。
</hard_rules>`,
    jsonContract(
      '{ intro: "string", reason: "string", tripFit: "string" }',
      '{ "intro": "16区特罗卡德罗一带的现代精品酒店，紧邻地铁 9 号线。", "reason": "评分 4.6 且步行可上特罗卡德罗平台看铁塔。", "tripFit": "与本次行程的迪士尼日、自驾日衔接顺畅，地铁直达右岸经典。" }',
    ),
  )
  const user = JSON.stringify({
    hotel: {
      name: input.name,
      area: input.area,
      address: input.address,
      nearestMetro: input.nearestMetro || '',
      ratingHint: input.ratingHint || '',
      existingDescription: input.existingDescription || '',
      existingReason: input.existingReason || '',
      isBest: Boolean(input.isBest),
    },
    userPreferences: input.userPreferences || null,
    trip: input.tripDays || [],
  })

  const text = await generateText(system, user, {
    task: 'hotelDetail',
    json: true,
    userText: input.userPreferences || input.name,
  })
  if (!text) return null
  const parsed = extractJsonObject(text)
  if (!parsed) return null

  const intro = String(parsed.intro || parsed.description || '').trim()
  const reason = String(parsed.reason || '').trim()
  const tripFit = String(parsed.tripFit || parsed.fit || '').trim()
  if (!intro && !reason && !tripFit) return null

  return {
    intro: intro || input.existingDescription || `${input.name}，位于${input.area}。`,
    reason: reason || input.existingReason || '适合作为巴黎行程的住宿起点。',
    tripFit:
      tripFit ||
      '地铁便利，便于连接本行程中的右岸经典、左岸轻松日与迪士尼/自驾安排。',
  }
}

/**
 * Recommend Paris stay options via LLM (no local hotel catalog).
 * Caller should resolve names with Google Places afterwards.
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
- name 用 Google Maps 可搜到的正式店名；尽量附带含邮编的 address（如 75004 Paris）。
- 只能从 verifiedCandidates 中选择；name、googlePlaceId 与 address 必须原样复制，不得编造酒店或评分。
- ${
    count === 1
      ? '仅 1 家时 isBest 必须为 true。'
      : '恰好 1 家 isBest=true 作为最优推荐，其余 false。'
  }
- batch>1 时给出明显不同的新名单，避开 avoidAlso。
- description：2 句中文；reason：一句话为何适合本次行程/用户偏好。
</hard_rules>`,
    jsonContract(
      '{ hotels: [{ name, googlePlaceId?, area: "N区 (Français / 中文)", address?, description, nearestMetro?, priceHint?, reason, isBest: boolean }] }',
      '{ "hotels": [{ "name": "Hôtel du Petit Moulin", "googlePlaceId": "...", "area": "4区 (Marais / 玛黑)", "address": "29-31 rue de Poitou, 75003 Paris", "description": "玛黑心脏地带的精品酒店，由 Christian Lacroix 设计内饰。步行可达多家小馆与画廊。", "nearestMetro": "Saint-Sébastien – Froissart (8号线)", "priceHint": "€€€", "reason": "玛黑中心、地铁 8 号线，去右岸经典与迪士尼换乘都方便。", "isBest": true }] }',
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
    const proposedId = String(row.googlePlaceId || '').trim()
    const verified =
      (proposedId ? verifiedById.get(proposedId) : undefined) ||
      verifiedByName.get(proposedName.toLowerCase())
    if (!verified) continue
    const name = verified.name
    const key = name.toLowerCase()
    if (exclude.has(key) || seen.has(key)) continue
    out.push({
      googlePlaceId: verified.id,
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
