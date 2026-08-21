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

/** Pre-curated list of ultra-concise French travel preference tags (2-5 chars each, pure text) */
export const PRESET_PREFERENCE_TAGS: readonly string[] = [
  '晨间咖啡',
  '两顿正餐',
  '轻松少步行',
  '巴黎迪士尼',
  '凯旋门香街',
  '避开大展馆',
  '摄影出片',
  '艺术画廊',
  '法式烘焙',
  '塞纳河游船',
  '玛黑中古店',
  '在地市集',
  '铁塔夜景',
  '亲子友好',
  '平价美食',
]

export const DEFAULT_PREFERENCE_TAGS: readonly string[] = [
  '晨间咖啡',
  '两顿正餐',
  '轻松少步行',
  '凯旋门香街',
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

export function getTagTheme(tag: string): TagTheme {
  const t = cleanTagText(tag).toLowerCase()
  if (t.includes('咖啡') || t.includes('早餐')) return COLOR_PALETTES[0]
  if (t.includes('餐') || t.includes('吃') || t.includes('肉') || t.includes('面') || t.includes('生蚝') || t.includes('菜') || t.includes('美食')) return COLOR_PALETTES[1]
  if (t.includes('步') || t.includes('慢') || t.includes('轻松') || t.includes('避开')) return COLOR_PALETTES[2]
  if (t.includes('画') || t.includes('展') || t.includes('故居') || t.includes('文艺') || t.includes('艺术')) return COLOR_PALETTES[3]
  if (t.includes('甜') || t.includes('烘焙') || t.includes('面包')) return COLOR_PALETTES[4]
  if (t.includes('凯旋门') || t.includes('香街') || t.includes('地标')) return COLOR_PALETTES[5]
  if (t.includes('照') || t.includes('出片') || t.includes('夜景') || t.includes('铁塔') || t.includes('摄影')) return COLOR_PALETTES[6]
  if (t.includes('迪士尼') || t.includes('亲子') || t.includes('乐园') || t.includes('儿童')) return COLOR_PALETTES[7]
  if (t.includes('市集') || t.includes('中古') || t.includes('买手') || t.includes('购物')) return COLOR_PALETTES[8]
  if (t.includes('酒') || t.includes('船') || t.includes('塞纳河')) return COLOR_PALETTES[9]

  let hash = 0
  for (let i = 0; i < t.length; i++) hash = (hash << 5) - hash + t.charCodeAt(i)
  const index = Math.abs(hash) % COLOR_PALETTES.length
  return COLOR_PALETTES[index]
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
    // Backward compatibility: Derive tags from legacy boolean flags
    tags = []
    if (value?.preferCafeStart ?? true) tags.push('晨间咖啡')
    if (value?.preferLunchAndDinner ?? true) tags.push('两顿正餐')
    if (value?.preferLowWalking ?? true) tags.push('轻松少步行')
    if (value?.includeDisneyDay) tags.push('巴黎迪士尼')
    if (value?.includeChampsAndArc ?? true) tags.push('凯旋门香街')
    if (value?.avoidLouvreAndVersailles) tags.push('避开大展馆')
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
    preferLowWalking: hasTag((t) => t.includes('少步行') || t.includes('慢节奏') || t.includes('轻松')),
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
): string[] {
  const lines: string[] = [
    `通常约 ${prefs.dayStartTime} 开始当天行程`,
  ]

  if (prefs.tags && prefs.tags.length > 0) {
    lines.push(`【用户指定行程偏好标签池（必须严格遵守与结合）】：`)
    prefs.tags.forEach((tag, idx) => {
      lines.push(`${idx + 1}. ${tag}`)
    })
  } else {
    lines.push('用户未设置特殊偏好标签，按经典舒适节奏安排。')
  }

  if (prefs.extraNotes) {
    lines.push(`【用户补充要求】：${prefs.extraNotes}`)
  }

  return lines
}
