import { LEGACY_PREF_TAG_MAP, localizePrefTag } from '../../../shared/i18n/localeEnum'
import { getLocale, type Locale } from '../../../shared/i18n'

const STORAGE_KEY = 'paris-tour-recommendation-preferences-v1'

export interface RecommendationPreferences {
  dayStartTime: string
  tags: string[]
  preferCafeStart?: boolean
  preferLunchAndDinner?: boolean
  includeDisneyDay?: boolean
  includeChampsAndArc?: boolean
  avoidLouvreAndVersailles?: boolean
  preferLowWalking?: boolean
  extraNotes?: string
}

/** Helper to thoroughly strip any emoji / symbol from tag text */
export function cleanTagText(tag: string): string {
  return String(tag || '')
    .replace(/^[\p{Extended_Pictographic}\uFE0F\u200D\s·•✨☕🍽️🚶🏰🏛️🌿📸🎨🥐🍷🛍️🥖🗼👶💰\-\+\*]+/gu, '')
    .replace(/[\p{Extended_Pictographic}\uFE0F\u200D]+/gu, '')
    .trim()
}

/** Pre-curated list of ultra-concise French travel preference tags (codes; localized at display) */
export const PRESET_PREFERENCE_TAGS: readonly string[] = [
  'morningCoffee',
  'twoMeals',
  'easyWalking',
  'disney',
  'champsArc',
  'avoidLargeMuseums',
  'photography',
  'artGalleries',
  'frenchBakery',
  'seineCruise',
  'maraisVintage',
  'localMarkets',
  'eiffelNight',
  'familyFriendly',
  'affordableFood',
]

export const DEFAULT_PREFERENCE_TAGS: readonly string[] = [
  'morningCoffee',
  'twoMeals',
  'easyWalking',
  'champsArc',
]

export const DEFAULT_RECOMMENDATION_PREFERENCES: RecommendationPreferences = {
  dayStartTime: '10:00',
  tags: [...DEFAULT_PREFERENCE_TAGS],
  preferCafeStart: true,
  preferLunchAndDinner: true,
  includeDisneyDay: false,
  includeChampsAndArc: true,
  avoidLouvreAndVersailles: false,
  preferLowWalking: true,
  extraNotes: '',
}

export interface TagTheme {
  activePill: string
  suggestedPill: string
}

export const COLOR_PALETTES: readonly TagTheme[] = [
  {
    // 0. Amber / Morning Cafe
    activePill: 'bg-amber-500/22 border-amber-300/80 text-amber-950 dark:bg-amber-500/15 dark:border-amber-400/30 dark:text-amber-200 hover:bg-amber-500/30',
    suggestedPill: 'bg-amber-500/12 border-amber-300/60 text-amber-950/85 dark:bg-amber-500/10 dark:border-amber-400/20 dark:text-amber-300/80 hover:bg-amber-500/22 hover:border-amber-400',
  },
  {
    // 1. Terracotta / Dining & Meat
    activePill: 'bg-orange-500/22 border-orange-300/80 text-orange-950 dark:bg-orange-500/15 dark:border-orange-400/30 dark:text-orange-200 hover:bg-orange-500/30',
    suggestedPill: 'bg-orange-500/12 border-orange-300/60 text-orange-950/85 dark:bg-orange-500/10 dark:border-orange-400/20 dark:text-orange-300/80 hover:bg-orange-500/22 hover:border-orange-400',
  },
  {
    // 2. Sage Botanical Green / Walking & Nature
    activePill: 'bg-emerald-600/22 border-emerald-300/80 text-emerald-950 dark:bg-emerald-600/15 dark:border-emerald-400/30 dark:text-emerald-200 hover:bg-emerald-600/30',
    suggestedPill: 'bg-emerald-600/12 border-emerald-300/60 text-emerald-950/85 dark:bg-emerald-600/10 dark:border-emerald-400/20 dark:text-emerald-300/80 hover:bg-emerald-600/22 hover:border-emerald-400',
  },
  {
    // 3. Artsy Indigo / Gallery & Museum
    activePill: 'bg-indigo-500/22 border-indigo-300/80 text-indigo-950 dark:bg-indigo-500/15 dark:border-indigo-400/30 dark:text-indigo-200 hover:bg-indigo-500/30',
    suggestedPill: 'bg-indigo-500/12 border-indigo-300/60 text-indigo-950/85 dark:bg-indigo-500/10 dark:border-indigo-400/20 dark:text-indigo-300/80 hover:bg-indigo-500/22 hover:border-indigo-400',
  },
  {
    // 4. Rose / French Bakery & Sweets
    activePill: 'bg-rose-500/22 border-rose-300/80 text-rose-950 dark:bg-rose-500/15 dark:border-rose-400/30 dark:text-rose-200 hover:bg-rose-500/30',
    suggestedPill: 'bg-rose-500/12 border-rose-300/60 text-rose-950/85 dark:bg-rose-500/10 dark:border-rose-400/20 dark:text-rose-300/80 hover:bg-rose-500/22 hover:border-rose-400',
  },
  {
    // 5. Seine River Teal / Landmarks
    activePill: 'bg-teal-600/22 border-teal-300/80 text-teal-950 dark:bg-teal-600/15 dark:border-teal-400/30 dark:text-teal-200 hover:bg-teal-600/30',
    suggestedPill: 'bg-teal-600/12 border-teal-300/60 text-teal-950/85 dark:bg-teal-600/10 dark:border-teal-400/20 dark:text-teal-300/80 hover:bg-teal-600/22 hover:border-teal-400',
  },
  {
    // 6. Sky Blue / Photo & Tower Night
    activePill: 'bg-sky-500/22 border-sky-300/80 text-sky-950 dark:bg-sky-500/15 dark:border-sky-400/30 dark:text-sky-200 hover:bg-sky-500/30',
    suggestedPill: 'bg-sky-500/12 border-sky-300/60 text-sky-950/85 dark:bg-sky-500/10 dark:border-sky-400/20 dark:text-sky-300/80 hover:bg-sky-500/22 hover:border-sky-400',
  },
  {
    // 7. Fairy Purple / Disney & Kids
    activePill: 'bg-purple-500/22 border-purple-300/80 text-purple-950 dark:bg-purple-500/15 dark:border-purple-400/30 dark:text-purple-200 hover:bg-purple-500/30',
    suggestedPill: 'bg-purple-500/12 border-purple-300/60 text-purple-950/85 dark:bg-purple-500/10 dark:border-purple-400/20 dark:text-purple-300/80 hover:bg-purple-500/22 hover:border-purple-400',
  },
  {
    // 8. Vintage Gold Ochre / Marais & Vintage Market
    activePill: 'bg-amber-600/22 border-amber-300/80 text-amber-950 dark:bg-amber-600/15 dark:border-amber-400/30 dark:text-amber-200 hover:bg-amber-600/30',
    suggestedPill: 'bg-amber-600/12 border-amber-300/60 text-amber-950/85 dark:bg-amber-600/10 dark:border-amber-400/20 dark:text-amber-300/80 hover:bg-amber-600/22 hover:border-amber-400',
  },
  {
    // 9. Wine Burgundy / Seine Sunset Cruise
    activePill: 'bg-red-500/22 border-red-300/80 text-red-950 dark:bg-red-500/15 dark:border-red-400/30 dark:text-red-200 hover:bg-red-500/30',
    suggestedPill: 'bg-red-500/12 border-red-300/60 text-red-950/85 dark:bg-red-500/10 dark:border-red-400/20 dark:text-red-300/80 hover:bg-red-500/22 hover:border-red-400',
  },
]

export const BASE_TAG_PILL =
  "group relative isolate overflow-hidden inline-flex h-7.5 items-center px-3.5 text-xs font-semibold leading-none rounded-full border shadow-[0_2px_8px_rgba(0,0,0,0.04),inset_0_1px_1.5px_rgba(255,255,255,1),inset_0_-1px_1px_rgba(255,255,255,0.65)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.3),inset_0_1px_1.5px_rgba(255,255,255,0.08)] backdrop-blur-md backdrop-saturate-[180%] before:pointer-events-none before:absolute before:inset-x-2 before:top-0 before:h-[1px] before:rounded-full before:bg-gradient-to-r before:from-transparent before:via-white dark:before:via-white/20 before:to-transparent before:content-[''] transition-all cursor-pointer select-none"

function tagCode(rawTag: string): string {
  // Convert legacy Chinese → code so the theme function works for both
  // pre-existing localStorage data and the new code-based constants.
  const cleaned = cleanTagText(rawTag)
  return LEGACY_PREF_TAG_MAP[cleaned] ?? cleaned
}

export function getTagTheme(tag: string): TagTheme {
  const code = tagCode(tag)
  switch (code) {
    case 'morningCoffee':
      return COLOR_PALETTES[0]
    case 'twoMeals':
    case 'affordableFood':
      return COLOR_PALETTES[1]
    case 'easyWalking':
    case 'avoidLargeMuseums':
      return COLOR_PALETTES[2]
    case 'photography':
    case 'eiffelNight':
      return COLOR_PALETTES[6]
    case 'artGalleries':
      return COLOR_PALETTES[3]
    case 'frenchBakery':
      return COLOR_PALETTES[4]
    case 'champsArc':
      return COLOR_PALETTES[5]
    case 'disney':
    case 'familyFriendly':
      return COLOR_PALETTES[7]
    case 'maraisVintage':
    case 'localMarkets':
      return COLOR_PALETTES[8]
    case 'seineCruise':
      return COLOR_PALETTES[9]
    default: {
      let hash = 0
      for (let i = 0; i < code.length; i++) hash = (hash << 5) - hash + code.charCodeAt(i)
      const index = Math.abs(hash) % COLOR_PALETTES.length
      return COLOR_PALETTES[index]
    }
  }
}

function normalizeTime(value: unknown): string {
  const text = String(value || '').trim()
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(text)
    ? text
    : DEFAULT_RECOMMENDATION_PREFERENCES.dayStartTime
}

export function normalizeRecommendationPreferences(
  value: Partial<RecommendationPreferences> | null | undefined,
): RecommendationPreferences {
  let tags: string[]

  if (Array.isArray(value?.tags)) {
    tags = Array.from(
      new Set(
        value.tags
          .map((t) => cleanTagText(t))
          .filter(Boolean),
      ),
    )
  } else {
    // Backward compatibility: Derive tags from legacy boolean flags.
    // Output uses the new code-based enum; the UI localizes via
    // `localizePrefTag` and accepts legacy Chinese values via
    // `LEGACY_PREF_TAG_MAP` for pre-refactor localStorage data.
    tags = []
    if (value?.preferCafeStart ?? true) tags.push('morningCoffee')
    if (value?.preferLunchAndDinner ?? true) tags.push('twoMeals')
    if (value?.preferLowWalking ?? true) tags.push('easyWalking')
    if (value?.includeDisneyDay) tags.push('disney')
    if (value?.includeChampsAndArc ?? true) tags.push('champsArc')
    if (value?.avoidLouvreAndVersailles) tags.push('avoidLargeMuseums')
    if (tags.length === 0) tags = [...DEFAULT_PREFERENCE_TAGS]
  }

  // Derive legacy booleans from tags for backwards-compatible consumers
  const hasTag = (predicate: (t: string) => boolean) => tags.some(predicate)

  return {
    dayStartTime: normalizeTime(value?.dayStartTime),
    tags,
    preferCafeStart: hasTag((t) => t.includes('咖啡') || t.includes('早餐')),
    preferLunchAndDinner: hasTag((t) => t.includes('正餐') || t.includes('午餐') || t.includes('晚餐')),
    includeDisneyDay: hasTag((t) => t.includes('迪士尼')),
    includeChampsAndArc: hasTag((t) => t.includes('香街') || t.includes('香榭丽舍') || t.includes('凯旋门')),
    avoidLouvreAndVersailles: hasTag((t) => t.includes('避开') || t.includes('卢浮宫') || t.includes('凡尔赛') || t.includes('展馆')),
    preferLowWalking: hasTag((t) => t.includes('少步行') || t.includes('慢节奏') || t.includes('relaxed')),
    extraNotes: String(value?.extraNotes || '').trim().slice(0, 800),
  }
}

export function loadRecommendationPreferences(): RecommendationPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_RECOMMENDATION_PREFERENCES }
    return normalizeRecommendationPreferences(
      JSON.parse(raw) as Partial<RecommendationPreferences>,
    )
  } catch {
    return { ...DEFAULT_RECOMMENDATION_PREFERENCES }
  }
}

export function saveRecommendationPreferences(
  value: RecommendationPreferences,
): RecommendationPreferences {
  const normalized = normalizeRecommendationPreferences(value)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
  } catch {
    /* ignore private mode / quota */
  }
  return normalized
}

export function clearRecommendationPreferences() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

export function recommendationPreferencesPrompt(
  prefs: RecommendationPreferences,
  options?: { locale?: Locale },
): string[] {
  const locale: Locale = options?.locale ?? (typeof getLocale === 'function' ? getLocale() : 'zh-CN')
  const isEn = locale === 'en'
  const lines: string[] = isEn
    ? [`Trips usually start around ${prefs.dayStartTime}.`]
    : [`通常约 ${prefs.dayStartTime} 开始当天行程`]

  if (prefs.tags && prefs.tags.length > 0) {
    if (isEn) {
      lines.push('[User-specified itinerary preference tags (must follow strictly)]:')
    } else {
      lines.push('【用户指定行程偏好标签池（必须严格遵守与结合）】：')
    }
    // For EN mode, present each tag localized so the LLM reads the chip text
    // it would actually display. Legacy Chinese values pass through verbatim.
    prefs.tags.forEach((tag, idx) => {
      const display = isEn ? localizePrefTag(tag, locale) : tag
      lines.push(`${idx + 1}. ${display}`)
    })
  } else {
    lines.push(
      isEn
        ? 'No custom preference tags set; plan at a classic comfortable pace.'
        : '用户未设置特殊偏好标签，按经典舒适节奏安排。',
    )
  }

  if (prefs.extraNotes) {
    if (isEn) {
      lines.push(`[User additional notes]: ${prefs.extraNotes}`)
    } else {
      lines.push(`【用户补充要求】：${prefs.extraNotes}`)
    }
  }

  return lines
}
