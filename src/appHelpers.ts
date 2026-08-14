/**
 * Helpers + constants extracted from App.tsx during stage 3.3.
 *
 * These are pure (or near-pure) helpers that App.tsx uses for initial
 * state computation, hero copy, and area label rewriting. They have no
 * React dependency and can be unit-tested in isolation.
 */
export { isHotelSelected } from './features/hotel/constants/hotels'
export { dateForTripDay } from './features/itinerary/services/tripDates'
import { isHotelSelected, PENDING_HOTEL } from './features/hotel/constants/hotels'
import { loadHotelCache } from './features/hotel/services/hotelCache'
import { loadFlightSelection } from './features/flight/services/flightSelection'
import { blankDay } from './features/itinerary/utils/itineraryState'
import {
  daysBetween,
  formatTripDayLabel,
} from './features/itinerary/services/tripDates'
import type { DayPlan, HotelCandidate, ItineraryStop, SelectedHotel } from './types'
import type { FlightSelection } from './features/flight/services/flightSelection'
import type { TripDateRange } from './features/itinerary/services/tripDates'

export const ITINERARY_LOADING_LINES = [
  '正在按航班、酒店和推荐偏好拼接日程…',
  '正在从 Google 已验证地点中筛选候选…',
  '正在比较评分、评论量与路线距离…',
  '正在给同一天的地点做片区聚类…',
  '正在检查抵达日和返程日的时间边界…',
  '正在平衡餐饮、景点与休息时间…',
  '正在检查地点重复与路线绕行…',
  '正在把用户偏好转成可执行的日程…',
  '正在确认每天的酒店起点与返程安排…',
  '正在完成结构校验，马上就好…',
]

export const ITINERARY_LOADING_ROTATE_MS = 3200

/** Stable fallback when `days` is empty — avoid `blankDay(1)` per render (breaks useDayNav deps). */
export const EMPTY_DAY_FALLBACK = blankDay(1)

export const AREA_KEY_CN: Record<string, string> = {
  marais: '玛黑',
  opera: '歌剧院一带',
  boulevards: '大林荫道',
  saintGermain: '圣日耳曼',
  latin: '拉丁区',
  trocadero: '16区特罗卡德罗',
}

/** Aliases that may appear in LLM day theme/summary as the hotel base. */
export const AREA_LABEL_ALIASES: Record<string, string[]> = {
  marais: ['玛黑'],
  opera: ['歌剧院一带', '歌剧院', '欧培拉'],
  boulevards: ['大林荫道'],
  saintGermain: ['圣日耳曼', 'Saint-Germain', 'Saint Germain'],
  latin: ['拉丁区'],
  trocadero: ['16区特罗卡德罗', '特罗卡德罗', 'Trocadéro', 'Trocadero'],
}

export function ensureStopId(day: number, stop: ItineraryStop, index: number): string {
  return stop.id || `d${day}-${stop.placeId}-${index}`
}

export function areaAliasEntries(): Array<{ key: string; label: string }> {
  const out: Array<{ key: string; label: string }> = []
  for (const [key, aliases] of Object.entries(AREA_LABEL_ALIASES)) {
    for (const label of aliases) out.push({ key, label })
  }
  // Longest first so「16区特罗卡德罗」wins over「特罗卡德罗」.
  out.sort((a, b) => b.label.length - a.label.length)
  return out
}

/** Rewrite hotel-base phrases (落脚点 / 落脚…) that name the wrong district. */
export function rewriteHotelBaseAreaMentions(text: string, hotelAreaKey: string): string {
  const correct = AREA_KEY_CN[hotelAreaKey]
  if (!correct || !text) return text

  const wrong = areaAliasEntries().filter((a) => a.key !== hotelAreaKey)
  const mentionsWrong = (chunk: string) => wrong.some((a) => chunk.includes(a.label))
  const mentionsAnyArea = (chunk: string) =>
    areaAliasEntries().some((a) => chunk.includes(a.label))

  let next = text

  next = next.replace(/以([^，。；！？\n]{1,20})为落脚点/g, (full, area: string) =>
    mentionsWrong(area) || mentionsAnyArea(area) ? `以${correct}为落脚点` : full,
  )

  next = next.replace(
    /落脚(?!点)(?:于|在)?([^，。；！？\n的]{1,20})/g,
    (full, area: string) => {
      if (!mentionsWrong(area)) return full
      let replaced = area
      for (const a of wrong) {
        if (replaced.includes(a.label)) replaced = replaced.split(a.label).join(correct)
      }
      return full.replace(area, replaced)
    },
  )

  return next
}

/** Day 1 is hotel-settle day — swap any stale district labels in theme/summary. */
export function replaceWrongAreaLabels(text: string, hotelAreaKey: string): string {
  const correct = AREA_KEY_CN[hotelAreaKey]
  if (!correct || !text) return text
  let next = text
  for (const a of areaAliasEntries().filter((x) => x.key !== hotelAreaKey)) {
    if (next.includes(a.label)) next = next.split(a.label).join(correct)
  }
  return next
}

export function syncDaysCopyToHotelArea(days: DayPlan[], hotelAreaKey: string): DayPlan[] {
  if (!AREA_KEY_CN[hotelAreaKey]) return days
  let changed = false
  const next = days.map((d) => {
    let theme = rewriteHotelBaseAreaMentions(d.theme, hotelAreaKey)
    let summary = rewriteHotelBaseAreaMentions(d.summary, hotelAreaKey)
    if (d.day === 1) {
      theme = replaceWrongAreaLabels(theme, hotelAreaKey)
      summary = replaceWrongAreaLabels(summary, hotelAreaKey)
    }
    if (theme === d.theme && summary === d.summary) return d
    changed = true
    return { ...d, theme, summary }
  })
  return changed ? next : days
}

export function seasonEyebrow(startDate?: string | null, destination?: string): string {
  const dest = destination?.trim()
  if (!startDate) return dest ? `${dest} Escape` : 'Next Escape'
  const month = new Date(`${startDate}T12:00:00`).getMonth() + 1
  if (Number.isNaN(month)) return dest ? `${dest} Escape` : 'Next Escape'
  if (month >= 3 && month <= 5) return 'Spring Escape'
  if (month >= 6 && month <= 8) return 'Summer Escape'
  if (month >= 9 && month <= 11) return 'Autumn Escape'
  return 'Winter Escape'
}

export function destinationLabel(destination: string): string {
  return destination.trim() || '目的地'
}

export function chineseDayCount(n: number): string {
  const map: Record<number, string> = {
    1: '一',
    2: '二',
    3: '三',
    4: '四',
    5: '五',
    6: '六',
    7: '七',
    8: '八',
    9: '九',
    10: '十',
  }
  return `${map[n] || n}天`
}

export function hotelAreaShort(hotel: SelectedHotel): string | null {
  if (!hotel.areaKey) return null
  const cn = AREA_KEY_CN[hotel.areaKey]
  if (cn) return cn
  // `hotel.area` is a legacy field on some hotel shapes but isn't in
  // SelectedHotel; fall back to areaKey as a last resort.
  return null
}

export function itineraryThemeTags(days: DayPlan[]): string[] {
  const seen = new Set<string>()
  for (const d of days) {
    const t = d.theme?.trim()
    if (t) seen.add(t)
  }
  return Array.from(seen)
}

export function hasTripDates(tripDates: TripDateRange | null | undefined): boolean {
  return Boolean(tripDates?.startDate && tripDates?.endDate)
}

export function itineraryMissingLabels(input: {
  datesReady: boolean
  outboundReady: boolean
  returnReady: boolean
  hotelReady: boolean
}): string[] {
  const missing: string[] = []
  if (!input.datesReady) missing.push('日期')
  if (!input.outboundReady) missing.push('去程')
  if (!input.returnReady) missing.push('返程')
  if (!input.hotelReady) missing.push('酒店')
  return missing
}

export function buildHeroCopy(
  destination: string,
  tripDates: TripDateRange | null,
  hotel: SelectedHotel,
  days: DayPlan[],
): { eyebrow: string; title: string; blurb: string; tags: string[] } {
  const hotelOn = isHotelSelected(hotel)
  const planDays = Math.max(1, days.length || 1)
  // Header duration = calendar span of selected dates (not itinerary days after flight lag).
  const tripDayCount = tripDates
    ? daysBetween(tripDates.startDate, tripDates.endDate) || planDays
    : planDays
  const durationLabel = chineseDayCount(tripDayCount)
  const dest = destination.trim()
  const destLabel = destinationLabel(destination)
  const area = hotelOn ? hotelAreaShort(hotel) : null
  const hotelPhrase = hotelOn
    ? area
      ? `${area}的${hotel.name}`
      : hotel.name
    : null

  const eyebrow = seasonEyebrow(tripDates?.startDate, dest)
  const title = tripDates
    ? `${dest || '行程'} · ${durationLabel}`
    : dest
      ? `${dest} Tour`
      : '下次去哪儿？'

  const tags: string[] = []
  if (tripDates) {
    tags.push(
      `${formatTripDayLabel(tripDates.startDate)} – ${formatTripDayLabel(tripDates.endDate)}`,
    )
  } else {
    tags.push('日期待定')
  }
  tags.push('市内地铁 + 步行')
  const themes = itineraryThemeTags(days)
  if (themes.length) tags.push(themes.join(' · '))
  if (hotelOn && area) tags.push(`住${area}`)
  else if (hotelOn) tags.push('酒店已定')
  else tags.push('酒店待选')

  let blurb: string
  if (tripDates && hotelPhrase) {
    blurb = dest
      ? `温哥华往返 · 目的地${destLabel}，${formatTripDayLabel(tripDates.startDate)}至${formatTripDayLabel(tripDates.endDate)}，共${durationLabel}，住${hotelPhrase}。航班、路线和你的推荐偏好会一起决定每天的节奏。`
      : `温哥华往返 · ${formatTripDayLabel(tripDates.startDate)}至${formatTripDayLabel(tripDates.endDate)}，共${durationLabel}，住${hotelPhrase}。闹钟可以偷懒，行程不行——先定下目的地，故事才真正开场。`
  } else if (tripDates) {
    blurb = dest
      ? `温哥华往返 · ${destLabel}，${formatTripDayLabel(tripDates.startDate)}至${formatTripDayLabel(tripDates.endDate)}，共${durationLabel}。日期敲定了，枕头还在待业——节奏先留白，酒店一落定，动线就会乖乖跟着你跑。`
      : `温哥华往返 · ${formatTripDayLabel(tripDates.startDate)}至${formatTripDayLabel(tripDates.endDate)}，共${durationLabel}。日期敲定了，目的地与酒店却还在「待议」——先点亮目的地，行程才有坐标。`
  } else if (hotelPhrase) {
    const themeHint =
      themes.length > 0
        ? `市内地铁加步行主打，${themes.join('、')}已塞进行程口袋。`
        : '市内地铁加步行主打，日期一敲定，节奏立刻显形。'
    blurb = dest
      ? `温哥华往返 · ${destLabel}，落脚${hotelPhrase}。床位已锁定，出发日还在装神秘；${themeHint}`
      : `温哥华往返 · 落脚${hotelPhrase}。床位已锁定，目的地与出发日还在装神秘；${themeHint}`
  } else if (dest) {
    blurb = `温哥华往返 · ${destLabel}${chineseDayCount(planDays)}雏形已就位，日期与酒店却还在「待议」。先点亮这两项，行程才会从草稿升级成正经旅行。`
  } else {
    blurb = `温哥华往返 · 先告诉我这次要去哪儿，再排日期、航班与酒店。目的地一定，后面的行程才有根。`
  }

  return { eyebrow, title, blurb, tags }
}

export function initialHotelState(): { hotel: SelectedHotel; candidates: HotelCandidate[] } {
  const cached = loadHotelCache()
  const candidates = cached?.candidates || []
  // Only restore a previously confirmed stay — never auto-pick on load.
  if (cached?.selected && cached.selected.id !== PENDING_HOTEL.id) {
    return { hotel: cached.selected, candidates }
  }
  return { hotel: PENDING_HOTEL, candidates }
}

/** Sync-restore flights so fingerprint / expand gates match saved itinerary on first paint. */
export function initialFlightsState(): FlightSelection {
  const saved = loadFlightSelection()
  return {
    outbound: saved?.outbound ?? null,
    returnFlight: saved?.returnFlight ?? null,
  }
}
