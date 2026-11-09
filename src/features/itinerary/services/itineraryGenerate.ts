import { samePlace, uniquePlaces } from '../../../shared/utils/placeIdentity'
import { openingAvailability, openingWindows, addCalendarDays } from '../../place/services/openingAvailability'
import { validateDayOpeningHours } from './validateOpeningHours'
import { openingCopy } from '../../../shared/i18n/copy/openingAvailability'
import { runtimeCopy } from '../../../shared/i18n/copy/itineraryGenerate-runtime-82b352'
import { localizedCopy } from '../../../shared/i18n/copy/itineraryGenerate-82b352'
import { rankVerifiedCandidates } from '../../../shared/services/llm/jev-ranking'
import { fastGenerationEnabled, generationTimer } from '../../../shared/services/generationPerformance'
import { runPool } from '../../../shared/services/asyncPool'
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
    location: item.location,
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
      runtimeCopy('me11a33debc', { p0: (draft.name), p1: (draft.area ? `，${draft.area}` : '') }),
    googleRating: google?.rating,
    googleUserRatingCount: google?.userRatingCount,
    googleAddress: google?.address || draft.googleAddress,
    ratingHint:
      ta?.rating != null
        ? `Tripadvisor ★ ${ta.rating.toFixed(1)}`
        : catalog?.ratingHint?.replace(/Google/i, 'Tripadvisor') ||
          runtimeCopy('m1121bc4cec', undefined),
    image: ta?.photos[0] || wikimediaPhoto?.url || catalog?.image || FALLBACK_IMAGE,
    location: loc,
    googleMapsUrl: mapsUrl(ta?.name || catalog?.nameLocal || `${draft.name} Paris`),
    durationHint: draft.durationHint || catalog?.durationHint || runtimeCopy('m1966ba1b9f', undefined),
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
      runtimeCopy('me11a33debc', { p0: (draft.name), p1: (draft.area ? `，${draft.area}` : '') }),
    googleRating: details?.rating,
    googleUserRatingCount: details?.userRatingCount,
    googleAddress: details?.address || draft.googleAddress,
    ratingHint:
      details?.rating != null
        ? `Google ★ ${details.rating.toFixed(1)}`
        : draft.ratingHint || runtimeCopy('me6cd927b2d', undefined),
    priceHint: details?.priceLevel,
    image: websitePhoto || FALLBACK_IMAGE,
    location: loc || {
      // Soft fallback near hotel so the map still works if Places misses.
      lat: hotel.lat + (Math.random() - 0.5) * 0.01,
      lng: hotel.lng + (Math.random() - 0.5) * 0.01,
    },
    googleMapsUrl: mapsUrl(details?.name || `${draft.name} Paris`),
    durationHint: draft.durationHint || runtimeCopy('m1966ba1b9f', undefined),
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
    type: VerifiedPlaceCandidate['type']
    query: string
    radius: number
  }> = [
    { type: 'attraction', query: 'tourist attractions museums Paris', radius: 20_000 },
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
  return [...batches.flat(), ...(batches[0].length ? [] : attractionCandidatesFromTripadvisor(hotel))].filter(
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
    custom: runtimeCopy('m2396819a03', undefined),
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
    note: runtimeCopy('m05363eb664', undefined),
    transport: runtimeCopy('m6814f3629f', undefined),
    walkLevel: 'moderate',
    duration: runtimeCopy('m79b62069f5', undefined),
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
      note: overnight?.note || runtimeCopy('mf9147a636c', undefined),
      transport: overnight?.transport || runtimeCopy('mbc4f5d0852', undefined),
      walkLevel: overnight?.walkLevel || 'minimal',
      duration: overnight?.duration || runtimeCopy('ma8cafdfc74', undefined),
    },
  ]

  return {
    ...day,
    title: day.title.includes('迪士尼') ? day.title : runtimeCopy('m26b07203b4', undefined),
    theme: day.theme || runtimeCopy('macb35fba12', undefined),
    pace: 'park',
    summary: day.summary || runtimeCopy('m73600e5f20', undefined),
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
              : i === 1 ? runtimeCopy('m5985017e99', undefined) : i === n ? runtimeCopy('m1172f4a8f5', undefined) : runtimeCopy('m98cd75602d', { p0: (i) }),
            theme: en ? localizedCopy('mc80f6ce28a', undefined, 'en') : localizedCopy('mc80f6ce28a', undefined, 'zh-CN'),
            pace: i === 1 || i === n ? 'relaxed' : 'moderate',
            summary: en
              ? localizedCopy('m8b4c1f5047', undefined, 'en')
              : localizedCopy('m8b4c1f5047', undefined, 'zh-CN'),
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
        title: d.title.includes('迪士尼') ? d.title : runtimeCopy('m26b07203b4', undefined),
        theme: d.theme || runtimeCopy('macb35fba12', undefined),
        pace: 'park',
        summary: d.summary || runtimeCopy('m6226fc9180', undefined),
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
      title: last.title || runtimeCopy('m1172f4a8f5', undefined),
      pace: 'relaxed',
      stops: [
        ...last.stops,
        {
          id: `d${n}-${CDG_PLACE_ID}-fix`,
          time: runtimeCopy('ma1c8cd8ef8', undefined),
          placeId: CDG_PLACE_ID,
          note: runtimeCopy('m618614f58c', undefined),
          transport: runtimeCopy('m15d63a7e94', undefined),
          walkLevel: 'minimal',
          duration: runtimeCopy('m3a1c2538bc', undefined),
        },
      ],
    }
  }

  // Day 1 hotel first + non-last days end at hotel + last-day hotel strip.
  return ensureDay1HotelFirst(filled)
}

export interface GeneratedItineraryResult {
  /** Explicitly started by the caller after publishing the usable route. */
  enrich?: () => Promise<Record<string, Place>>
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
          title: next.title.includes('迪士尼') ? next.title : runtimeCopy('m26b07203b4', undefined),
          theme: next.theme || runtimeCopy('macb35fba12', undefined),
          pace: 'park',
          summary: next.summary || runtimeCopy('m6226fc9180', undefined),
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
      title: next.title || runtimeCopy('m1172f4a8f5', undefined),
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
            time: runtimeCopy('ma1c8cd8ef8', undefined),
            placeId: CDG_PLACE_ID,
            note: runtimeCopy('m618614f58c', undefined),
            transport: runtimeCopy('m15d63a7e94', undefined),
            walkLevel: 'minimal',
            duration: runtimeCopy('m3a1c2538bc', undefined),
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
  const seen: Place[] = []
  const stops = day.stops.filter(stop => {
    if ([SELECTED_HOTEL_PLACE_ID, CDG_PLACE_ID].includes(stop.placeId)) return true
    const place = places[stop.placeId] || catalogPlaces[stop.placeId]
    if (!place) return false
    if (occupied.some(other => samePlace(place, other)) || seen.some(other => samePlace(place, other))) return false
    seen.push(place)
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
    title: runtimeCopy('m26b07203b4', undefined),
    theme: runtimeCopy('macb35fba12', undefined),
    pace: 'park',
    summary: runtimeCopy('m73600e5f20', undefined),
    metroHintFromArea: {
      custom: runtimeCopy('mb4c2a245a0', undefined),
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
            title: en ? localizedCopy('m284e918fd8', { p0: (i) }, 'en') : localizedCopy('m284e918fd8', { p0: (i) }, 'zh-CN'),
            theme: en ? localizedCopy('mc80f6ce28a', undefined, 'en') : localizedCopy('mc80f6ce28a', undefined, 'zh-CN'),
            pace: 'moderate',
            summary: en ? localizedCopy('m8b4c1f5047', undefined, 'en') : localizedCopy('m8b4c1f5047', undefined, 'zh-CN'),
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
    fast?: boolean
    /** Shared candidate pool (skip per-day Google nearby). */
    verifiedCandidates?: VerifiedPlaceCandidate[]
    onDayPreview?: (preview: { day: number; title?: string; theme?: string }) => void
  },
  availabilityRetry = 0,
): Promise<GeneratedItineraryResult> {
  const fast = input.fast ?? fastGenerationEnabled()
  const mark = generationTimer(`itinerary-day-${input.dayNumber}`, fast ? 'fast' : 'baseline')
  const hotel = input.hotel
  const dayNumber = Math.max(1, Math.min(input.dayCount, input.dayNumber))
  const forceDisneyDay =
    input.recommendationPreferences.includeDisneyDay && input.dayCount >= 3
      ? input.dayCount - 1
      : null

  const calendarDate = input.calendarDate || addCalendarDays(input.itineraryStartDate, dayNumber - 1)
  // Disney day: local template, no LLM.
  if (forceDisneyDay != null && dayNumber === forceDisneyDay) {
    const result = buildDisneyDayResult({
      dayNumber,
      dayCount: input.dayCount,
      existingDays: input.existingDays,
      existingCustomPlaces: input.existingCustomPlaces,
    })
    const disneyDay = result.days.find(day => day.day === dayNumber)!
    if ((await validateDayOpeningHours(disneyDay, calendarDate, result.customPlaces, [], input.signal)).length) throw new Error(openingCopy('conflict'))
    return result
  }

  let verifiedCandidates =
    input.verifiedCandidates !== undefined
      ? input.verifiedCandidates.filter(
          (row) =>
            !(input.occupiedPlaces || []).some(
              (p) => samePlace(p, row),
            ),
        )
      : await getSharedItineraryCandidates(
          hotel,
          (input.occupiedPlaces || []).map((place) => place.name),
        )
  // Google search includes periods in the same response. Resolve legacy/other-provider
  // candidates once, with bounded concurrency, before trusting them for a date.
  verifiedCandidates = await runPool(verifiedCandidates, 4, async row => {
    if (row.openingSchedule !== undefined) return row
    const details = await fetchGooglePlaceDetails(row.name, row.location, {
      placeId: row.id?.startsWith('ta-') ? undefined : row.id, recoverPhotos: false,
    }).catch(() => null)
    input.signal?.throwIfAborted()
    row.openingSchedule = details?.openingSchedule || {}
    return row
  })
  verifiedCandidates = uniquePlaces(verifiedCandidates).filter(row =>
    !(input.occupiedPlaces || []).some(p => samePlace(p, row)) &&
    openingAvailability(row.openingSchedule, calendarDate) !== 'closed')
  if (!verifiedCandidates.length) throw new Error(openingCopy('noCandidates'))
  const eligibleCandidates = verifiedCandidates
  mark('candidates')
  if (fast && availabilityRetry === 0) {
    const ranked = await rankVerifiedCandidates(verifiedCandidates, {
      day: dayNumber, calendarDate, hotel: { name: hotel.name, lat: hotel.lat, lng: hotel.lng },
      preferences: input.recommendationPreferences, explicitRequest: input.preferences, occupied: input.occupiedPlaces,
    }, input.signal)
    if (ranked) {
      const counts = { attraction: 0, cafe: 0, restaurant: 0 }
      verifiedCandidates = ranked.filter((row) => ++counts[row.type] <= (row.type === 'attraction' ? 12 : 6))
    }
    mark(ranked ? 'ranked' : 'rank-fallback')
  }
  const areaLabel =
    input.hotelAreaLabel || hotel.areaKey || undefined
  const draft = await generateSingleDayItinerary({
    openingRepair: input.openingRepair,
    compact: fast,
    destination: input.destination,
    dayCount: input.dayCount,
    dayNumber: input.dayNumber,
    calendarDate,
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

  mark('model-complete')
  input.signal?.throwIfAborted()
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

  const deferred: Array<{ row: FullItineraryPlaceDraft; id: string }> = []
  const byCandidateId = new Map(verifiedCandidates.map((row) => [row.id, row]))
  const settled = await Promise.allSettled(
    [...draftByKey.values()].map(async (row) => {
      const candidate = byCandidateId.get(row.googlePlaceId)
      const special = resolveSpecialPlaceId(row.key, row.name, row.type)
      if (fast && special && catalogPlaces[special] && special !== CDG_PLACE_ID && special !== DISNEY_PLACE_ID) {
        deferred.push({ row, id: special })
        return { key: row.key, id: special, place: { ...catalogPlaces[special], ...(candidate ? {
          name: candidate.name,
          location: candidate.location || catalogPlaces[special].location,
          googlePlaceId: candidate.id?.startsWith('ta-') ? undefined : candidate.id,
          tripadvisorContentId: candidate.id?.startsWith('ta-') ? candidate.id.slice(3) : undefined,
        } : {}) } }
      }
      if (fast && !special && candidate?.location && Number.isFinite(candidate.location.lat) && Number.isFinite(candidate.location.lng)) {
        const id = `gen-${slugKey(candidate.id || candidate.name)}`
        const place: Place = {
          id, name: candidate.name, type: candidate.type,
          googlePlaceId: candidate.id?.startsWith('ta-') ? undefined : candidate.id,
          tripadvisorContentId: candidate.id?.startsWith('ta-') ? candidate.id.slice(3) : undefined,
          description: row.description || '',
          location: candidate.location, image: FALLBACK_IMAGE,
          googleRating: candidate.rating, googleUserRatingCount: candidate.userRatingCount,
          googleAddress: candidate.address, priceHint: candidate.priceLevel,
          ratingHint: candidate.rating != null ? `Google ★ ${candidate.rating.toFixed(1)}` : '',
          googleMapsUrl: mapsUrl(candidate.name), durationHint: row.durationHint || '60 min',
        }
        deferred.push({ row, id })
        return { key: row.key, id, place }
      }
      const resolved = await resolveDraftPlace({ ...row, type: normalizeType(row.type) }, hotel)
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
      note: String(s.note || '').trim() || runtimeCopy('mb36f1f6772', undefined),
      transport: normalizeTransportChoice(s.transport),
      walkLevel: normalizeWalk(s.walkLevel) || 'short',
      duration: s.duration ? String(s.duration).trim() : undefined,
    }
  })

  let newDay: DayPlan = {
    day: dayNumber,
    title: String(draft.day.title || runtimeCopy('m98cd75602d', { p0: (dayNumber) })).trim().slice(0, 16),
    theme: String(draft.day.theme || '').trim() || runtimeCopy('me3c015188d', undefined),
    pace: normalizePace(draft.day.pace),
    summary: String(draft.day.summary || '').trim() || runtimeCopy('m0e4c137d43', undefined),
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

  const conflicts = await validateDayOpeningHours(newDay, calendarDate, customPlaces, verifiedCandidates, input.signal, true, input.recommendationPreferences.dayStartTime)
  if (conflicts.length) {
    if (import.meta.env.DEV) console.debug('[itinerary-hours] Replanning unavailable stops', calendarDate, conflicts.map(place => ({ name: place.name, stops: newDay.stops.filter(stop => stop.placeId === place.id).map(stop => ({ time: stop.time, duration: stop.duration })) })))
    if (availabilityRetry >= 1) throw new Error(openingCopy('conflict'))
    // One bounded repair: exclude conflicting venues, then validate the replacement again.
    return buildGeneratedSingleDay({ ...input,
      verifiedCandidates: eligibleCandidates.filter(row => !conflicts.some(place => samePlace(place, row))),
      openingRepair: { rejectedVisits: conflicts.flatMap(place => newDay.stops.filter(stop => stop.placeId === place.id).map(stop => ({
        name: place.name, time: stop.time, duration: stop.duration,
        openingWindows: openingWindows(eligibleCandidates.find(row => samePlace(place, row))?.openingSchedule, calendarDate),
      }))) },
    }, availabilityRetry + 1)
  }
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
            title: en ? localizedCopy('m284e918fd8', { p0: (i) }, 'en') : localizedCopy('m284e918fd8', { p0: (i) }, 'zh-CN'),
            theme: en ? localizedCopy('mc80f6ce28a', undefined, 'en') : localizedCopy('mc80f6ce28a', undefined, 'zh-CN'),
            pace: 'moderate',
            summary: en ? localizedCopy('m8b4c1f5047', undefined, 'en') : localizedCopy('m8b4c1f5047', undefined, 'zh-CN'),
            metroHintFromArea: blankMetroHints(),
            stops: [],
          },
    )
  }

  // Hotel pin helpers: Day 1 check-in first; non-last end at hotel; last day hotel stripped.
  const fixed = ensureDay1HotelFirst(merged)
  mark('first-usable')
  return { days: fixed, customPlaces, enrich: deferred.length ? async () => {
    const enriched: Record<string, Place> = {}
    await runPool(deferred, 3, async ({ row, id }) => {
      input.signal?.throwIfAborted()
      try {
        const resolved = await resolveDraftPlace(row, hotel)
        input.signal?.throwIfAborted()
        const original = customPlaces[id]
        if (resolved.place && samePlace(original, resolved.place)) enriched[id] = {
          ...resolved.place, id, name: original.name, type: original.type, location: original.location,
          ...(original.googlePlaceId ? { googlePlaceId: original.googlePlaceId } : {}),
          ...(original.tripadvisorContentId ? { tripadvisorContentId: original.tripadvisorContentId } : {}),
        }
      } catch { input.signal?.throwIfAborted() }
    })
    mark('complete-enriched')
    return enriched
  } : undefined }

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
        note: String(s.note || '').trim() || runtimeCopy('mb36f1f6772', undefined),
        transport: normalizeTransportChoice(s.transport),
        walkLevel: normalizeWalk(s.walkLevel) || 'short',
        duration: s.duration ? String(s.duration).trim() : undefined,
      }
    })

    return {
      day: d.day,
      title: String(d.title || runtimeCopy('m98cd75602d', { p0: (d.day) })).trim().slice(0, 16),
      theme: String(d.theme || '').trim() || runtimeCopy('me3c015188d', undefined),
      pace: normalizePace(d.pace),
      summary: String(d.summary || '').trim() || runtimeCopy('m0e4c137d43', undefined),
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
  const conflicts = await Promise.all(fixed.map(day => validateDayOpeningHours(day,
    addCalendarDays(input.itineraryStartDate, day.day - 1), customPlaces, verifiedCandidates)))
  if (conflicts.some(rows => rows.length)) throw new Error(openingCopy('conflict'))
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
