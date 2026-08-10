import { places as catalogPlaces } from '../data/places'
import type {
  DayPlan,
  FlightInfo,
  ItineraryStop,
  Place,
  PlaceType,
  SelectedHotel,
  WalkLevel,
} from '../types'
import { SELECTED_HOTEL_PLACE_ID } from '../utils/dayOrigin'
import { ensureDay1HotelFirst } from '../utils/itineraryState'
import { fetchGooglePlaceDetails, placeDetailsQuery } from './googlePlaceDetails'
import {
  generateFullItinerary,
  generateSingleDayItinerary,
  type FullItineraryPlaceDraft,
  type GenerateFullItineraryInput,
  type GenerateSingleDayItineraryInput,
  type OccupiedPlaceBrief,
} from './llm'

const FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=1200&q=80'

const PACE_SET = new Set(['轻松', '适中', '乐园日', '自驾日'])
const WALK_SET = new Set<WalkLevel>(['很少走', '短步行', '中等步行'])
const TYPE_SET = new Set<PlaceType>(['cafe', 'attraction', 'restaurant', 'transport', 'hotel'])

const DISNEY_PLACE_ID = 'attr-disney'
const CDG_PLACE_ID = 'attr-cdg'
const CHAMPS_PLACE_ID = 'attr-champs'
const ARC_PLACE_ID = 'attr-arc'

function slugKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

function normalizePace(raw: unknown): DayPlan['pace'] {
  const v = String(raw || '').trim()
  if (PACE_SET.has(v)) return v as DayPlan['pace']
  if (/disney|迪士尼|乐园/i.test(v)) return '乐园日'
  if (/自驾|drive/i.test(v)) return '自驾日'
  if (/轻松|relax|light/i.test(v)) return '轻松'
  return '适中'
}

function normalizeWalk(raw: unknown): WalkLevel | undefined {
  const v = String(raw || '').trim() as WalkLevel
  return WALK_SET.has(v) ? v : undefined
}

function normalizeType(raw: unknown): PlaceType {
  const v = String(raw || '').toLowerCase()
  if (v.includes('cafe') || v.includes('coffee') || v === '咖啡馆') return 'cafe'
  if (v.includes('restaurant') || v.includes('food') || v === '餐厅') return 'restaurant'
  if (v.includes('hotel') || v === '酒店') return 'hotel'
  if (v.includes('transport') || v.includes('airport') || v === '交通') return 'transport'
  if (TYPE_SET.has(v as PlaceType)) return v as PlaceType
  return 'attraction'
}

function mapsUrl(query: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

function resolveSpecialPlaceId(key: string, name: string, type: PlaceType): string | null {
  const blob = `${key} ${name} ${type}`.toLowerCase()
  if (
    key === SELECTED_HOTEL_PLACE_ID ||
    key === 'hotel' ||
    key === 'hotel-selected' ||
    type === 'hotel' ||
    /hotel-selected|选中酒店|入住/.test(blob)
  ) {
    return SELECTED_HOTEL_PLACE_ID
  }
  if (
    key === CDG_PLACE_ID ||
    key === 'cdg' ||
    /cdg|戴高乐|charles de gaulle|airport/.test(blob)
  ) {
    return CDG_PLACE_ID
  }
  if (
    key === DISNEY_PLACE_ID ||
    key === 'disney' ||
    /disney|迪士尼/.test(blob)
  ) {
    return DISNEY_PLACE_ID
  }
  if (
    key === CHAMPS_PLACE_ID ||
    key === 'champs' ||
    /champs[-\s]?elysees|香榭/.test(blob)
  ) {
    return CHAMPS_PLACE_ID
  }
  if (
    key === ARC_PLACE_ID ||
    key === 'arc' ||
    /arc\s*de\s*triomphe|凯旋门/.test(blob)
  ) {
    return ARC_PLACE_ID
  }
  return null
}

async function resolveDraftPlace(
  draft: FullItineraryPlaceDraft,
  hotel: SelectedHotel,
): Promise<{ id: string; place?: Place }> {
  const special = resolveSpecialPlaceId(draft.key, draft.name, draft.type)
  if (special === SELECTED_HOTEL_PLACE_ID) {
    return { id: SELECTED_HOTEL_PLACE_ID }
  }
  if (
    special === CDG_PLACE_ID ||
    special === DISNEY_PLACE_ID ||
    special === CHAMPS_PLACE_ID ||
    special === ARC_PLACE_ID
  ) {
    const catalog = catalogPlaces[special]
    return { id: special, place: catalog ? { ...catalog } : undefined }
  }

  const query = placeDetailsQuery(
    draft.area ? `${draft.name} ${draft.area}` : draft.name,
    draft.nameLocal,
  )
  const details = await fetchGooglePlaceDetails(query).catch(() => null)
  const loc = details?.location
  const id = `gen-${slugKey(draft.key || draft.name) || 'place'}-${Math.random()
    .toString(36)
    .slice(2, 7)}`

  const place: Place = {
    id,
    name: details?.name || draft.name,
    // Persist Google's local/original title so itinerary cards are bilingual
    // immediately, even when the LLM only returned a Chinese place name.
    nameLocal: details?.nameOriginal || draft.nameLocal,
    type: draft.type,
    description:
      draft.description ||
      details?.summary ||
      `${draft.name}${draft.area ? `，${draft.area}` : ''}，适合安排进巴黎行程。`,
    ratingHint:
      details?.rating != null
        ? `Google ★ ${details.rating.toFixed(1)}`
        : draft.ratingHint || 'Google 地点',
    priceHint: details?.priceLevel,
    image: details?.photos?.[0] || FALLBACK_IMAGE,
    location: loc || {
      // Soft fallback near hotel so the map still works if Places misses.
      lat: hotel.lat + (Math.random() - 0.5) * 0.01,
      lng: hotel.lng + (Math.random() - 0.5) * 0.01,
    },
    googleMapsUrl: mapsUrl(details?.name || `${draft.name} Paris`),
    durationHint: draft.durationHint || '60 分钟',
  }
  return { id, place }
}

function blankMetroHints(): Record<string, string> {
  return {
    custom: '按导航或地铁前往下一个地点，优先少换乘。',
  }
}

function normalizePlaceName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function isDisneyStop(stop: ItineraryStop, places: Record<string, Place>): boolean {
  if (stop.placeId === DISNEY_PLACE_ID) return true
  return /disney|迪士尼/i.test(places[stop.placeId]?.name || '')
}

/**
 * Disney day: only Disneyland outing + overnight hotel (no café/restaurants/other sights).
 */
function collapseDisneyStopsOnDay(day: DayPlan, places: Record<string, Place>): DayPlan {
  const disneyStop: ItineraryStop = {
    id: `d${day.day}-${DISNEY_PLACE_ID}-0`,
    time: '10:00',
    placeId: DISNEY_PLACE_ID,
    note: '巴黎迪士尼乐园全日；建议提前购票与 App 排队。园内用餐即可，不必另排餐厅站。',
    transport: 'RER A → Marne-la-Vallée–Chessy（约 45–60 分钟）',
    walkLevel: '中等步行',
    duration: '全天',
  }

  const existingDisney = day.stops.find((s) => isDisneyStop(s, places))
  if (existingDisney) {
    disneyStop.id = existingDisney.id || disneyStop.id
    disneyStop.time = existingDisney.time?.match(/^\d{1,2}:\d{2}/)
      ? existingDisney.time
      : '10:00'
    disneyStop.note = existingDisney.note || disneyStop.note
    disneyStop.transport = existingDisney.transport || disneyStop.transport
    disneyStop.duration = existingDisney.duration || disneyStop.duration
  }

  const overnight = day.stops.find((s) => s.placeId === SELECTED_HOTEL_PLACE_ID)
  const stops: ItineraryStop[] = [
    { ...disneyStop, placeId: DISNEY_PLACE_ID },
    {
      id: overnight?.id || `d${day.day}-${SELECTED_HOTEL_PLACE_ID}-overnight`,
      time: overnight?.time || '21:30',
      placeId: SELECTED_HOTEL_PLACE_ID,
      note: overnight?.note || '乐园归来回酒店休整；早出晚归预留疲惫。',
      transport: overnight?.transport || 'RER A 回城',
      walkLevel: overnight?.walkLevel || '很少走',
      duration: overnight?.duration || '过夜',
    },
  ]

  return {
    ...day,
    title: day.title.includes('迪士尼') ? day.title : '巴黎迪士尼',
    theme: day.theme || 'RER A 乐园日',
    pace: '乐园日',
    summary: day.summary || '今天只去迪士尼，不安排其他景点；园内玩够再回酒店。',
    stops,
  }
}

function tripHasPlaceId(days: DayPlan[], placeId: string): boolean {
  return days.some((d) => d.stops.some((s) => s.placeId === placeId))
}

function isLandmarkStop(stop: ItineraryStop, places: Record<string, Place>, kind: 'champs' | 'arc'): boolean {
  if (kind === 'champs') {
    if (stop.placeId === CHAMPS_PLACE_ID) return true
    return /champs|香榭/i.test(places[stop.placeId]?.name || '')
  }
  if (stop.placeId === ARC_PLACE_ID) return true
  return /arc\s*de\s*triomphe|凯旋门/i.test(places[stop.placeId]?.name || '')
}

/** Ensure 香榭丽舍 + 凯旋门 appear somewhere on a non-Disney, non-last mid day. */
function ensureMustSeeLandmarks(days: DayPlan[], places: Record<string, Place>): DayPlan[] {
  const n = days.length
  if (n < 1) return days

  const hasChamps = days.some((d) =>
    d.stops.some((s) => isLandmarkStop(s, places, 'champs')),
  )
  const hasArc = days.some((d) => d.stops.some((s) => isLandmarkStop(s, places, 'arc')))
  if (hasChamps && hasArc) {
    // Normalize placeIds when matched by name
    return days.map((day) => ({
      ...day,
      stops: day.stops.map((s) => {
        if (isLandmarkStop(s, places, 'champs') && s.placeId !== CHAMPS_PLACE_ID) {
          return { ...s, placeId: CHAMPS_PLACE_ID }
        }
        if (isLandmarkStop(s, places, 'arc') && s.placeId !== ARC_PLACE_ID) {
          return { ...s, placeId: ARC_PLACE_ID }
        }
        return s
      }),
    }))
  }

  const disneyDay = n >= 3 ? n - 1 : null
  // Prefer a mid sightseeing day: not day1, not last, not disney
  let targetIdx = days.findIndex((d) => {
    if (d.day === 1) return false
    if (n > 1 && d.day === n) return false
    if (disneyDay != null && d.day === disneyDay) return false
    return true
  })
  if (targetIdx < 0) {
    // Fall back to day 1 outing if trip is very short
    targetIdx = 0
  }

  const next = days.map((d) => ({ ...d, stops: [...d.stops] }))
  const day = next[targetIdx]
  const insert: ItineraryStop[] = []
  if (!hasArc && !tripHasPlaceId(next, ARC_PLACE_ID)) {
    insert.push({
      id: `d${day.day}-${ARC_PLACE_ID}-must`,
      time: '11:00',
      placeId: ARC_PLACE_ID,
      note: '必去：凯旋门；可登顶俯瞰香街。',
      transport: '地铁 1/2/6 号线 Étoile',
      walkLevel: '短步行',
      duration: '60–90 分钟',
    })
  }
  if (!hasChamps && !tripHasPlaceId(next, CHAMPS_PLACE_ID)) {
    insert.push({
      id: `d${day.day}-${CHAMPS_PLACE_ID}-must`,
      time: '12:30',
      placeId: CHAMPS_PLACE_ID,
      note: '必去：香榭丽舍大街中段散步即可，不必走完全程。',
      transport: '从凯旋门向东步行',
      walkLevel: '短步行',
      duration: '45–60 分钟',
    })
  }
  if (!insert.length) return next

  // Insert before overnight hotel if present, else append
  const hotelIdx = day.stops.findIndex((s) => s.placeId === SELECTED_HOTEL_PLACE_ID)
  if (hotelIdx >= 0 && (n === 1 || day.day !== n)) {
    // Prefer after first café / check-in: put before last hotel
    day.stops.splice(hotelIdx, 0, ...insert)
  } else if (day.day === 1 && day.stops[0]?.placeId === SELECTED_HOTEL_PLACE_ID) {
    day.stops.splice(1, 0, ...insert)
  } else {
    day.stops.push(...insert)
  }
  next[targetIdx] = { ...day, stops: [...day.stops] }
  return next
}

/**
 * Light-touch dedupe: drop later repeats of the same placeId / place name across the trip.
 * Hotel, CDG, and Disney (handled per Disney-day collapse) are exempt.
 */
function dedupeAttractionStops(
  days: DayPlan[],
  places: Record<string, Place>,
): DayPlan[] {
  const seenIds = new Set<string>()
  const seenNames = new Set<string>()

  return days.map((day) => {
    const stops = day.stops.filter((s) => {
      if (
        s.placeId === SELECTED_HOTEL_PLACE_ID ||
        s.placeId === CDG_PLACE_ID ||
        s.placeId === DISNEY_PLACE_ID ||
        isDisneyStop(s, places)
      ) {
        return true
      }
      const name = normalizePlaceName(places[s.placeId]?.name || '')
      if (seenIds.has(s.placeId)) return false
      if (name && seenNames.has(name)) return false
      seenIds.add(s.placeId)
      if (name) seenNames.add(name)
      return true
    })
    return stops.length === day.stops.length ? day : { ...day, stops }
  })
}

/** Light structural fixes after LLM + place resolve. */
export function validateAndFixGeneratedDays(
  days: DayPlan[],
  places: Record<string, Place>,
  dayCount: number,
): DayPlan[] {
  const n = Math.max(1, dayCount)
  let next = days
    .filter((d) => d.day >= 1 && d.day <= n)
    .sort((a, b) => a.day - b.day)

  // Ensure contiguous day numbers 1..n
  const byDay = new Map(next.map((d) => [d.day, d]))
  const filled: DayPlan[] = []
  for (let i = 1; i <= n; i++) {
    const existing = byDay.get(i)
    filled.push(
      existing
        ? {
            ...existing,
            day: i,
            metroHintFromArea: existing.metroHintFromArea || blankMetroHints(),
            stops: existing.stops.map((s, idx) => ({
              ...s,
              id: s.id || `d${i}-${s.placeId}-${idx}`,
            })),
          }
        : {
            day: i,
            title: i === 1 ? '抵达巴黎' : i === n ? '返程' : `第 ${i} 天`,
            theme: i === n - 1 && n >= 3 ? '迪士尼乐园日' : '自由安排',
            pace: i === n - 1 && n >= 3 ? '乐园日' : i === 1 || i === n ? '轻松' : '适中',
            summary:
              i === n - 1 && n >= 3
                ? '今天只去迪士尼，不安排其他景点。'
                : '今天行程待补全。',
            metroHintFromArea: blankMetroHints(),
            stops:
              i === n - 1 && n >= 3
                ? [
                    {
                      id: `d${i}-${DISNEY_PLACE_ID}-0`,
                      time: '10:00',
                      placeId: DISNEY_PLACE_ID,
                      note: '巴黎迪士尼乐园全日；建议提前购票与 App 排队。',
                      transport: 'RER A → Marne-la-Vallée–Chessy',
                      walkLevel: '中等步行',
                      duration: '全天',
                    },
                  ]
                : [],
          },
    )
  }

  // Disney day = second-to-last when N >= 3 — outing is Disney only (+ overnight hotel)
  if (n >= 3) {
    const disneyIdx = n - 2
    const d = filled[disneyIdx]
    filled[disneyIdx] = collapseDisneyStopsOnDay(
      {
        ...d,
        title: d.title.includes('迪士尼') ? d.title : '巴黎迪士尼',
        theme: d.theme || 'RER A 乐园日',
        pace: '乐园日',
        summary: d.summary || '今天只去迪士尼，不安排其他景点。',
      },
      places,
    )

    // Keep Disney only on the dedicated day.
    for (let i = 0; i < n; i++) {
      if (i === disneyIdx) continue
      const day = filled[i]
      const filtered = day.stops.filter((s) => !isDisneyStop(s, places))
      if (filtered.length !== day.stops.length) {
        filled[i] = { ...day, stops: filtered }
      }
    }
  }

  // Drop obvious duplicate attractions across the trip (hotel/CDG exempt).
  const deduped = dedupeAttractionStops(filled, places)
  for (let i = 0; i < n; i++) filled[i] = deduped[i]

  // Must-see: 香榭丽舍 + 凯旋门
  const withLandmarks = ensureMustSeeLandmarks(filled, places)
  for (let i = 0; i < n; i++) filled[i] = withLandmarks[i]

  // Last day (N>1): hotel is departure origin only — strip hotel stops (Day 1 check-in kept).
  if (n > 1) {
    const lastDay = filled[n - 1]
    filled[n - 1] = {
      ...lastDay,
      stops: lastDay.stops.filter((s) => {
        if (s.placeId === SELECTED_HOTEL_PLACE_ID) return false
        if (places[s.placeId]?.type === 'hotel') return false
        return true
      }),
    }
  }

  // Last day: ensure CDG stop exists
  const last = filled[n - 1]
  const hasCdg = last.stops.some((s) => s.placeId === CDG_PLACE_ID)
  if (!hasCdg) {
    filled[n - 1] = {
      ...last,
      title: last.title || '返程',
      pace: '轻松',
      stops: [
        ...last.stops,
        {
          id: `d${n}-${CDG_PLACE_ID}-fix`,
          time: '按航班倒推',
          placeId: CDG_PLACE_ID,
          note: '国际航班建议起飞前 3–3.5 小时到 CDG；按返程时刻倒推离开酒店。',
          transport: 'RER B 或出租车',
          walkLevel: '很少走',
          duration: '离境',
        },
      ],
    }
  }

  // Meals (午餐/晚餐 restaurant stops): enforced mainly via LLM hardRules; no structural rewrite here.
  // Soft: days 2..n should prefer ~10:00 starts (skip pushing airport-only last day)
  for (let i = 1; i < n; i++) {
    const d = filled[i]
    if (!d.stops.length) continue
    const first = d.stops[0]
    if (first.placeId === CDG_PLACE_ID) continue
    const m = first.time?.match(/^(\d{1,2}):(\d{2})$/)
    if (!m) continue
    const minutes = Number(m[1]) * 60 + Number(m[2])
    // Don't force Disney day earlier than 10 if LLM put café at 10; only bump very early starts
    if (minutes < 9 * 60) {
      const delta = 10 * 60 - minutes
      filled[i] = {
        ...d,
        stops: d.stops.map((s) => {
          const tm = s.time?.match(/^(\d{1,2}):(\d{2})$/)
          if (!tm) return s
          const nextMin = Number(tm[1]) * 60 + Number(tm[2]) + delta
          const hh = String(Math.floor(nextMin / 60) % 24).padStart(2, '0')
          const mm = String(nextMin % 60).padStart(2, '0')
          return { ...s, time: `${hh}:${mm}` }
        }),
      }
    }
  }

  // Day 1 hotel first + non-last days end at hotel + last-day hotel strip.
  return ensureDay1HotelFirst(filled)
}

export interface GeneratedItineraryResult {
  days: DayPlan[]
  customPlaces: Record<string, Place>
}

function softFixSingleDay(
  day: DayPlan,
  places: Record<string, Place>,
  dayCount: number,
): DayPlan {
  const n = Math.max(1, dayCount)
  let next: DayPlan = {
    ...day,
    metroHintFromArea: day.metroHintFromArea || blankMetroHints(),
    stops: day.stops.map((s, idx) => ({
      ...s,
      id: s.id || `d${day.day}-${s.placeId}-${idx}`,
    })),
  }

  const disneyDay = n >= 3 ? n - 1 : null
  if (disneyDay != null && next.day === disneyDay) {
    next = collapseDisneyStopsOnDay(
      {
        ...next,
        title: next.title.includes('迪士尼') ? next.title : '巴黎迪士尼',
        theme: next.theme || 'RER A 乐园日',
        pace: '乐园日',
        summary: next.summary || '今天只去迪士尼，不安排其他景点。',
      },
      places,
    )
  } else if (n >= 3) {
    // Non-Disney days must not keep a Disney stop.
    const filtered = next.stops.filter((s) => !isDisneyStop(s, places))
    if (filtered.length !== next.stops.length) {
      next = { ...next, stops: filtered }
    }
  }

  if (n > 1 && next.day === n) {
    next = {
      ...next,
      title: next.title || '返程',
      pace: next.pace || '轻松',
      stops: next.stops.filter((s) => {
        if (s.placeId === SELECTED_HOTEL_PLACE_ID) return false
        if (places[s.placeId]?.type === 'hotel') return false
        return true
      }),
    }
    if (!next.stops.some((s) => s.placeId === CDG_PLACE_ID)) {
      next = {
        ...next,
        stops: [
          ...next.stops,
          {
            id: `d${n}-${CDG_PLACE_ID}-fix`,
            time: '按航班倒推',
            placeId: CDG_PLACE_ID,
            note: '国际航班建议起飞前 3–3.5 小时到 CDG；按返程时刻倒推离开酒店。',
            transport: 'RER B 或出租车',
            walkLevel: '很少走',
            duration: '离境',
          },
        ],
      }
    }
  }

  // Soft bump very early starts on non-Day-1 days.
  if (next.day > 1 && next.stops.length) {
    const first = next.stops[0]
    if (first.placeId !== CDG_PLACE_ID) {
      const m = first.time?.match(/^(\d{1,2}):(\d{2})$/)
      if (m) {
        const minutes = Number(m[1]) * 60 + Number(m[2])
        if (minutes < 9 * 60) {
          const delta = 10 * 60 - minutes
          next = {
            ...next,
            stops: next.stops.map((s) => {
              const tm = s.time?.match(/^(\d{1,2}):(\d{2})$/)
              if (!tm) return s
              const nextMin = Number(tm[1]) * 60 + Number(tm[2]) + delta
              const hh = String(Math.floor(nextMin / 60) % 24).padStart(2, '0')
              const mm = String(nextMin % 60).padStart(2, '0')
              return { ...s, time: `${hh}:${mm}` }
            }),
          }
        }
      }
    }
  }

  return next
}

function stripDupesAgainstOccupied(
  day: DayPlan,
  places: Record<string, Place>,
  occupied: OccupiedPlaceBrief[],
): DayPlan {
  const occupiedIds = new Set(
    occupied.map((p) => p.placeId).filter((id): id is string => Boolean(id)),
  )
  const occupiedNames = new Set(
    occupied
      .map((p) => normalizePlaceName(p.name || ''))
      .filter(Boolean),
  )

  const seenIds = new Set<string>()
  const seenNames = new Set<string>()
  const stops = day.stops.filter((s) => {
    if (
      s.placeId === SELECTED_HOTEL_PLACE_ID ||
      s.placeId === CDG_PLACE_ID ||
      s.placeId === DISNEY_PLACE_ID
    ) {
      return true
    }
    const name = normalizePlaceName(places[s.placeId]?.name || '')
    if (occupiedIds.has(s.placeId) || seenIds.has(s.placeId)) return false
    if (name && (occupiedNames.has(name) || seenNames.has(name))) return false
    seenIds.add(s.placeId)
    if (name) seenNames.add(name)
    return true
  })
  return stops.length === day.stops.length ? day : { ...day, stops }
}

/**
 * Regenerate one day: LLM draft → Google resolve → merge into existing plan.
 * Keeps other days intact; preserves generated fingerprint at the App layer.
 */
export async function buildGeneratedSingleDay(
  input: Omit<GenerateSingleDayItineraryInput, 'hotel'> & {
    hotel: SelectedHotel
    /** Display label for hotel area (e.g. 16区特罗卡德罗). */
    hotelAreaLabel?: string
    existingDays: DayPlan[]
    existingCustomPlaces: Record<string, Place>
  },
): Promise<GeneratedItineraryResult> {
  const hotel = input.hotel
  const areaLabel =
    input.hotelAreaLabel || hotel.areaKey || undefined
  const draft = await generateSingleDayItinerary({
    destination: input.destination,
    dayCount: input.dayCount,
    dayNumber: input.dayNumber,
    calendarDate: input.calendarDate,
    tripStartDate: input.tripStartDate,
    tripEndDate: input.tripEndDate,
    itineraryStartDate: input.itineraryStartDate,
    nights: input.nights,
    hotel: {
      name: hotel.name,
      address: hotel.address,
      area: areaLabel,
      areaKey: hotel.areaKey,
      lat: hotel.lat,
      lng: hotel.lng,
      nearestMetro: hotel.nearestMetro,
    },
    outbound: input.outbound,
    returnFlight: input.returnFlight,
    occupiedPlaces: input.occupiedPlaces,
    preferences: input.preferences,
  })
  const dayNumber = Math.max(1, Math.min(input.dayCount, input.dayNumber))

  const draftByKey = new Map(draft.places.map((p) => [p.key, p]))
  for (const stop of draft.day.stops) {
    const key = String(stop.placeKey || '').trim()
    if (!key || draftByKey.has(key)) continue
    draftByKey.set(key, {
      key,
      name: key,
      type: 'attraction',
      description: '',
    })
  }

  const keyToId = new Map<string, string>()
  const customPlaces: Record<string, Place> = { ...input.existingCustomPlaces }

  if (catalogPlaces[DISNEY_PLACE_ID]) {
    customPlaces[DISNEY_PLACE_ID] = {
      ...catalogPlaces[DISNEY_PLACE_ID],
      ...customPlaces[DISNEY_PLACE_ID],
    }
  }
  if (catalogPlaces[CDG_PLACE_ID]) {
    customPlaces[CDG_PLACE_ID] = {
      ...catalogPlaces[CDG_PLACE_ID],
      ...customPlaces[CDG_PLACE_ID],
    }
  }

  const settled = await Promise.allSettled(
    [...draftByKey.values()].map(async (row) => {
      const resolved = await resolveDraftPlace(
        {
          ...row,
          type: normalizeType(row.type),
        },
        hotel,
      )
      return { key: row.key, ...resolved }
    }),
  )

  for (const result of settled) {
    if (result.status !== 'fulfilled') continue
    const { key, id, place } = result.value
    keyToId.set(key, id)
    if (place && id !== SELECTED_HOTEL_PLACE_ID) {
      customPlaces[id] = place
    }
  }

  const stops: ItineraryStop[] = draft.day.stops.map((s, index) => {
    const key = String(s.placeKey || '').trim()
    let placeId = keyToId.get(key)
    if (!placeId) {
      const special = resolveSpecialPlaceId(key, key, 'attraction')
      placeId = special || `missing-${slugKey(key) || index}`
    }
    return {
      id: `d${dayNumber}-${placeId}-${index}`,
      time: String(s.time || '10:00').trim() || '10:00',
      placeId,
      note: String(s.note || '').trim() || '按当天节奏灵活调整。',
      transport: s.transport ? String(s.transport).trim() : undefined,
      walkLevel: normalizeWalk(s.walkLevel) || '短步行',
      duration: s.duration ? String(s.duration).trim() : undefined,
    }
  })

  let newDay: DayPlan = {
    day: dayNumber,
    title: String(draft.day.title || `第 ${dayNumber} 天`).trim().slice(0, 16),
    theme: String(draft.day.theme || '').trim() || '巴黎日程',
    pace: normalizePace(draft.day.pace),
    summary: String(draft.day.summary || '').trim() || '今天按地图与体力微调即可。',
    metroHintFromArea:
      draft.day.metroHintFromArea && typeof draft.day.metroHintFromArea === 'object'
        ? draft.day.metroHintFromArea
        : blankMetroHints(),
    stops,
  }

  newDay = softFixSingleDay(newDay, customPlaces, input.dayCount)
  newDay = stripDupesAgainstOccupied(
    newDay,
    customPlaces,
    input.occupiedPlaces || [],
  )

  const byDay = new Map(input.existingDays.map((d) => [d.day, d]))
  byDay.set(dayNumber, newDay)
  const merged: DayPlan[] = []
  for (let i = 1; i <= input.dayCount; i++) {
    const existing = byDay.get(i)
    merged.push(
      existing
        ? { ...existing, day: i }
        : {
            day: i,
            title: `第 ${i} 天`,
            theme: '自由安排',
            pace: '适中',
            summary: '今天行程待补全。',
            metroHintFromArea: blankMetroHints(),
            stops: [],
          },
    )
  }

  // Hotel pin helpers: Day 1 check-in first; non-last end at hotel; last day hotel stripped.
  const fixed = ensureDay1HotelFirst(merged)
  return { days: fixed, customPlaces }
}

/**
 * Ask the LLM for a full multi-day plan, resolve places via Google, then light-fix.
 */
export async function buildGeneratedItinerary(
  input: GenerateFullItineraryInput & { hotel: SelectedHotel },
): Promise<GeneratedItineraryResult> {
  const draft = await generateFullItinerary(input)
  const hotel = input.hotel

  const draftByKey = new Map(draft.places.map((p) => [p.key, p]))
  // Also collect placeKeys referenced in stops but missing from places[]
  for (const day of draft.days) {
    for (const stop of day.stops) {
      const key = String(stop.placeKey || '').trim()
      if (!key || draftByKey.has(key)) continue
      draftByKey.set(key, {
        key,
        name: key,
        type: 'attraction',
        description: '',
      })
    }
  }

  const keyToId = new Map<string, string>()
  const customPlaces: Record<string, Place> = {}

  // Always seed catalog landmarks into lookup
  for (const id of [DISNEY_PLACE_ID, CDG_PLACE_ID, CHAMPS_PLACE_ID, ARC_PLACE_ID]) {
    if (catalogPlaces[id]) {
      customPlaces[id] = { ...catalogPlaces[id] }
    }
  }

  const resolveJobs = [...draftByKey.values()]
  const settled = await Promise.allSettled(
    resolveJobs.map(async (row) => {
      const resolved = await resolveDraftPlace(
        {
          ...row,
          type: normalizeType(row.type),
        },
        hotel,
      )
      return { key: row.key, ...resolved }
    }),
  )

  for (const result of settled) {
    if (result.status !== 'fulfilled') continue
    const { key, id, place } = result.value
    keyToId.set(key, id)
    if (place && id !== SELECTED_HOTEL_PLACE_ID) {
      customPlaces[id] = place
    }
  }

  const days: DayPlan[] = draft.days.map((d) => {
    const stops: ItineraryStop[] = d.stops.map((s, index) => {
      const key = String(s.placeKey || '').trim()
      let placeId = keyToId.get(key)
      if (!placeId) {
        const special = resolveSpecialPlaceId(key, key, 'attraction')
        placeId = special || `missing-${slugKey(key) || index}`
      }
      return {
        id: `d${d.day}-${placeId}-${index}`,
        time: String(s.time || '10:00').trim() || '10:00',
        placeId,
        note: String(s.note || '').trim() || '按当天节奏灵活调整。',
        transport: s.transport ? String(s.transport).trim() : undefined,
        walkLevel: normalizeWalk(s.walkLevel) || '短步行',
        duration: s.duration ? String(s.duration).trim() : undefined,
      }
    })

    return {
      day: d.day,
      title: String(d.title || `第 ${d.day} 天`).trim().slice(0, 16),
      theme: String(d.theme || '').trim() || '巴黎日程',
      pace: normalizePace(d.pace),
      summary: String(d.summary || '').trim() || '今天按地图与体力微调即可。',
      metroHintFromArea:
        d.metroHintFromArea && typeof d.metroHintFromArea === 'object'
          ? (d.metroHintFromArea as Record<string, string>)
          : blankMetroHints(),
      stops,
    }
  })

  const fixed = validateAndFixGeneratedDays(days, customPlaces, input.dayCount)
  return { days: fixed, customPlaces }
}

export function flightContextBrief(flight: FlightInfo | null | undefined): {
  flightNumber: string
  airline?: string
  from?: FlightInfo['from']
  to?: FlightInfo['to']
  duration?: string
  status?: string
  rawNote?: string
} | null {
  if (!flight?.flightNumber) return null
  return {
    flightNumber: flight.flightNumber,
    airline: flight.airline,
    from: flight.from,
    to: flight.to,
    duration: flight.duration,
    status: flight.status,
    rawNote: flight.rawNote,
  }
}
