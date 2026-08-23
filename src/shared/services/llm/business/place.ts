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
import { extractPartialJsonStringField, openaiResponsesWithWebSearch } from '../stream'
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
          '查找商家自己的官方网站。只根据检索到的公开结果作答，禁止编造域名。',
          null,
          `<hard_rules>
- 只要该店自己的官网（他们自己的域名）。
- 不要 Google Maps、Tripadvisor、Yelp、TheFork、Booking、Instagram、Facebook、Wikipedia。
- 若 Google 给的网址是社交主页、404 或不存在，改找真正的官网。
- 不确定就返回 null。
</hard_rules>`,
          jsonContract(
            '{ website: "https://..." | null }',
            '{ "website": "https://www.rest-maxan.com/" }',
          ),
        ),
        user: [
          `地点：${name}`,
          input.nameLocal ? `当地名称：${input.nameLocal}` : '',
          input.address ? `地址：${input.address}` : '',
          input.googleWebsite ? `Google websiteUri：${input.googleWebsite}` : 'Google 未提供 websiteUri',
          '输出 JSON：{"website":"https://..."} 或 {"website":null}',
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
          '查找这家餐厅在 Tripadvisor 上的餐厅详情页。只根据检索到的公开结果作答，禁止编造。',
          null,
          `<hard_rules>
- 只要 tripadvisor.com / tripadvisor.fr 的 Restaurant_Review 链接，且 URL 里必须带 -d 数字 id（例如 -d5943832-）。
- 不要酒店、景点、城市页，也不要搜索结果页。
- 店名和地址必须能对上；不确定就返回 {"url":null}。
- 禁止编造 URL，也禁止只输出 contentId / locationId 数字。
</hard_rules>`,
          jsonContract(
            '{ url: "https://www.tripadvisor.com/Restaurant_Review-..." | null, name?: string }',
            '{ "url": "https://www.tripadvisor.com/Restaurant_Review-g187147-d698123-Reviews-Bouillon_Chartier-Paris_Ile_de_France.html", "name": "Bouillon Chartier" }',
          ),
        ),
        user: [
          `地点：${name}`,
          input.nameLocal ? `当地名称：${input.nameLocal}` : '',
          input.address ? `地址：${input.address}` : '',
          city ? `城市：${city}` : '',
          '输出 JSON：{"url":"https://www.tripadvisor.com/Restaurant_Review-...","name":"..."} 或 {"url":null}',
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
          '把旅行者口中的巴黎景点名称解析成 Tripadvisor 上常用的正式名称。',
          null,
          `<hard_rules>
- 只处理巴黎都会区的真实景点、博物馆、街道、公园。
- nameEn 必须是拉丁字母的常用英文名（Tripadvisor 列表里会出现的那种，例如 "Champs-Elysees"、"Pont Neuf"、"Eiffel Tower"）。
- 不确定、不是景点、或找不到对应地点时返回 {"nameEn":null}。
- 禁止编造不存在的景点。
</hard_rules>`,
          jsonContract(
            '{ nameEn: string | null, nameFr?: string, aliases?: string[] }',
            '{ "nameEn": "Champs-Elysees", "nameFr": "Avenue des Champs-Élysées", "aliases": ["Champs-Élysées"] }',
          ),
        ),
        [
          `地点：${name}`,
          input.nameLocal ? `当地名称：${input.nameLocal}` : '',
          '城市：Paris',
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
  const langRule = getLlmLanguageInstruction()
  const key = `place-desc:v2:${activeLocale}:${input.name}|${input.type}|${input.address || ''}|${input.googleSummary || ''}`
  return memoizeLlmCall(
    key,
    async () => {
      const system = buildPrompt(
        activeLocale === 'en'
          ? 'Travel copywriter. Write a concise place introduction.'
          : '旅行文案助手。用简洁中文为地点写简介。',
        null,
        `<hard_rules>
- ${langRule}
- <output_format>2–3 句正文，不要列表，不要夸张营销套话，不要标题。</output_format>
</hard_rules>`,
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
      return `<hard_rules>
- ${langRule}
- intro: Detailed, structured English intro in 2–3 short paragraphs separated by newlines. No subheadings or bullet points.
  First paragraph explains what the place is, its history, origins, or significance.
  Second paragraph describes the main highlights, atmosphere, and visitor experience.
- reason: 2–3 sentences summarizing visit value, visitor review highlights, and route pacing.
- tripFit: Always output an empty string.
- Do not fabricate exact ticket prices or hours. Do not mention Tripadvisor/Google in the reason.
- Field order: Write intro first, then reason.
</hard_rules>`
    }
    if (kind === 'food') {
      return `<hard_rules>
- ${langRule}
- intro: Introduce the restaurant/cafe neighborhood, cuisine type, specialty dishes mentioned in reviews, and price level. 1–2 paragraphs separated by newlines.
- reason: 2–3 sentences summarizing food reputation, route connection, and value.
- tripFit: Always output an empty string.
- Do not fabricate menus or exact prices.
- Field order: Write intro first, then reason.
</hard_rules>`
    }
    return `<hard_rules>
- ${langRule}
- intro: 2–3 sentence introduction explaining what it is and who it suits.
- reason: 2–3 sentences explaining why it fits today's itinerary.
- tripFit: Always output an empty string.
- Field order: Write intro first, then reason.
</hard_rules>`
  }

  if (kind === 'attraction') {
    return `<hard_rules>
- ${langRule}
- intro：详细、结构清晰的中文简介，2–3 小段，段与段用换行分隔，不要小标题或项目符号。
  第一段写清楚这是什么地方，以及历史、建造缘由或相关故事；
  第二段写主要看点、空间气质与参观体验。可吸收 existingDescription 与 listingDescription，不要整段照抄英文。
- reason：2–3 句。综合参观价值、featuredReviews 里的游客评价要点、以及当天行程主题/节奏/前后停点。不要罗列评论原文。
- tripFit：固定输出空字符串（地点详情页不展示此项）。
- 不要推荐卢浮宫或凡尔赛；不要编造精确年代、营业时间、票价或欧元数字。
- 推荐理由不要出现 Tripadvisor、Google 等产品名。
- 字段顺序：先写 intro（用户可见简介），再写 reason；不要先输出 reason。
</hard_rules>`
  }
  if (kind === 'food') {
    return `<hard_rules>
- ${langRule}
- intro：介绍这家餐厅/咖啡馆的位置或片区、菜系或品类、资料或评论里提到的特色菜/招牌、以及价格档（只用 priceLevel；没有则不要编造具体欧元数字）。1–2 小段，换行分段，不要小标题。
- reason：2–3 句。综合评论口碑、与当天行程的衔接（餐点时段与路线）、以及性价比。不要罗列评论原文。
- tripFit：固定输出空字符串（地点详情页不展示此项）。
- 不要推荐卢浮宫或凡尔赛；不要编造营业时间、菜单或未提供的价格。
- 推荐理由不要出现 Tripadvisor、Google 等产品名。
- 字段顺序：先写 intro（用户可见简介），再写 reason；不要先输出 reason。
</hard_rules>`
  }
  return `<hard_rules>
- ${langRule}
- intro：2–3 句中文简介，写清这是什么、氛围与适合谁。
- reason：2–3 句，结合当天行程说明为何值得安排。
- tripFit：固定输出空字符串。
- 不要编造营业时间与价格；不要出现 Tripadvisor、Google 等产品名。
- 字段顺序：先写 intro，再写 reason。
</hard_rules>`
}

function placeDetailExample(kind: 'attraction' | 'food' | 'other', locale: Locale = getLocale()): string {
  if (locale === 'en') {
    if (kind === 'attraction') {
      return '{ "intro": "The Arc de Triomphe is an iconic monument commissioned by Napoleon to celebrate French victories, standing proudly at the center of Place Charles de Gaulle with twelve grand avenues radiating outward.\\n\\nClimbing to the top offers panoramic views over the Champs-Élysées and La Défense. The Tomb of the Unknown Soldier and its eternal flame below add historical reverence to the visit.", "reason": "Serving as a visual anchor for the Right Bank classic day, it ties together urban scale and iconic vistas. Visitors appreciate the view, making it a great spacer between museums.", "tripFit": "" }'
    }
    if (kind === 'food') {
      return '{ "intro": "Sphère is located in the 8th arrondissement, offering refined contemporary French dining with a focus on seasonal vegetables and seafood starters. Price level sits around €€, perfect for a sit-down meal between daytime stops.", "reason": "Diners consistently praise the stable execution and quiet ambiance. Fitting neatly into today\'s lunch slot, it keeps the pace relaxed before afternoon sights.", "tripFit": "" }'
    }
    return '{ "intro": "A classic riverside spot ideal for taking in the city atmosphere at a leisurely pace.", "reason": "Conveniently along today\'s route, serving as a brief and relaxing transition stop.", "tripFit": "" }'
  }

  if (kind === 'attraction') {
    return '{ "intro": "凯旋门是拿破仑为纪念法国军队胜利下令建造的纪念碑，矗立在星形广场中央，十二条大道从这里向外辐射。门身上的浮雕与阵亡将士名字，把帝国战争的荣耀与代价刻在同一座石头上。\\n\\n登顶可以把香榭丽舍与拉德芳斯尽收眼底；地面的无名战士墓与长明火，让参观不只是看景，也是一次对历史的停留。", "reason": "作为右岸经典日的视觉锚点，它把轴线、城市尺度和仪式感一次讲清楚。游客普遍觉得登顶视野值得排队，安排在当天博物馆之间也能把节奏拉开。", "tripFit": "" }'
  }
  if (kind === 'food') {
    return '{ "intro": "斯菲尔在玛黑区，主打现代法餐小馆，评论里常点季节蔬菜与海鲜前菜。价格大约在 €€，适合当作白天行程之间的正餐，而不是米其林式的仪式感。", "reason": "食客普遍称赞出品稳定、座位相对安静；放在今天右岸经典日的午餐档，能把博物馆人流和晚餐分开。同区里性价比更扎实，排队通常可控。", "tripFit": "" }'
  }
  return '{ "intro": "塞纳河畔的经典停留点，适合放慢脚步看城市尺度。", "reason": "和今天的路线顺路，当作转换节奏的短停即可。", "tripFit": "" }'
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
      ? 'Travel advisor. Write an engaging place review.'
      : '旅行顾问。为地点详情页写中文点评。',
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
    input.pace === 'park'
      ? '迪士尼日'
      : input.pace === 'self-drive'
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
    const en = getLocale() === 'en'
    return {
      title: en ? `Day ${input.day}` : `第 ${input.day} 天`,
      theme: en ? 'Free time' : '自由安排',
      summary: en
        ? 'No places added yet — pick spots on the map to start building this day.'
        : '今天还没有安排地点，添加景点后会自动生成标题与总结。',
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
- cafe 类：优先 Google 高分 specialty coffee、烘焙店可坐位、brunch/早午餐小店；不要推荐以正餐为主的 brasserie / café-restaurant。
- restaurant 类：正餐（午餐/晚餐），可含 bistro、brasserie、各国菜；不要用咖啡店/纯甜品店凑数。
- 严禁推荐 alreadyOnThisDay 与 alreadyOnTrip 中的地点。
- 尽量避开 avoidAlso（上一批推荐）；batch>1 时必须给出明显不同的新名单，不要复用上一批。
- name 用可被 Google Maps 搜到的正式名称，可附 nameLocal 中文名。
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
