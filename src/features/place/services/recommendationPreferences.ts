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
