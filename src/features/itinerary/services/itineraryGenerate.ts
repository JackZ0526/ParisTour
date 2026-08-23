import { places as catalogPlaces } from '../../place/constants/places'
import type {
  DayPlan,
  FlightInfo,
  ItineraryStop,
  Pace,
  Place,
  PlaceType,
  SelectedHotel,
  Transport,
  WalkLevel,
} from '../../../types'
import { SELECTED_HOTEL_PLACE_ID } from '../utils/dayOrigin'
import { fetchWikimediaPlacePhoto } from '../../map/services/wikimediaPlacePhotos'
import { ensureDay1HotelFirst } from '../utils/itineraryState'
import { getLocale, translate } from '../../../shared/i18n'
import {
  fetchGooglePlaceDetails,
  placeDetailsQuery,
  searchNearbyGooglePlaceCandidates,
} from '../../map/services/googlePlaceDetails'
import { fetchPlaceWebsitePhotos } from '../../place/services/placeWebsitePhotos'
import {
  fetchTripadvisorAttractionInfo,
  listSeededTripadvisorAttractions,
  tripadvisorContentIdFromCandidate,
} from '../../place/services/tripadvisorPlacePhotos'
import {
  generateFullItinerary,
  generateSingleDayItinerary,
  type FullItineraryPlaceDraft,
  type GenerateFullItineraryInput,
  type GenerateSingleDayItineraryInput,
  type OccupiedPlaceBrief,
  type VerifiedPlaceCandidate,
} from '../../../shared/services/llm/llm'

const FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=1200&q=80'

const PACE_SET = new Set<Pace>(['relaxed', 'moderate', 'park', 'self-drive'])
const WALK_SET = new Set<WalkLevel>(['minimal', 'short', 'moderate'])
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
  if (PACE_SET.has(v as Pace)) return v as Pace
  if (/disney|迪士尼|乐园/i.test(v)) return 'park'
  if (/自驾|drive/i.test(v)) return 'self-drive'
  if (/轻松|relax|light/i.test(v)) return 'relaxed'
  return 'moderate'
}

function normalizeWalk(raw: unknown): WalkLevel | undefined {
  const v = String(raw || '').trim() as WalkLevel
  return WALK_SET.has(v) ? v : undefined
}

function normalizeTransportChoice(raw: unknown): Transport | undefined {
  const text = String(raw || '').trim()
  if (!text) return undefined
  return /walk|walking|步行|走路|步走/i.test(text) ? 'walking' : 'transit'
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

function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

function attractionCandidatesFromTripadvisor(
  hotel: SelectedHotel,
): VerifiedPlaceCandidate[] {
  return listSeededTripadvisorAttractions().map((item) => ({
    id: `ta-${item.contentId}`,
    name: item.name,
    type: 'attraction' as const,
    distanceMeters: item.location
      ? Math.round(haversineMeters({ lat: hotel.lat, lng: hotel.lng }, item.location))
      : undefined,
  }))
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

async function resolveAttractionPlace(
  draft: FullItineraryPlaceDraft,
  hotel: SelectedHotel,
  specialId?: string,
): Promise<{ id: string; place?: Place }> {
  const catalog = specialId ? catalogPlaces[specialId] : undefined
  const lookupName = draft.name || catalog?.name || ''
  const lookupLocal = draft.nameLocal || catalog?.nameLocal
  const googleQuery = placeDetailsQuery(lookupName, lookupLocal)
  const [ta, google] = await Promise.all([
    fetchTripadvisorAttractionInfo({
      name: lookupName,
      nameLocal: lookupLocal,
      contentId: tripadvisorContentIdFromCandidate(draft.googlePlaceId),
    }).catch(() => null),
    googleQuery
      ? fetchGooglePlaceDetails(googleQuery, catalog?.location, {
          placeId: /^ChI/i.test(draft.googlePlaceId || '')
            ? draft.googlePlaceId
            : undefined,
          recoverPhotos: false,
        }).catch(() => null)
      : Promise.resolve(null),
  ])
  const loc =
    ta?.location ||
    google?.location ||
    catalog?.location || {
      lat: hotel.lat + (Math.random() - 0.5) * 0.01,
      lng: hotel.lng + (Math.random() - 0.5) * 0.01,
    }
  const wikimediaPhoto =
    !ta?.photos[0] && loc
      ? await fetchWikimediaPlacePhoto(ta?.name || draft.name, loc)
      : null
  const id =
    specialId ||
    `gen-${slugKey(draft.key || draft.name) || 'place'}-${Math.random()
      .toString(36)
      .slice(2, 7)}`
  const displayName = /[\u3400-\u9fff]/.test(draft.name)
    ? draft.name
    : catalog?.name || ta?.name || draft.name
  const place: Place = {
    ...(catalog ? { ...catalog } : {}),
    id,
    tripadvisorContentId: ta?.contentId || catalog?.tripadvisorContentId,
    googlePlaceId: google?.id,
    name: displayName,
    nameLocal: catalog?.nameLocal || draft.nameLocal || ta?.name,
    type: 'attraction',
    description:
      ta?.description ||
      draft.description ||
      catalog?.description ||
      `${draft.name}${draft.area ? `，${draft.area}` : ''}，适合安排进巴黎行程。`,
    googleRating: google?.rating,
    googleUserRatingCount: google?.userRatingCount,
    googleAddress: google?.address || draft.googleAddress,
    ratingHint:
      ta?.rating != null
        ? `Tripadvisor ★ ${ta.rating.toFixed(1)}`
        : catalog?.ratingHint?.replace(/Google/i, 'Tripadvisor') ||
          'Tripadvisor 景点',
    image: ta?.photos[0] || wikimediaPhoto?.url || catalog?.image || FALLBACK_IMAGE,
    location: loc,
    googleMapsUrl: mapsUrl(ta?.name || catalog?.nameLocal || `${draft.name} Paris`),
    durationHint: draft.durationHint || catalog?.durationHint || '60 分钟',
  }
  return { id, place }
}

async function resolveDraftPlace(
  draft: FullItineraryPlaceDraft,
  hotel: SelectedHotel,
): Promise<{ id: string; place?: Place }> {
  const special = resolveSpecialPlaceId(draft.key, draft.name, draft.type)
  if (special === SELECTED_HOTEL_PLACE_ID) {
    return { id: SELECTED_HOTEL_PLACE_ID }
  }
  if (special === CDG_PLACE_ID || special === DISNEY_PLACE_ID) {
    const catalog = catalogPlaces[special]
    return { id: special, place: catalog ? { ...catalog } : undefined }
  }

  const cacheKey =
    draft.googlePlaceId?.trim() ||
    `${draft.type}:${normalizePlaceName(draft.name)}:${String(draft.area || '')
      .trim()
      .toLowerCase()}`
  const cached = placeResolveCache.get(cacheKey)
  if (cached) {
    return {
      id: cached.id,
      place: cached.place ? { ...cached.place } : undefined,
    }
  }

  if (
    draft.type === 'attraction' ||
    special === CHAMPS_PLACE_ID ||
    special === ARC_PLACE_ID
  ) {
    const resolved = await resolveAttractionPlace(
      draft,
      hotel,
      special === CHAMPS_PLACE_ID || special === ARC_PLACE_ID
        ? special
        : undefined,
    )
    placeResolveCache.set(cacheKey, resolved)
    if (resolved.place?.tripadvisorContentId) {
      placeResolveCache.set(`ta-${resolved.place.tripadvisorContentId}`, resolved)
    }
    return resolved
  }

  const query = placeDetailsQuery(
    draft.area ? `${draft.name} ${draft.area}` : draft.name,
    draft.nameLocal,
  )
  const details = await fetchGooglePlaceDetails(query, undefined, {
    placeId: draft.googlePlaceId,
    recoverPhotos: false,
  }).catch(() => null)
  const loc = details?.location
  const websitePhoto = details?.website
    ? (
        await fetchPlaceWebsitePhotos(details.website, {
          name: details.name || draft.name,
          nameLocal: details.nameOriginal || draft.nameLocal,
        }).catch(() => ({
          photos: [] as string[],
        }))
      ).photos[0] || null
    : null
  const id = `gen-${slugKey(draft.key || draft.name) || 'place'}-${Math.random()
    .toString(36)
    .slice(2, 7)}`

  const place: Place = {
    id,
    googlePlaceId: details?.id || draft.googlePlaceId,
    name: /[\u3400-\u9fff]/.test(draft.name)
      ? draft.name
      : details?.name || draft.name,
    // Persist Google's local/original title so itinerary cards are bilingual
    // immediately, even when the LLM only returned a Chinese place name.
    nameLocal: details?.nameOriginal || draft.nameLocal,
    type: draft.type,
    description:
      draft.description ||
      details?.summary ||
      `${draft.name}${draft.area ? `，${draft.area}` : ''}，适合安排进巴黎行程。`,
    googleRating: details?.rating,
    googleUserRatingCount: details?.userRatingCount,
    googleAddress: details?.address || draft.googleAddress,
    ratingHint:
      details?.rating != null
        ? `Google ★ ${details.rating.toFixed(1)}`
        : draft.ratingHint || 'Google 地点',
    priceHint: details?.priceLevel,
    image: websitePhoto || FALLBACK_IMAGE,
    location: loc || {
      // Soft fallback near hotel so the map still works if Places misses.
      lat: hotel.lat + (Math.random() - 0.5) * 0.01,
      lng: hotel.lng + (Math.random() - 0.5) * 0.01,
    },
    googleMapsUrl: mapsUrl(details?.name || `${draft.name} Paris`),
    durationHint: draft.durationHint || '60 分钟',
  }
  placeResolveCache.set(cacheKey, { id, place })
  if (place.googlePlaceId) {
    placeResolveCache.set(place.googlePlaceId, { id, place })
  }
  return { id, place }
}

type CandidateCacheEntry = {
  hotelKey: string
  candidates: VerifiedPlaceCandidate[]
  at: number
}

let sessionCandidateCache: CandidateCacheEntry | null = null
const placeResolveCache = new Map<string, { id: string; place?: Place }>()
const CANDIDATE_CACHE_TTL_MS = 30 * 60 * 1000

function hotelCandidateKey(hotel: SelectedHotel): string {
  return `${hotel.id}:${hotel.lat.toFixed(3)}:${hotel.lng.toFixed(3)}`
}

async function loadItineraryCandidates(
  hotel: SelectedHotel,
  occupiedNames: string[] = [],
): Promise<VerifiedPlaceCandidate[]> {
  const excluded = new Set(occupiedNames.map(normalizePlaceName))
  const specs: Array<{
    type: Exclude<VerifiedPlaceCandidate['type'], 'attraction'>
    query: string
    radius: number
  }> = [
    { type: 'cafe', query: 'specialty coffee bakery brunch Paris', radius: 12_000 },
    { type: 'restaurant', query: 'restaurant Paris', radius: 12_000 },
  ]
  const batches = await Promise.all(
    specs.map(async (spec) => {
      const rows = await searchNearbyGooglePlaceCandidates({
        textQuery: spec.query,
        location: { lat: hotel.lat, lng: hotel.lng },
        maxDistanceMeters: spec.radius,
        limit: 20,
      })
      return rows
        .filter((row) => row.id && !excluded.has(normalizePlaceName(row.name)))
        .map((row) => ({ ...row, type: spec.type }))
    }),
  )
  const seen = new Set<string>()
  return [...batches.flat(), ...attractionCandidatesFromTripadvisor(hotel)].filter(
    (row) => {
      const key = row.id || `${row.type}:${normalizePlaceName(row.name)}`
      if (seen.has(key) || excluded.has(normalizePlaceName(row.name))) return false
      seen.add(key)
      return true
    },
  )
}

/** One Google candidate pull per hotel/session; filter occupied names per day. */
export async function getSharedItineraryCandidates(
  hotel: SelectedHotel,
  occupiedNames: string[] = [],
): Promise<VerifiedPlaceCandidate[]> {
  const key = hotelCandidateKey(hotel)
  const now = Date.now()
  if (
    !sessionCandidateCache ||
    sessionCandidateCache.hotelKey !== key ||
    now - sessionCandidateCache.at > CANDIDATE_CACHE_TTL_MS
  ) {
    const candidates = await loadItineraryCandidates(hotel, [])
    sessionCandidateCache = { hotelKey: key, candidates, at: now }
  }
  const excluded = new Set(occupiedNames.map(normalizePlaceName))
  return sessionCandidateCache.candidates.filter(
    (row) => !excluded.has(normalizePlaceName(row.name)),
  )
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
    walkLevel: 'moderate',
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
      walkLevel: overnight?.walkLevel || 'minimal',
      duration: overnight?.duration || '过夜',
    },
  ]

  return {
    ...day,
    title: day.title.includes('迪士尼') ? day.title : '巴黎迪士尼',
    theme: day.theme || 'RER A 乐园日',
    pace: 'park',
    summary: day.summary || '今天只去迪士尼，不安排其他景点；园内玩够再回酒店。',
    stops,
  }
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
  options?: { forceDisneyDay?: number | null },
): DayPlan[] {
  const n = Math.max(1, dayCount)
  let next = days
    .filter((d) => d.day >= 1 && d.day <= n)
    .sort((a, b) => a.day - b.day)

  // Ensure contiguous day numbers 1..n
  const byDay = new Map(next.map((d) => [d.day, d]))
  const filled: DayPlan[] = []
  const en = getLocale() === 'en'
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
            title: en
              ? i === 1 ? 'Arrival in Paris' : i === n ? 'Departure' : `Day ${i}`
              : i === 1 ? '抵达巴黎' : i === n ? '返程' : `第 ${i} 天`,
            theme: en ? 'Free time' : '自由安排',
            pace: i === 1 || i === n ? 'relaxed' : 'moderate',
            summary: en
              ? 'Day still to be filled in.'
              : '今天行程待补全。',
            metroHintFromArea: blankMetroHints(),
            stops: [],
          },
    )
  }

  // Prefer forced penultimate Disney day; otherwise collapse whichever day chose Disney.
  const forcedDisneyDay =
    options?.forceDisneyDay != null &&
    options.forceDisneyDay >= 1 &&
    options.forceDisneyDay <= n
      ? options.forceDisneyDay
      : null
  let disneyIdx = forcedDisneyDay != null ? forcedDisneyDay - 1 : -1
  if (disneyIdx < 0) {
    disneyIdx = filled.findIndex(
      (day) =>
        day.pace === 'park' ||
        /迪士尼|disney/i.test(`${day.title} ${day.theme}`) ||
        day.stops.some((stop) => isDisneyStop(stop, places)),
    )
  }
  if (disneyIdx >= 0) {
    const d = filled[disneyIdx]
    filled[disneyIdx] = collapseDisneyStopsOnDay(
      {
        ...d,
        title: d.title.includes('迪士尼') ? d.title : '巴黎迪士尼',
        theme: d.theme || 'RER A 乐园日',
        pace: 'park',
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
      pace: 'relaxed',
      stops: [
        ...last.stops,
        {
          id: `d${n}-${CDG_PLACE_ID}-fix`,
          time: '按航班倒推',
          placeId: CDG_PLACE_ID,
          note: '国际航班建议起飞前 3–3.5 小时到 CDG；按返程时刻倒推离开酒店。',
          transport: 'RER B 或出租车',
          walkLevel: 'minimal',
          duration: '离境',
        },
      ],
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
  options?: { forceDisneyDay?: number | null },
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

  const forcedDisney =
    options?.forceDisneyDay != null && next.day === options.forceDisneyDay
  const choseDisney =
    forcedDisney ||
    next.pace === 'park' ||
    /迪士尼|disney/i.test(`${next.title} ${next.theme}`) ||
    next.stops.some((stop) => isDisneyStop(stop, places))

  if (forcedDisney || choseDisney) {
    // When a Disney day is forced (penultimate), always collapse onto that day.
    // If the model put Disney on the wrong day, strip it unless this is the forced day.
    if (
      options?.forceDisneyDay != null &&
      next.day !== options.forceDisneyDay
    ) {
      const filtered = next.stops.filter((s) => !isDisneyStop(s, places))
      if (filtered.length !== next.stops.length) {
        next = { ...next, stops: filtered }
      }
    } else {
      next = collapseDisneyStopsOnDay(
        {
          ...next,
          title: next.title.includes('迪士尼') ? next.title : '巴黎迪士尼',
          theme: next.theme || 'RER A 乐园日',
          pace: 'park',
          summary: next.summary || '今天只去迪士尼，不安排其他景点。',
        },
        places,
      )
    }
  } else {
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
      pace: next.pace || 'relaxed',
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
            walkLevel: 'minimal',
            duration: '离境',
          },
        ],
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

/** Instant Disney day — no LLM. Structure matches hard Disney rules. */
export function buildDisneyDayResult(input: {
  dayNumber: number
  dayCount: number
  existingDays: DayPlan[]
  existingCustomPlaces: Record<string, Place>
}): GeneratedItineraryResult {
  const customPlaces: Record<string, Place> = { ...input.existingCustomPlaces }
  if (catalogPlaces[DISNEY_PLACE_ID]) {
    customPlaces[DISNEY_PLACE_ID] = {
      ...catalogPlaces[DISNEY_PLACE_ID],
      ...customPlaces[DISNEY_PLACE_ID],
    }
  }
  const seeded: DayPlan = {
    day: input.dayNumber,
    title: '巴黎迪士尼',
    theme: 'RER A 乐园日',
    pace: 'park',
    summary: '今天只去迪士尼，不安排其他景点；园内玩够再回酒店。',
    metroHintFromArea: {
      custom: 'RER A 直达 Marne-la-Vallée–Chessy（约 45–60 分钟）。',
    },
    stops: [],
  }
  const newDay = collapseDisneyStopsOnDay(seeded, customPlaces)
  const byDay = new Map(input.existingDays.map((d) => [d.day, d]))
  byDay.set(input.dayNumber, newDay)
  const merged: DayPlan[] = []
  for (let i = 1; i <= input.dayCount; i++) {
    const existing = byDay.get(i)
    const en = getLocale() === 'en'
    merged.push(
      existing
        ? { ...existing, day: i }
        : {
            day: i,
            title: en ? `Day ${i}` : `第 ${i} 天`,
            theme: en ? 'Free time' : '自由安排',
            pace: 'moderate',
            summary: en ? 'Day still to be filled in.' : '今天行程待补全。',
            metroHintFromArea: blankMetroHints(),
            stops: [],
          },
    )
  }
  return { days: ensureDay1HotelFirst(merged), customPlaces }
}

/**
 * Regenerate one day: LLM draft → Google resolve → merge into existing plan.
 * Keeps other days intact; preserves generated fingerprint at the App layer.
 */
export async function buildGeneratedSingleDay(
  input: Omit<GenerateSingleDayItineraryInput, 'hotel' | 'verifiedCandidates'> & {
    hotel: SelectedHotel
    /** Display label for hotel area (e.g. 16区特罗卡德罗). */
    hotelAreaLabel?: string
    existingDays: DayPlan[]
    existingCustomPlaces: Record<string, Place>
    /** Shared candidate pool (skip per-day Google nearby). */
    verifiedCandidates?: VerifiedPlaceCandidate[]
    onDayPreview?: (preview: { day: number; title?: string; theme?: string }) => void
  },
): Promise<GeneratedItineraryResult> {
  const hotel = input.hotel
  const dayNumber = Math.max(1, Math.min(input.dayCount, input.dayNumber))
  const forceDisneyDay =
    input.recommendationPreferences.includeDisneyDay && input.dayCount >= 3
      ? input.dayCount - 1
      : null

  // Disney day: local template, no LLM.
  if (forceDisneyDay != null && dayNumber === forceDisneyDay) {
    return buildDisneyDayResult({
      dayNumber,
      dayCount: input.dayCount,
      existingDays: input.existingDays,
      existingCustomPlaces: input.existingCustomPlaces,
    })
  }

  const verifiedCandidates =
    input.verifiedCandidates && input.verifiedCandidates.length
      ? input.verifiedCandidates.filter(
          (row) =>
            !(input.occupiedPlaces || []).some(
              (p) => normalizePlaceName(p.name) === normalizePlaceName(row.name),
            ),
        )
      : await getSharedItineraryCandidates(
          hotel,
          (input.occupiedPlaces || []).map((place) => place.name),
        )
  if (!verifiedCandidates.length) {
    throw new Error(translate('errors.googleNoCandidates'))
  }
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
    signal: input.signal,
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
    recommendationPreferences: input.recommendationPreferences,
    verifiedCandidates,
    onDayPreview: input.onDayPreview,
  })

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
      transport: normalizeTransportChoice(s.transport),
      walkLevel: normalizeWalk(s.walkLevel) || 'short',
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

  newDay = softFixSingleDay(newDay, customPlaces, input.dayCount, {
    forceDisneyDay,
  })
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
    const en = getLocale() === 'en'
    merged.push(
      existing
        ? { ...existing, day: i }
        : {
            day: i,
            title: en ? `Day ${i}` : `第 ${i} 天`,
            theme: en ? 'Free time' : '自由安排',
            pace: 'moderate',
            summary: en ? 'Day still to be filled in.' : '今天行程待补全。',
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
  input: Omit<GenerateFullItineraryInput, 'hotel' | 'verifiedCandidates'> & {
    hotel: SelectedHotel & { area?: string }
  },
): Promise<GeneratedItineraryResult> {
  const hotel = input.hotel
  const verifiedCandidates = await loadItineraryCandidates(hotel)
  if (!verifiedCandidates.length) {
    throw new Error(translate('errors.googleNoCandidates'))
  }
  const draft = await generateFullItinerary({
    ...input,
    verifiedCandidates,
  })

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
        transport: normalizeTransportChoice(s.transport),
        walkLevel: normalizeWalk(s.walkLevel) || 'short',
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

  const forceDisneyDay =
    input.recommendationPreferences.includeDisneyDay && input.dayCount >= 3
      ? input.dayCount - 1
      : null
  const fixed = validateAndFixGeneratedDays(
    days,
    customPlaces,
    input.dayCount,
    { forceDisneyDay },
  )
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
