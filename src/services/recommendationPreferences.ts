const STORAGE_KEY = 'paris-tour-recommendation-preferences-v1'

export interface RecommendationPreferences {
  dayStartTime: string
  preferCafeStart: boolean
  preferLunchAndDinner: boolean
  includeDisneyDay: boolean
  includeChampsAndArc: boolean
  avoidLouvreAndVersailles: boolean
  preferLowWalking: boolean
  extraNotes: string
}

export const DEFAULT_RECOMMENDATION_PREFERENCES: RecommendationPreferences = {
  dayStartTime: '10:00',
  preferCafeStart: true,
  preferLunchAndDinner: true,
  includeDisneyDay: true,
  includeChampsAndArc: true,
  avoidLouvreAndVersailles: true,
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
  const base = DEFAULT_RECOMMENDATION_PREFERENCES
  return {
    dayStartTime: normalizeTime(value?.dayStartTime),
    preferCafeStart:
      typeof value?.preferCafeStart === 'boolean'
        ? value.preferCafeStart
        : base.preferCafeStart,
    preferLunchAndDinner:
      typeof value?.preferLunchAndDinner === 'boolean'
        ? value.preferLunchAndDinner
        : base.preferLunchAndDinner,
    includeDisneyDay:
      typeof value?.includeDisneyDay === 'boolean'
        ? value.includeDisneyDay
        : base.includeDisneyDay,
    includeChampsAndArc:
      typeof value?.includeChampsAndArc === 'boolean'
        ? value.includeChampsAndArc
        : base.includeChampsAndArc,
    avoidLouvreAndVersailles:
      typeof value?.avoidLouvreAndVersailles === 'boolean'
        ? value.avoidLouvreAndVersailles
        : base.avoidLouvreAndVersailles,
    preferLowWalking:
      typeof value?.preferLowWalking === 'boolean'
        ? value.preferLowWalking
        : base.preferLowWalking,
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
  const lines = [
    `通常约 ${prefs.dayStartTime} 开始当天行程`,
    prefs.preferCafeStart
      ? '普通游览日优先以咖啡馆/烘焙店开始'
      : '不要求以咖啡馆开始',
    prefs.preferLunchAndDinner
      ? '时间允许时优先安排午餐和晚餐'
      : '餐饮站按当天节奏灵活安排',
    prefs.includeDisneyDay
      ? '行程天数允许时安排一天巴黎迪士尼'
      : '不主动安排巴黎迪士尼',
    prefs.includeChampsAndArc
      ? '优先包含香榭丽舍大街与凯旋门'
      : '不强制包含香榭丽舍大街与凯旋门',
    prefs.avoidLouvreAndVersailles
      ? '默认避开卢浮宫和凡尔赛'
      : '卢浮宫和凡尔赛可按路线与时间正常考虑',
    prefs.preferLowWalking
      ? '优先少步行、少换乘、同片区聚类'
      : '可接受适量步行以换取更丰富的行程',
  ]
  if (prefs.extraNotes) lines.push(`用户补充偏好：${prefs.extraNotes}`)
  return lines
}
