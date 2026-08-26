/**
 * Helpers + constants extracted from App.tsx during stage 3.3.
 *
 * These are pure (or near-pure) helpers that App.tsx uses for initial
 * state computation, hero copy, and area label rewriting. They have no
 * React dependency and can be unit-tested in isolation.
 */
export { isHotelSelected } from './features/hotel/constants/hotels'
export { dateForTripDay } from './features/itinerary/services/tripDates'
import { translate } from './shared/i18n'
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

export const ITINERARY_LOADING_LINE_KEYS = [
  'hero.loadingLine1',
  'hero.loadingLine2',
  'hero.loadingLine3',
  'hero.loadingLine4',
  'hero.loadingLine5',
  'hero.loadingLine6',
  'hero.loadingLine7',
  'hero.loadingLine8',
  'hero.loadingLine9',
  'hero.loadingLine10',
] as const

/**
 * Locale-aware generating line rotator. Each line is a dictionary key
 * (under `hero.loadingLineN`) so additions are 1 row in types.ts and
 * 1 row in en.ts / zh-CN.ts.
 */
export function getItineraryGeneratingLines(
  locale: Locale = getLocale(),
): readonly string[] {
  return ITINERARY_LOADING_LINE_KEYS.map((key) => translate(key, undefined, locale))
}

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

export function placeOccurrenceAt(
  stops: readonly ItineraryStop[],
  index: number,
): number {
  const placeId = stops[index]?.placeId
  if (!placeId) return 0
  let occurrence = 0
  for (let i = 0; i < index; i += 1) {
    if (stops[i]?.placeId === placeId) occurrence += 1
  }
  return occurrence
}

/**
 * Prefer an existing durable stop.id. When minting, use place-occurrence ids
 * (`d2-louvre-occ0`) so sibling deletes/reorders do not rename other stops.
 * Pass `dayStops` whenever minting so duplicates (hotel check-in / overnight)
 * get distinct occ suffixes. Without `dayStops`, falls back to the legacy
 * index suffix for backward compatibility.
 */
export function ensureStopId(
  day: number,
  stop: ItineraryStop,
  index: number,
  dayStops?: readonly ItineraryStop[],
): string {
  if (stop.id) return stop.id
  if (dayStops) {
    return `d${day}-${stop.placeId}-occ${placeOccurrenceAt(dayStops, index)}`
  }
  return `d${day}-${stop.placeId}-${index}`
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

export function seasonEyebrow(
  startDate?: string | null,
  destination?: string,
  locale: Locale = getLocale(),
): string {
  const dest = destination?.trim()
  const t = (key: string, params?: Record<string, string | number>) =>
    translate(key as Parameters<typeof translate>[0], params, locale)
  if (!startDate) {
    return dest ? t('hero.eyebrowWithDest', { dest }) : t('hero.eyebrowNextEscape')
  }
  const month = new Date(`${startDate}T12:00:00`).getMonth() + 1
  if (Number.isNaN(month)) {
    return dest ? t('hero.eyebrowWithDest', { dest }) : t('hero.eyebrowNextEscape')
  }
  if (month >= 3 && month <= 5) {
    return dest
      ? t('hero.eyebrowSpring', { dest })
      : t('hero.eyebrowSpringNoDest')
  }
  if (month >= 6 && month <= 8) {
    return dest
      ? t('hero.eyebrowSummer', { dest })
      : t('hero.eyebrowSummerNoDest')
  }
  if (month >= 9 && month <= 11) {
    return dest
      ? t('hero.eyebrowAutumn', { dest })
      : t('hero.eyebrowAutumnNoDest')
  }
  return dest
    ? t('hero.eyebrowWinter', { dest })
    : t('hero.eyebrowWinterNoDest')
}

import { getLocale, type Locale } from './shared/i18n'
import { tripCityFromDestination } from './features/destination/services/tripCity'

export function destinationLabel(destination: string, locale: Locale = getLocale()): string {
  const trimmed = destination.trim()
  if (locale === 'en') {
    if (trimmed) {
      return tripCityFromDestination(trimmed).nameEn
    }
    return translate('hero.destinationEmpty', undefined, locale)
  }
  return trimmed || translate('hero.destinationEmpty', undefined, locale)
}

/**
 * Locale-aware day count label.
 * ZH: Chinese numeral + 「天」 (e.g. 1 → 「一天」, 5 → 「五天」).
 * EN: Arabic digit + " " + day/days (e.g. 1 → "1 day", 5 → "5 days").
 */
export function dayCountLabel(n: number, locale: Locale = getLocale()): string {
  if (locale === 'en') return `${n} ${n === 1 ? 'day' : 'days'}`
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

/**
 * Parallel English names for the same 6 area keys, used when the active
 * locale is `en`. Kept side-by-side with `AREA_KEY_CN` so any other locale
 * in the future can add its own map.
 */
export const AREA_KEY_EN: Record<string, string> = {
  marais: 'Marais',
  opera: 'Opéra',
  boulevards: ' Grands Boulevards',
  saintGermain: 'Saint-Germain',
  latin: 'Latin Quarter',
  trocadero: 'Trocadéro',
}

/**
 * Resolve a short area label for a hotel, switching by active locale.
 * Returns `null` when the hotel has no areaKey (caller decides what to
 * show — usually the bare hotel name).
 */
export function hotelAreaShort(
  hotel: SelectedHotel,
  locale: Locale = getLocale(),
): string | null {
  if (!hotel.areaKey) return null
  const map = locale === 'en' ? AREA_KEY_EN : AREA_KEY_CN
  const label = map[hotel.areaKey]
  if (label) return label.trim()
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

export function itineraryMissingLabels(
  input: {
    datesReady: boolean
    outboundReady: boolean
    returnReady: boolean
    hotelReady: boolean
  },
  locale: Locale = getLocale(),
): string[] {
  const missing: string[] = []
  if (!input.datesReady) missing.push(translate('hero.missingDates', undefined, locale))
  if (!input.outboundReady) missing.push(translate('hero.missingOutbound', undefined, locale))
  if (!input.returnReady) missing.push(translate('hero.missingReturn', undefined, locale))
  if (!input.hotelReady) missing.push(translate('hero.missingHotel', undefined, locale))
  return missing
}

export function buildHeroCopy(
  destination: string,
  tripDates: TripDateRange | null,
  hotel: SelectedHotel,
  days: DayPlan[],
  locale: Locale = getLocale(),
): { eyebrow: string; title: string; blurb: string; tags: string[] } {
  const t = (key: string, params?: Record<string, string | number>) =>
    translate(key as Parameters<typeof translate>[0], params, locale)
  const hotelOn = isHotelSelected(hotel)
  const planDays = Math.max(1, days.length || 1)
  // Header duration = calendar span of selected dates (not itinerary days after flight lag).
  const tripDayCount = tripDates
    ? daysBetween(tripDates.startDate, tripDates.endDate) || planDays
    : planDays
  const durationLabel = dayCountLabel(tripDayCount, locale)
  const dest = destination.trim()
  const destLabel = destinationLabel(destination, locale)
  const area = hotelOn ? hotelAreaShort(hotel, locale) : null
  const hotelPhrase = hotelOn
    ? area
      ? t('hero.hotelInArea', { name: hotel.name, area })
      : hotel.name
    : null

  const eyebrow = seasonEyebrow(tripDates?.startDate, dest, locale)
  const title = tripDates
    ? t('hero.titleWithDest', {
        dest: dest || t('hero.titleTrip'),
        duration: durationLabel,
      })
    : dest
      ? t('hero.titleDestOnly', { dest })
      : t('hero.titleWhereToNext')

  const tags: string[] = []
  if (tripDates) {
    tags.push(
      `${formatTripDayLabel(tripDates.startDate)} – ${formatTripDayLabel(tripDates.endDate)}`,
    )
  } else {
    tags.push(t('hero.tagsDatesPending'))
  }
  tags.push(t('hero.tagsMetroWalking'))
  const themes = itineraryThemeTags(days)
  if (themes.length) tags.push(themes.join(' · '))
  if (hotelOn && area) {
    tags.push(t('hero.tagsStayIn', { area }))
  } else if (hotelOn) {
    tags.push(t('hero.tagsHotelConfirmed'))
  } else {
    tags.push(t('hero.tagsHotelPending'))
  }

  const dateRangeLabel =
    tripDates
      ? `${formatTripDayLabel(tripDates.startDate)}–${formatTripDayLabel(tripDates.endDate)}`
      : ''

  const planDaysLabel = dayCountLabel(planDays, locale)
  const themeList = themes.join(', ')
  const themeListZh = themes.join('、')

  let blurb: string
  if (tripDates && hotelPhrase) {
    if (dest) {
      blurb = t('hero.blurbDatesHotelWithDest', {
        dest: destLabel,
        dates: dateRangeLabel,
        duration: durationLabel,
        hotel: hotelPhrase,
      })
    } else {
      blurb = t('hero.blurbDatesHotelNoDest', {
        dates: dateRangeLabel,
        duration: durationLabel,
        hotel: hotelPhrase,
      })
    }
  } else if (tripDates) {
    if (dest) {
      blurb = t('hero.blurbDatesWithDest', {
        dest: destLabel,
        dates: dateRangeLabel,
        duration: durationLabel,
      })
    } else {
      blurb = t('hero.blurbDatesNoDest', {
        dates: dateRangeLabel,
        duration: durationLabel,
      })
    }
  } else if (hotelPhrase) {
    const themeKey = themes.length > 0 ? 'hero.blurbThemeWithThemes' : 'hero.blurbThemeNoThemes'
    const themeParams =
      themes.length > 0
        ? locale === 'en'
          ? { themes: themeList }
          : { themes: themeListZh }
        : undefined
    const themeHint = t(themeKey, themeParams)
    if (dest) {
      blurb = t('hero.blurbHotelWithDest', {
        dest: destLabel,
        hotel: hotelPhrase,
        theme: themeHint,
      })
    } else {
      blurb = t('hero.blurbHotelNoDest', {
        hotel: hotelPhrase,
        theme: themeHint,
      })
    }
  } else if (dest) {
    blurb = t('hero.blurbJustDest', {
      dest: destLabel,
      duration: planDaysLabel,
    })
  } else {
    blurb = t('hero.blurbEmpty')
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
