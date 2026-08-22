import { getLocale, type Locale } from '../../../shared/i18n'

export const PROPERTY_TYPE_LABELS: Record<string, string> = {
  hotel: '酒店',
  hotels: '酒店',
  aparthotel: '公寓酒店',
  aparthotels: '公寓酒店',
  hostel: '青年旅舍',
  hostels: '青年旅舍',
  guesthouse: '民宿',
  'bed and breakfast': '床与早餐',
  motel: '汽车旅馆',
  resort: '度假村',
  villa: '别墅',
  apartment: '公寓',
  apartments: '公寓',
  'serviced apartment': '服务式公寓',
}

export const PROPERTY_TYPE_EN_LABELS: Record<string, string> = {
  hotel: 'Hotel',
  hotels: 'Hotel',
  aparthotel: 'Aparthotel',
  aparthotels: 'Aparthotel',
  hostel: 'Hostel',
  hostels: 'Hostel',
  guesthouse: 'Guesthouse',
  'bed and breakfast': 'Bed & Breakfast',
  motel: 'Motel',
  resort: 'Resort',
  villa: 'Villa',
  apartment: 'Apartment',
  apartments: 'Apartment',
  'serviced apartment': 'Serviced Apartment',
}

export const FACILITY_LABELS: Record<string, string> = {
  'non-smoking rooms': '禁烟客房',
  'facilities for disabled guests': '无障碍设施',
  restaurant: '餐厅',
  'wifi in all areas': '全区域 Wi-Fi',
  'free wifi': '免费 Wi-Fi',
  'free wi-fi': '免费 Wi-Fi',
  wifi: 'Wi-Fi',
  internet: '网络',
  'air conditioning': '空调',
  'baggage storage': '行李寄存',
  '24-hour front desk': '24 小时前台',
  'room service': '客房服务',
  'family rooms': '家庭房',
  bar: '酒吧',
  elevator: '电梯',
  heating: '暖气',
  parking: '停车场',
  'airport shuttle': '机场接送',
  'private bathroom': '独立浴室',
  'attached bathroom': '独立浴室',
  bath: '浴缸',
  'hot tub': '按摩浴缸',
  shower: '淋浴',
  minibar: '迷你吧',
  'flat-screen tv': '平板电视',
  tv: '电视',
  'cable channels': '有线频道',
  'satellite channels': '卫星频道',
  'soundproof rooms': '隔音客房',
  'daily housekeeping': '每日清洁',
  'smoke-free property': '全馆禁烟',
  'cctv outside property': '室外监控',
  'cctv in common areas': '公共区域监控',
  refrigerator: '冰箱',
  'ironing facilities': '熨烫设施',
  'safety deposit box': '保险箱',
  'hairdryer': '吹风机',
  'concierge service': '礼宾服务',
  'laundry service': '洗衣服务',
  'express check-in/check-out': '快速入住/退房',
  'express check-in': '快速入住',
  'express check-out': '快速退房',
  'breakfast in the room': '客房早餐',
  'breakfast available': '提供早餐',
  sauna: '桑拿',
  spa: '水疗',
  'fitness centre': '健身中心',
  'fitness center': '健身中心',
  'swimming pool': '游泳池',
  terrace: '露台',
  garden: '花园',
  'pets allowed': '允许携带宠物',
  'no pets allowed': '不允许携带宠物',
}

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

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  'american express': 'American Express',
  amex: 'American Express',
  maestro: 'Maestro',
  'diners club': 'Diners Club',
  discover: 'Discover',
  jcb: 'JCB',
  unionpay: '银联',
  cash: '现金',
  'bank transfer': '银行转账',
}

export function localizePropertyType(value: string, locale?: Locale | unknown): string {
  const current = typeof locale === 'string' ? (locale as Locale) : getLocale()
  const key = value.trim().toLowerCase()
  if (current === 'en') {
    const direct = PROPERTY_TYPE_EN_LABELS[key]
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
    return toEnglishTitleCase(value.trim())
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
    if (key === 'cash') return 'Cash'
    if (key === 'bank transfer') return 'Bank Transfer'
    if (key === 'unionpay') return 'UnionPay'
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

  const ordered = ['网络', '餐饮', '客房', '服务']
    .map((category) => {
      const items = buckets.get(category)
      return items?.length ? { category, items } : null
    })
    .filter((item): item is { category: string; items: string[] } => Boolean(item))

  if (uncategorized.length) {
    ordered.push({ category: '其他', items: uncategorized })
  }

  return ordered
}

export function hotelScoreText(score?: number, locale?: Locale): string {
  if (score == null) return ''
  const current = locale || getLocale()
  if (current === 'en') {
    if (score >= 9) return 'Wonderful'
    if (score >= 8) return 'Very good'
    if (score >= 7) return 'Good'
    return 'Pleasant'
  }
  if (score >= 9) return '好极了'
  if (score >= 8) return '非常好'
  if (score >= 7) return '好'
  return '令人愉悦'
}

const REVIEW_SCORE_EN_MAP: Record<string, string> = {
  员工服务: 'Staff',
  设施服务: 'Facilities',
  清洁程度: 'Cleanliness',
  舒适程度: 'Comfort',
  性价比: 'Value for money',
  位置: 'Location',
  '免费 Wi-Fi': 'Free WiFi',
  'Wi-Fi': 'WiFi',
  早餐: 'Breakfast',
  步行便利: 'Walking score',
}

export function localizeReviewScoreLabel(label: string, locale?: Locale): string {
  const current = locale || getLocale()
  if (current === 'en') {
    return REVIEW_SCORE_EN_MAP[label] || toEnglishTitleCase(label)
  }
  return label
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
