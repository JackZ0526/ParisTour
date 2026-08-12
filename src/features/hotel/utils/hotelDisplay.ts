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
  'serviced apartment': '服务式公寓',
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

export function localizePropertyType(value: string): string {
  const key = value.trim().toLowerCase()
  return PROPERTY_TYPE_LABELS[key] || value
}

export function localizeFacility(value: string): string {
  return FACILITY_LABELS[value.trim().toLowerCase()] || value
}

export function localizePaymentMethod(value: string): string {
  return PAYMENT_METHOD_LABELS[value.trim().toLowerCase()] || value
}

export function categorizeFacilities(
  facilities: string[],
): Array<{ category: string; items: string[] }> {
  const localized = facilities.map(localizeFacility)
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

export function hotelScoreText(score?: number): string {
  if (score == null) return ''
  if (score >= 9) return '好极了'
  if (score >= 8) return '非常好'
  if (score >= 7) return '好'
  return '令人愉悦'
}
