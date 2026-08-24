/**
 * Locale-aware enum helpers
 *
 * These enum values are persisted in trip data, so legacy trip data may
 * contain pre-i18n Chinese values like '轻松' / '短步行' / '公共交通'.
 * Each helper:
 *   1. Normalizes a stored value (Chinese or new code) → new code
 *   2. Returns the i18n-resolved string for the current locale
 *
 * Falls back to the raw value if the i18n key is missing or the value
 * doesn't match any known enum — keeps the UI alive even if new codes
 * are added without a corresponding i18n entry.
 */

import { getLocale, translate } from './i18nStore'
import type { Locale } from './types'

// Legacy Chinese → new code mappings. Persisted trip data may use these.
const LEGACY_PACE: Record<string, string> = {
  轻松: 'relaxed',
  适中: 'moderate',
  乐园日: 'park',
  自驾日: 'self-drive',
}

const LEGACY_WALK_LEVEL: Record<string, string> = {
  很少走: 'minimal',
  短步行: 'short',
  中等步行: 'moderate',
}

const LEGACY_TRANSPORT: Record<string, string> = {
  公共交通: 'transit',
  步行: 'walking',
  驾车: 'driving',
  骑行: 'cycling',
}

const KNOWN_PACE_CODES = new Set(['relaxed', 'moderate', 'park', 'self-drive'])
const KNOWN_WALK_LEVEL_CODES = new Set(['minimal', 'short', 'moderate'])
const KNOWN_TRANSPORT_CODES = new Set(['transit', 'walking', 'driving', 'cycling'])

function resolve(
  rawValue: string | undefined,
  legacyMap: Record<string, string>,
  knownCodes: Set<string>,
  i18nNamespace: 'pace' | 'walkLevel' | 'transport' | 'preferenceTag',
  overrideLocale?: Locale,
): string {
  if (!rawValue) return ''
  const code = legacyMap[rawValue] ?? rawValue
  // Unknown value — pass through raw so the UI doesn't go blank
  if (!knownCodes.has(code)) return rawValue
  const locale = overrideLocale ?? getLocale()
  return (
    translate(`${i18nNamespace}.${code}` as never, undefined, locale) || rawValue
  )
}

export function localizePace(value: string | undefined, locale?: Locale): string {
  return resolve(value, LEGACY_PACE, KNOWN_PACE_CODES, 'pace', locale)
}

// Preference tag enum (preset / active tags)
const LEGACY_PREF_TAG: Record<string, string> = {
  晨间咖啡: 'morningCoffee',
  两顿正餐: 'twoMeals',
  轻松少步行: 'easyWalking',
  巴黎迪士尼: 'disney',
  凯旋门香街: 'champsArc',
  避开大展馆: 'avoidLargeMuseums',
  摄影出片: 'photography',
  艺术画廊: 'artGalleries',
  法式烘焙: 'frenchBakery',
  塞纳河游船: 'seineCruise',
  玛黑中古店: 'maraisVintage',
  在地市集: 'localMarkets',
  铁塔夜景: 'eiffelNight',
  亲子友好: 'familyFriendly',
  平价美食: 'affordableFood',
}
const KNOWN_PREF_TAG_CODES = new Set([
  'morningCoffee', 'twoMeals', 'easyWalking', 'disney', 'champsArc',
  'avoidLargeMuseums', 'photography', 'artGalleries', 'frenchBakery',
  'seineCruise', 'maraisVintage', 'localMarkets', 'eiffelNight',
  'familyFriendly', 'affordableFood',
])
export function localizePrefTag(value: string | undefined, locale?: Locale): string {
  return resolve(value, LEGACY_PREF_TAG, KNOWN_PREF_TAG_CODES, 'preferenceTag', locale)
}
// Map legacy Chinese tag → code (used by `getTagTheme` which needs the code
// before lookup, and by data migrations).
export const LEGACY_PREF_TAG_MAP = LEGACY_PREF_TAG

export function localizeWalkLevel(value: string | undefined, locale?: Locale): string {
  return resolve(value, LEGACY_WALK_LEVEL, KNOWN_WALK_LEVEL_CODES, 'walkLevel', locale)
}

export function localizeTransport(value: string | undefined, locale?: Locale): string {
  return resolve(value, LEGACY_TRANSPORT, KNOWN_TRANSPORT_CODES, 'transport', locale)
}

/**
 * Display label for a value that may be either a transport code or a
 * walk-level code (the timeline travel chip combines both into one label).
 */
export function localizeTravelChip(value: string | undefined, locale?: Locale): string {
  if (!value) return ''
  if (KNOWN_TRANSPORT_CODES.has(value)) {
    return localizeTransport(value, locale)
  }
  if (KNOWN_WALK_LEVEL_CODES.has(value)) {
    return localizeWalkLevel(value, locale)
  }
  return value
}

/**
 * Localize stop duration hints (e.g. '自定' → 'Custom', '45 分钟' → '45 min', '2.5–3.5 小时' → '2.5–3.5 hr').
 */
export function localizeDuration(value: string | undefined, locale: Locale = getLocale()): string {
  if (!value) return ''
  const trimmed = value.trim()
  if (!trimmed) return ''

  if (locale === 'en') {
    if (trimmed === '自定' || trimmed === '自定义') return 'Custom'
    if (trimmed === '全天') return 'Full day'
    return trimmed
      .replace(/办理入住\s*/g, 'Check-in ')
      .replace(/入住\s*/g, 'Check-in ')
      .replace(/交通\s*/g, 'Transit ')
      .replace(/（含登顶）/g, ' (summit)')
      .replace(/\(含登顶\)/g, ' (summit)')
      .replace(/分钟/g, 'min')
      .replace(/小时/g, 'hr')
  }

  if (locale === 'zh-CN') {
    if (trimmed.toLowerCase() === 'custom') return '自定'
    if (trimmed.toLowerCase() === 'full day') return '全天'
    return trimmed
      .replace(/Check-in\s*/gi, '入住 ')
      .replace(/Transit\s*/gi, '交通 ')
      .replace(/\(summit\)/gi, '（含登顶）')
      .replace(/\bmin(?:utes?)?\b/gi, '分钟')
      .replace(/\bhr(?:s|hours?)?\b/gi, '小时')
  }

  return trimmed
}

// Useful when callers need the underlying code (e.g. for an `<option value>`).
export function paceToCode(value: string | undefined): string | undefined {
  if (!value) return undefined
  return LEGACY_PACE[value] ?? (KNOWN_PACE_CODES.has(value) ? value : undefined)
}

export function walkLevelToCode(value: string | undefined): string | undefined {
  if (!value) return undefined
  return LEGACY_WALK_LEVEL[value] ?? (KNOWN_WALK_LEVEL_CODES.has(value) ? value : undefined)
}

export function transportToCode(value: string | undefined): string | undefined {
  if (!value) return undefined
  return LEGACY_TRANSPORT[value] ?? (KNOWN_TRANSPORT_CODES.has(value) ? value : undefined)
}
