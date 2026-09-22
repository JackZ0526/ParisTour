import { PROPERTY_TYPE_LABELS, PROPERTY_TYPE_EN_LABELS, FACILITY_LABELS, PAYMENT_METHOD_LABELS, REVIEW_SCORE_EN_MAP } from '../../../shared/i18n/hotelLabels'
export { PROPERTY_TYPE_LABELS, PROPERTY_TYPE_EN_LABELS, FACILITY_LABELS } from '../../../shared/i18n/hotelLabels'
import { runtimeCopy } from '../../../shared/i18n/copy/hotelDisplay-runtime-261271'
import { getLocale, type Locale } from '../../../shared/i18n'







const FACILITY_CATEGORY_RULES: Array<{ category: string; patterns: RegExp[] }> = [
  {
    category: '网络',
    patterns: [/wifi|wi-fi|internet|网络/i],
  },
  {
    category: '餐饮',
    patterns: [
      /restaurant|bar|breakfast|minibar|kitchen|dining|food|餐厅|酒吧|早餐|迷你吧/i,
    ],
  },
  {
    category: '客房',
    patterns: [
      /room|bath|shower|bed|tv|television|air conditioning|heating|soundproof|smoking|浴室|浴缸|电视|空调|暖气|隔音|禁烟/i,
    ],
  },
  {
    category: '服务',
    patterns: [
      /desk|shuttle|parking|elevator|storage|housekeeping|laundry|concierge|disabled|front desk|接送|停车|电梯|行李|前台|无障碍|清洁|礼宾/i,
    ],
  },
]



export function localizePropertyType(value: string, locale?: Locale | unknown): string {
  const current = typeof locale === 'string' ? (locale as Locale) : getLocale()
  const key = value.trim().toLowerCase()
  if (current === 'en') {
    const originalKey = Object.keys(PROPERTY_TYPE_LABELS).find((k) => PROPERTY_TYPE_LABELS[k] === value.trim()) || key
    const direct = PROPERTY_TYPE_EN_LABELS[originalKey]
    if (direct) return direct
    if (key.endsWith('s')) {
      const singular = PROPERTY_TYPE_EN_LABELS[key.slice(0, -1)]
      if (singular) return singular
    }
    return value.charAt(0).toUpperCase() + value.slice(1)
  }
  const direct = PROPERTY_TYPE_LABELS[key]
  if (direct) return direct
  if (key.endsWith('s')) {
    const singular = PROPERTY_TYPE_LABELS[key.slice(0, -1)]
    if (singular) return singular
  }
  return value
}

function toEnglishTitleCase(text: string): string {
  return text
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export function localizeFacility(value: string, locale?: Locale | unknown): string {
  const current = typeof locale === 'string' ? (locale as Locale) : getLocale()
  if (current === 'en') {
    // If it's already English, return clean title case or direct value
    const key = Object.keys(FACILITY_LABELS).find((k) => FACILITY_LABELS[k] === value.trim())
    return toEnglishTitleCase(key || value.trim())
  }
  return FACILITY_LABELS[value.trim().toLowerCase()] || value
}

const FACILITY_DEDUP_RULES: Array<{ key: string; patterns: RegExp[] }> = [
  { key: 'wifi', patterns: [/wifi|wi-fi|internet|网络/i] },
  { key: 'restaurant', patterns: [/restaurant|dining|kitchen|餐厅/i] },
  { key: 'bar', patterns: [/\bbar\b|酒吧/i] },
  { key: 'breakfast', patterns: [/breakfast|早餐/i] },
  { key: 'non-smoking', patterns: [/non-smoking|smoke-free|禁烟/i] },
  { key: 'disabled', patterns: [/disabled|wheelchair|无障碍/i] },
  { key: 'front-desk', patterns: [/front desk|24-hour|reception|前台/i] },
  { key: 'elevator', patterns: [/elevator|lift|电梯/i] },
  { key: 'heating', patterns: [/heating|暖气/i] },
  { key: 'laundry', patterns: [/laundry|洗衣/i] },
  { key: 'parking', patterns: [/parking|停车/i] },
  { key: 'pool', patterns: [/pool|swimming|游泳/i] },
  { key: 'fitness', patterns: [/fitness|gym|健身/i] },
  { key: 'air-conditioning', patterns: [/air conditioning|空调/i] },
  { key: 'pets', patterns: [/pet|宠物/i] },
  { key: 'bathroom', patterns: [/private bathroom|attached bathroom|独立浴室/i] },
  { key: 'baggage', patterns: [/baggage storage|行李寄存/i] },
  { key: 'room-service', patterns: [/room service|客房服务/i] },
]

function facilityCanonicalKey(value: string): string {
  const raw = value.trim().toLowerCase()
  const localized = localizeFacility(value)
  for (const { key, patterns } of FACILITY_DEDUP_RULES) {
    if (patterns.some((pattern) => pattern.test(raw) || pattern.test(localized))) {
      return key
    }
  }
  return raw.replace(/[^a-z0-9\u4e00-\u9fff]+/gi, ' ').trim()
}

function pickPreferredFacility(existing: string, candidate: string): string {
  const existingLabel = localizeFacility(existing)
  const candidateLabel = localizeFacility(candidate)

  if (/wifi|wi-fi|网络/i.test(existingLabel) || /wifi|wi-fi|网络/i.test(candidateLabel)) {
    if (/免费/.test(candidateLabel) && !/免费/.test(existingLabel)) return candidate
    if (/免费/.test(existingLabel) && !/免费/.test(candidateLabel)) return existing
  }

  const existingMapped = existingLabel !== existing
  const candidateMapped = candidateLabel !== candidate
  if (candidateMapped && !existingMapped) return candidate
  if (existingMapped && !candidateMapped) return existing

  if (candidateLabel.length !== existingLabel.length) {
    return candidateLabel.length > existingLabel.length ? candidate : existing
  }

  return existing
}

/** Collapse synonymous API facility strings before display (e.g. wifi variants). */
export function dedupeFacilities(facilities: string[]): string[] {
  const buckets = new Map<string, string>()
  for (const facility of facilities) {
    const trimmed = facility.trim()
    if (!trimmed) continue
    const key = facilityCanonicalKey(trimmed)
    const existing = buckets.get(key)
    buckets.set(key, existing ? pickPreferredFacility(existing, trimmed) : trimmed)
  }
  return [...buckets.values()]
}

export function localizePaymentMethod(value: string, locale?: Locale): string {
  const current = locale || getLocale()
  const key = value.trim().toLowerCase()
  if (current === 'en') {
    if (key === 'cash' || value === PAYMENT_METHOD_LABELS.cash) return toEnglishTitleCase('cash')
    if (key === 'bank transfer' || value === PAYMENT_METHOD_LABELS['bank transfer']) return toEnglishTitleCase('bank transfer')
    if (key === 'unionpay' || value === PAYMENT_METHOD_LABELS.unionpay) return 'UnionPay'
    return PAYMENT_METHOD_LABELS[key] || toEnglishTitleCase(value)
  }
  return PAYMENT_METHOD_LABELS[key] || value
}

export function categorizeFacilities(
  facilities: string[],
  locale?: Locale,
): Array<{ category: string; items: string[] }> {
  const current = locale || getLocale()
  const localized = dedupeFacilities(facilities).map((f) => localizeFacility(f, current))
  const buckets = new Map<string, string[]>()
  const uncategorized: string[] = []

  for (const facility of localized) {
    const matched = FACILITY_CATEGORY_RULES.find(({ patterns }) =>
      patterns.some((pattern) => pattern.test(facility)),
    )
    if (!matched) {
      uncategorized.push(facility)
      continue
    }
    const list = buckets.get(matched.category) || []
    if (!list.includes(facility)) list.push(facility)
    buckets.set(matched.category, list)
  }

  const ordered = [runtimeCopy('m0cbda6b524', undefined, locale), runtimeCopy('m4fb5c52c92', undefined, locale), runtimeCopy('m37188c928f', undefined, locale), runtimeCopy('m4b81846f62', undefined, locale)]
    .map((category, index) => {
      const items = buckets.get(FACILITY_CATEGORY_RULES[index].category)
      return items?.length ? { category, items } : null
    })
    .filter((item): item is { category: string; items: string[] } => Boolean(item))

  if (uncategorized.length) {
    ordered.push({ category: runtimeCopy('m1a26edf94a', undefined, locale), items: uncategorized })
  }

  return ordered
}

export function hotelScoreText(score?: number, locale?: Locale): string {
  if (score == null) return ''
  if (score >= 9) return runtimeCopy('md685485797', undefined, locale)
  if (score >= 8) return runtimeCopy('mb997afc069', undefined, locale)
  if (score >= 7) return runtimeCopy('m27e4fe4c3f', undefined, locale)
  return runtimeCopy('m05c4965a75', undefined, locale)
}



export function localizeReviewScoreLabel(label: string, locale?: Locale): string {
  const current = locale || getLocale()
  if (current === 'en') {
    return REVIEW_SCORE_EN_MAP[label] || toEnglishTitleCase(label)
  }
  return Object.keys(REVIEW_SCORE_EN_MAP).find((key) => REVIEW_SCORE_EN_MAP[key].toLowerCase() === label.toLowerCase()) || label
}

const ORDINAL_SUFFIX: Record<number, string> = {
  1: '1st',
  2: '2nd',
  3: '3rd',
}

export function formatHotelArea(area?: string, locale?: Locale): string {
  if (!area?.trim()) return ''
  const current = locale || getLocale()
  const raw = area.trim()

  if (current !== 'en') {
    return raw
  }

  if (raw === '巴黎市区') {
    return 'Paris Central'
  }

  const match = raw.match(/^(\d{1,2})区(?:\s*\(\s*([^/)]+?)(?:\s*\/\s*[^)]+)?\))?/i)
  if (match) {
    const num = Number(match[1])
    const ord = ORDINAL_SUFFIX[num] || `${num}th`
    const frName = match[2]?.trim()
    if (frName) {
      return `${ord} Arr. (${frName})`
    }
    return `${ord} Arrondissement`
  }

  return raw
}
