import type { SelectedHotel } from '../types'

/** Soft placeholder until LLM / custom hotel is ready. */
export const PENDING_HOTEL: SelectedHotel = {
  id: 'hotel-pending',
  name: '待选择酒店',
  address: 'Paris, France',
  lat: 48.8566,
  lng: 2.3522,
  nearestMetro: '',
  areaKey: 'custom',
  source: 'recommended',
}

/** True when the user has confirmed a real hotel (not the empty placeholder). */
export function isHotelSelected(hotel: SelectedHotel | null | undefined): boolean {
  return Boolean(hotel?.id && hotel.id !== PENDING_HOTEL.id)
}

const PLACEHOLDER_AREA_LABELS = new Set([
  '自定义酒店',
  '助手替换',
  '助手添加',
  '巴黎市区',
  'paris',
])

/** True when the area label is a generic placeholder, not a real district. */
export function isPlaceholderHotelArea(area?: string): boolean {
  const a = (area || '').trim().toLowerCase()
  return !a || PLACEHOLDER_AREA_LABELS.has(a)
}

/** Unified card label: `N区 (Français / 中文)`. */
const ARRONDISSEMENT_LABELS: Record<number, string> = {
  1: '1区 (Louvre / 卢浮宫)',
  2: '2区 (Grands Boulevards / 大林荫道)',
  3: '3区 (Marais / 玛黑)',
  4: '4区 (Marais / 玛黑)',
  5: '5区 (Quartier Latin / 拉丁区)',
  6: '6区 (Saint-Germain / 圣日耳曼)',
  7: '7区 (Tour Eiffel / 埃菲尔)',
  8: '8区 (Champs-Élysées / 香榭丽舍)',
  9: '9区 (Opéra / 歌剧院)',
  10: '10区 (Canal Saint-Martin / 圣马丁运河)',
  11: '11区 (Bastille / 巴士底)',
  12: '12区 (Bercy / 贝尔西)',
  13: '13区 (Place d’Italie / 意大利广场)',
  14: '14区 (Montparnasse / 蒙帕纳斯)',
  15: '15区 (Vaugirard / 沃吉拉尔)',
  16: '16区 (Trocadéro / 特罗卡德罗)',
  17: '17区 (Batignolles / 巴蒂尼奥勒)',
  18: '18区 (Montmartre / 蒙马特)',
  19: '19区 (La Villette / 维莱特)',
  20: '20区 (Belleville / 贝尔维尔)',
}

/** Approximate centroids for fallback when address has no postal code. */
const ARRONDISSEMENT_CENTROIDS: Array<{ arr: number; lat: number; lng: number }> = [
  { arr: 1, lat: 48.8606, lng: 2.3376 },
  { arr: 2, lat: 48.867, lng: 2.341 },
  { arr: 3, lat: 48.8637, lng: 2.3615 },
  { arr: 4, lat: 48.8546, lng: 2.357 },
  { arr: 5, lat: 48.8462, lng: 2.3447 },
  { arr: 6, lat: 48.8493, lng: 2.332 },
  { arr: 7, lat: 48.8565, lng: 2.312 },
  { arr: 8, lat: 48.8738, lng: 2.3115 },
  { arr: 9, lat: 48.876, lng: 2.3376 },
  { arr: 10, lat: 48.8761, lng: 2.3615 },
  { arr: 11, lat: 48.859, lng: 2.38 },
  { arr: 12, lat: 48.841, lng: 2.388 },
  { arr: 13, lat: 48.828, lng: 2.362 },
  { arr: 14, lat: 48.833, lng: 2.327 },
  { arr: 15, lat: 48.8422, lng: 2.2922 },
  { arr: 16, lat: 48.8637, lng: 2.2769 },
  { arr: 17, lat: 48.8835, lng: 2.308 },
  { arr: 18, lat: 48.892, lng: 2.344 },
  { arr: 19, lat: 48.882, lng: 2.382 },
  { arr: 20, lat: 48.865, lng: 2.398 },
]

/** Name → primary arrondissement when postal code is missing. */
const NAMED_DISTRICT_ARR: Array<{ match: RegExp; arr: number }> = [
  { match: /\bmarais\b|玛黑|le marais/i, arr: 4 },
  { match: /grands?\s*boulevards?|泊松尼[eè]re/i, arr: 2 },
  { match: /\bop[eé]ra\b|欧培拉|歌剧院|saint[\s-]?lazare/i, arr: 9 },
  { match: /saint[\s-]?germain|圣日耳曼/i, arr: 6 },
  { match: /\blatin\b|拉丁|od[eé]on/i, arr: 5 },
  { match: /champs[\s-]?[eé]lys[eé]es|香榭|凯旋|étoile|etoile/i, arr: 8 },
  { match: /bastille|巴士底|r[eé]publique|共和/i, arr: 11 },
  { match: /canal\s*saint[\s-]?martin|圣马丁/i, arr: 10 },
  { match: /montmartre|蒙马特|pigalle/i, arr: 18 },
  { match: /batignolles|巴蒂尼奥勒|mac[\s-]?mahon/i, arr: 17 },
  { match: /belleville|贝尔维尔|ménilmontant|menilmontant/i, arr: 20 },
  { match: /trocad[eé]ro|特罗卡德罗|passy/i, arr: 16 },
  { match: /louvre|卢浮|palais[\s-]?royal/i, arr: 1 },
  { match: /bercy|贝尔西|nation/i, arr: 12 },
  { match: /montparnasse|蒙帕纳斯/i, arr: 14 },
  { match: /villette|维莱特|buttes[\s-]?chaumont/i, arr: 19 },
  { match: /invalides|荣军|eiffel|埃菲尔|tour[\s-]?eiffel/i, arr: 7 },
  { match: /vaugirard|沃吉拉尔|convention/i, arr: 15 },
  { match: /place\s+d['’]?italie|意大利广场|gobelins/i, arr: 13 },
]

function labelForArr(n: number): string {
  return ARRONDISSEMENT_LABELS[n] || `${n}区`
}

/**
 * Paris postcodes are 75001–75020, plus alternate 75116 for the 16th.
 * Must capture the full 3-digit suffix (e.g. 017 → 17), not 01 + leftover 7.
 */
function parseParisPostal(text: string): number | null {
  const m = text.match(/(?:^|\D)75(00[1-9]|0(?:1\d|20)|116)(?:\D|$)/i)
  if (!m) return null
  return m[1] === '116' ? 16 : Number(m[1])
}

function parseExplicitArrondissement(text: string): number | null {
  const patterns = [
    /(?:第\s*)?([1-9]|1\d|20)\s*区/,
    /\b([1-9]|1\d|20)\s*(?:e|ème|eme)\s*(?:arr(?:ondissement)?)?\b/i,
    /\bparis\s*([1-9]|1\d|20)\b/i,
    /\barr(?:ondissement)?\s*([1-9]|1\d|20)\b/i,
  ]
  for (const re of patterns) {
    const m = text.match(re)
    if (m) {
      const n = Number(m[1])
      if (n >= 1 && n <= 20) return n
    }
  }
  return null
}

function parseNamedDistrict(text: string): number | null {
  for (const { match, arr } of NAMED_DISTRICT_ARR) {
    if (match.test(text)) return arr
  }
  return null
}

/** Nearest-centroid fallback from coordinates (Paris intramuros). */
export function arrondissementFromCoords(lat?: number, lng?: number): number | null {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null
  }
  // Rough Paris bounding box
  if (lat < 48.815 || lat > 48.905 || lng < 2.225 || lng > 2.47) return null

  let best: number | null = null
  let bestDist = Infinity
  for (const c of ARRONDISSEMENT_CENTROIDS) {
    const dLat = lat - c.lat
    const dLng = lng - c.lng
    const dist = dLat * dLat + dLng * dLng
    if (dist < bestDist) {
      bestDist = dist
      best = c.arr
    }
  }
  // ~0.035° ≈ 3–4 km; beyond that, don't guess
  if (bestDist > 0.0016) return null
  return best
}

function parseArrondissementNumber(text: string): number | null {
  return (
    parseParisPostal(text) ||
    parseExplicitArrondissement(text) ||
    parseNamedDistrict(text)
  )
}

/**
 * Infer a card-style area label from address / hotel name / coords.
 * Format is always `N区 (Français / 中文)` when known.
 */
export function inferParisAreaLabel(
  address?: string,
  name?: string,
  areaHint?: string,
  coords?: { lat?: number; lng?: number },
): string {
  const text = [address, name, areaHint].filter(Boolean).join(' ')
  if (text.trim()) {
    const n = parseArrondissementNumber(text)
    if (n != null) return labelForArr(n)
  }

  const fromCoords = arrondissementFromCoords(coords?.lat, coords?.lng)
  if (fromCoords != null) return labelForArr(fromCoords)

  return '巴黎市区'
}

/**
 * Normalize any free-text / LLM area into the unified `N区 (Français / 中文)` format.
 * Prefers address postal code, then names, then coordinates.
 */
export function normalizeHotelAreaLabel(opts: {
  area?: string
  address?: string
  name?: string
  lat?: number
  lng?: number
}): string {
  const inferred = inferParisAreaLabel(opts.address, opts.name, opts.area, {
    lat: opts.lat,
    lng: opts.lng,
  })
  if (inferred !== '巴黎市区') return inferred

  const existing = (opts.area || '').trim()
  if (/^\d{1,2}区\s*\(/.test(existing) || /^\d{1,2}区$/.test(existing)) return existing
  return '巴黎市区'
}

/**
 * Metro-hint / hero keys for known districts.
 * Digits must be matched with boundaries — `16区`.includes(`6区`) is true.
 */
const AREA_KEY_BY_ARR: Record<number, string> = {
  2: 'boulevards',
  3: 'marais',
  4: 'marais',
  5: 'latin',
  6: 'saintGermain',
  9: 'opera',
  16: 'trocadero',
}

/** Map free-text area labels to itinerary metroHintFromArea keys. */
export function hotelAreaKeyFromLabel(area: string): string {
  const a = (area || '').toLowerCase()
  if (!a.trim()) return 'custom'

  // Prefer explicit arrondissement number (digit-safe: 16区 ≠ 6区, 15区 ≠ 5区).
  const n = parseParisPostal(a) || parseExplicitArrondissement(a)
  if (n != null && AREA_KEY_BY_ARR[n]) return AREA_KEY_BY_ARR[n]
  if (n != null) return 'custom'

  if (a.includes('marais') || a.includes('玛黑') || a.includes('le marais')) return 'marais'
  if (
    a.includes('opéra') ||
    a.includes('opera') ||
    a.includes('欧培拉') ||
    a.includes('歌剧院') ||
    a.includes('saint-lazare')
  )
    return 'opera'
  if (a.includes('boulevard') || a.includes('泊松')) return 'boulevards'
  if (
    a.includes('saint-germain') ||
    a.includes('saint germain') ||
    a.includes('圣日耳曼') ||
    a.includes('左岸')
  )
    return 'saintGermain'
  if (a.includes('latin') || a.includes('拉丁') || a.includes('odeon') || a.includes('odéon'))
    return 'latin'
  if (a.includes('trocad') || a.includes('特罗卡德罗') || /\bpassy\b/i.test(a)) return 'trocadero'
  return 'custom'
}
