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

/** Pre-curated list of French travel preference tags */
export const PRESET_PREFERENCE_TAGS: readonly string[] = [
  '☕ 咖啡馆与早餐开场',
  '🍽️ 每日两顿正餐',
  '🚶 慢节奏少步行',
  '🏰 安排巴黎迪士尼全日',
  '🏛️ 香榭丽舍与凯旋门同日',
  '🌿 避开大型博物馆(卢浮宫/凡尔赛)',
  '📸 绝佳摄影与出片机位',
  '🎨 印象派与艺术馆巡礼',
  '🥐 巴黎小众法式烘焙甜点',
  '🍷 塞纳河落日游船巡航',
  '🛍️ 玛黑区中古与独立买手店',
  '🥖 深入在地生活市集',
  '🗼 埃菲尔铁塔夜景观景',
  '👶 亲子家庭友好节奏',
  '💰 经济实惠高性价比美食',
]

export const DEFAULT_PREFERENCE_TAGS: readonly string[] = [
  '☕ 咖啡馆与早餐开场',
  '🍽️ 每日两顿正餐',
  '🚶 慢节奏少步行',
  '🏛️ 香榭丽舍与凯旋门同日',
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
          .map((t) => String(t || '').trim())
          .filter(Boolean),
      ),
    )
  } else {
    // Backward compatibility: Derive tags from legacy boolean flags
    tags = []
    if (value?.preferCafeStart ?? true) tags.push('☕ 咖啡馆与早餐开场')
    if (value?.preferLunchAndDinner ?? true) tags.push('🍽️ 每日两顿正餐')
    if (value?.preferLowWalking ?? true) tags.push('🚶 慢节奏少步行')
    if (value?.includeDisneyDay) tags.push('🏰 安排巴黎迪士尼全日')
    if (value?.includeChampsAndArc ?? true) tags.push('🏛️ 香榭丽舍与凯旋门同日')
    if (value?.avoidLouvreAndVersailles) tags.push('🌿 避开大型博物馆(卢浮宫/凡尔赛)')
    if (tags.length === 0) tags = [...DEFAULT_PREFERENCE_TAGS]
  }

  // Derive legacy booleans from tags for backwards-compatible consumers
  const hasTag = (predicate: (t: string) => boolean) => tags.some(predicate)

  return {
    dayStartTime: normalizeTime(value?.dayStartTime),
    tags,
    preferCafeStart: hasTag((t) => t.includes('咖啡馆') || t.includes('早餐')),
    preferLunchAndDinner: hasTag((t) => t.includes('正餐') || t.includes('午餐')),
    includeDisneyDay: hasTag((t) => t.includes('迪士尼')),
    includeChampsAndArc: hasTag((t) => t.includes('香榭丽舍') || t.includes('凯旋门')),
    avoidLouvreAndVersailles: hasTag((t) => t.includes('避开') && (t.includes('卢浮宫') || t.includes('凡尔赛') || t.includes('博物馆'))),
    preferLowWalking: hasTag((t) => t.includes('少步行') || t.includes('慢节奏')),
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
