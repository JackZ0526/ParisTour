export type ApiRequestKind =
  | 'google-place-search'
  | 'google-place-details'
  | 'tripadvisor-search'
  | 'tripadvisor-gallery'
  | 'tripadvisor-details'
  | 'tripadvisor-autocomplete'
  | 'booking-search'
  | 'booking-detail'
  | 'booking-photos'
  | 'booking-autocomplete'
  | 'booking-description'
  | 'booking-reviews'
  | 'booking-other'
  | 'llm-openai'
  | 'llm-deepseek'
  | 'llm-gemini'
  | 'flight-timetable'
  | 'flight-aerodatabox'
  | 'place-website'
  | 'share-invite'
  | 'other'

export interface ApiRequestGroup {
  id: string
  label: string
  shortLabel: string
  kinds: Array<{ kind: ApiRequestKind; label: string }>
}

export const API_REQUEST_GROUPS: ApiRequestGroup[] = [
  {
    id: 'google-places',
    label: 'Google Places',
    shortLabel: 'Google',
    kinds: [
      { kind: 'google-place-search', label: '搜索' },
      { kind: 'google-place-details', label: '详情' },
    ],
  },
  {
    id: 'tripadvisor',
    label: 'Tripadvisor',
    shortLabel: 'Tripadvisor',
    kinds: [
      { kind: 'tripadvisor-search', label: '搜索' },
      { kind: 'tripadvisor-gallery', label: '相册' },
      { kind: 'tripadvisor-details', label: '详情' },
      { kind: 'tripadvisor-autocomplete', label: '补全' },
    ],
  },
  {
    id: 'booking',
    label: 'Booking',
    shortLabel: 'Booking',
    kinds: [
      { kind: 'booking-search', label: '搜索' },
      { kind: 'booking-detail', label: '详情' },
      { kind: 'booking-photos', label: '照片' },
      { kind: 'booking-autocomplete', label: '补全' },
      { kind: 'booking-description', label: '简介' },
      { kind: 'booking-reviews', label: '评论' },
      { kind: 'booking-other', label: '其他' },
    ],
  },
  {
    id: 'llm',
    label: '大模型',
    shortLabel: '大模型',
    kinds: [
      { kind: 'llm-deepseek', label: 'DeepSeek' },
      { kind: 'llm-openai', label: 'OpenAI' },
      { kind: 'llm-gemini', label: 'Gemini' },
    ],
  },
  {
    id: 'flights',
    label: '航班',
    shortLabel: '航班',
    kinds: [
      { kind: 'flight-timetable', label: '时刻表' },
      { kind: 'flight-aerodatabox', label: 'AeroDataBox' },
    ],
  },
  {
    id: 'other',
    label: '其他',
    shortLabel: '其他',
    kinds: [
      { kind: 'place-website', label: '官网图片' },
      { kind: 'share-invite', label: '分享邀请' },
      { kind: 'other', label: '未分类' },
    ],
  },
]

export const API_REQUEST_SUMMARY_GROUP_IDS = [
  'google-places',
  'tripadvisor',
  'llm',
  'booking',
] as const

export interface ApiRequestMeterSnapshot {
  date: string
  used: number
  byKind: Partial<Record<ApiRequestKind, number>>
}

interface StoredMeter {
  date: string
  used: number
  byKind: Partial<Record<ApiRequestKind, number>>
}

const STORAGE_PREFIX = 'paris-tour-api-request-meter-v1:'
const listeners = new Set<() => void>()
let memoryMeter: StoredMeter | null = null

function localDate(now: Date): string {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function emptyMeter(date: string): StoredMeter {
  return { date, used: 0, byKind: {} }
}

function validStoredMeter(value: unknown, date: string): StoredMeter | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<StoredMeter>
  if (candidate.date !== date || !Number.isFinite(candidate.used)) return null
  const used = Math.max(0, Math.floor(Number(candidate.used)))
  const byKind =
    candidate.byKind && typeof candidate.byKind === 'object' ? candidate.byKind : {}
  return { date, used, byKind }
}

function readMeter(now = new Date()): StoredMeter {
  const date = localDate(now)
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${date}`)
    const stored = raw ? validStoredMeter(JSON.parse(raw), date) : null
    if (stored) {
      memoryMeter = stored
      return stored
    }
  } catch {
    /* private mode / tests */
  }
  if (memoryMeter?.date === date) return memoryMeter
  memoryMeter = emptyMeter(date)
  return memoryMeter
}

function writeMeter(meter: StoredMeter) {
  memoryMeter = meter
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${meter.date}`, JSON.stringify(meter))
  } catch {
    /* keep the in-memory meter */
  }
  for (const listener of listeners) listener()
}

export function classifyApiRequest(input: string): ApiRequestKind | null {
  let url: URL
  try {
    url = new URL(input, 'http://local.invalid')
  } catch {
    return null
  }
  const path = url.pathname
  const rest = url.searchParams.get('rest') || ''

  if (path === '/api/google-places' || path.startsWith('/api/google-places/')) {
    if (rest.includes('searchText') || rest.endsWith('searchText')) {
      return 'google-place-search'
    }
    if (/^v1\/places\//.test(rest)) return 'google-place-details'
    return 'google-place-search'
  }
  if (path === '/api/tripadvisor' || path.startsWith('/api/tripadvisor/')) {
    if (rest.includes('media-gallery')) return 'tripadvisor-gallery'
    if (rest.includes('autocomplete') || rest.includes('auto-complete')) {
      return 'tripadvisor-autocomplete'
    }
    if (rest.includes('detail') || rest.includes('review')) return 'tripadvisor-details'
    return 'tripadvisor-search'
  }
  if (path === '/api/booking' || path.startsWith('/api/booking/')) {
    if (rest.includes('photo')) return 'booking-photos'
    if (rest.includes('auto-complete')) return 'booking-autocomplete'
    if (rest.includes('search')) return 'booking-search'
    if (rest.includes('detail')) return 'booking-detail'
    if (rest.includes('description')) return 'booking-description'
    if (rest.includes('review')) return 'booking-reviews'
    return 'booking-other'
  }
  if (path.startsWith('/api/openai')) return 'llm-openai'
  if (path.startsWith('/api/deepseek')) return 'llm-deepseek'
  if (path.startsWith('/api/gemini')) return 'llm-gemini'
  if (path.startsWith('/api/timetable-lookup')) return 'flight-timetable'
  if (path.startsWith('/api/aerodatabox')) return 'flight-aerodatabox'
  if (path.startsWith('/api/place-website')) return 'place-website'
  if (path.startsWith('/api/share-invite')) return 'share-invite'
  if (path.startsWith('/api/')) return 'other'
  return null
}

export function recordApiRequest(kind: ApiRequestKind, amount = 1, now = new Date()) {
  const cost = Math.max(1, Math.floor(amount))
  const current = readMeter(now)
  writeMeter({
    date: current.date,
    used: current.used + cost,
    byKind: {
      ...current.byKind,
      [kind]: (current.byKind[kind] || 0) + cost,
    },
  })
}

export function getApiRequestMeterSnapshot(now = new Date()): ApiRequestMeterSnapshot {
  return readMeter(now)
}

export function groupCount(
  snapshot: ApiRequestMeterSnapshot,
  group: ApiRequestGroup,
): number {
  return group.kinds.reduce(
    (sum, item) => sum + (snapshot.byKind[item.kind] || 0),
    0,
  )
}

export function subscribeApiRequestMeter(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function resetApiRequestMeterForTests() {
  memoryMeter = null
  listeners.clear()
}
