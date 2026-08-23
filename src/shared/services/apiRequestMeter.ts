export type ApiRequestKind =
  | 'google-official-search'
  | 'google-official-details'
  | 'google-official-photo'
  | 'google-rapidapi-search'
  | 'google-rapidapi-details'
  | 'google-rapidapi-photo'
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
  | 'openrouteservice-directions'
  | 'other'

export interface ApiRequestGroup {
  id: string
  /** i18n key under `apiMeter.groups.<id>` — resolved via `t()` at render. */
  labelKey: string
  /** i18n key under `apiMeter.groups.<id>` used for the compact rail badge. */
  shortLabelKey: string
  kinds: Array<{ kind: ApiRequestKind; labelKey: string; legacy?: boolean }>
}

export const API_REQUEST_GROUPS: ApiRequestGroup[] = [
  {
    id: 'google-places',
    labelKey: 'apiMeter.groups.google-places',
    shortLabelKey: 'apiMeter.groups.google-places',
    kinds: [
      { kind: 'google-official-search', labelKey: 'apiMeter.kinds.google-official-search' },
      { kind: 'google-official-details', labelKey: 'apiMeter.kinds.google-official-details' },
      { kind: 'google-official-photo', labelKey: 'apiMeter.kinds.google-official-photo' },
      { kind: 'google-rapidapi-search', labelKey: 'apiMeter.kinds.google-rapidapi-search' },
      { kind: 'google-rapidapi-details', labelKey: 'apiMeter.kinds.google-rapidapi-details' },
      { kind: 'google-rapidapi-photo', labelKey: 'apiMeter.kinds.google-rapidapi-photo' },
    ],
  },
  {
    id: 'tripadvisor',
    labelKey: 'apiMeter.groups.tripadvisor',
    shortLabelKey: 'apiMeter.groups.tripadvisor',
    kinds: [
      { kind: 'tripadvisor-search', labelKey: 'apiMeter.kinds.tripadvisor-search' },
      { kind: 'tripadvisor-gallery', labelKey: 'apiMeter.kinds.tripadvisor-gallery' },
      { kind: 'tripadvisor-details', labelKey: 'apiMeter.kinds.tripadvisor-details' },
      { kind: 'tripadvisor-autocomplete', labelKey: 'apiMeter.kinds.tripadvisor-autocomplete' },
    ],
  },
  {
    id: 'booking',
    labelKey: 'apiMeter.groups.booking',
    shortLabelKey: 'apiMeter.groups.booking',
    kinds: [
      { kind: 'booking-search', labelKey: 'apiMeter.kinds.booking-search' },
      { kind: 'booking-detail', labelKey: 'apiMeter.kinds.booking-detail' },
      { kind: 'booking-photos', labelKey: 'apiMeter.kinds.booking-photos' },
      { kind: 'booking-autocomplete', labelKey: 'apiMeter.kinds.booking-autocomplete' },
      { kind: 'booking-description', labelKey: 'apiMeter.kinds.booking-description' },
      { kind: 'booking-reviews', labelKey: 'apiMeter.kinds.booking-reviews' },
      { kind: 'booking-other', labelKey: 'apiMeter.kinds.booking-other' },
    ],
  },
  {
    id: 'llm',
    labelKey: 'apiMeter.groups.llm',
    shortLabelKey: 'apiMeter.groups.llm',
    kinds: [
      { kind: 'llm-deepseek', labelKey: 'apiMeter.kinds.llm-deepseek' },
      { kind: 'llm-openai', labelKey: 'apiMeter.kinds.llm-openai' },
      { kind: 'llm-gemini', labelKey: 'apiMeter.kinds.llm-gemini' },
    ],
  },
  {
    id: 'flights',
    labelKey: 'apiMeter.groups.flights',
    shortLabelKey: 'apiMeter.groups.flights',
    kinds: [
      { kind: 'flight-timetable', labelKey: 'apiMeter.kinds.flight-timetable' },
      { kind: 'flight-aerodatabox', labelKey: 'apiMeter.kinds.flight-aerodatabox' },
    ],
  },
  {
    id: 'other',
    labelKey: 'apiMeter.groups.other',
    shortLabelKey: 'apiMeter.groups.other',
    kinds: [
      { kind: 'place-website', labelKey: 'apiMeter.kinds.place-website' },
      { kind: 'share-invite', labelKey: 'apiMeter.kinds.share-invite' },
      { kind: 'openrouteservice-directions', labelKey: 'apiMeter.kinds.openrouteservice-directions' },
      { kind: 'other', labelKey: 'apiMeter.kinds.other' },
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

export type GooglePlacesMeterProvider = 'official' | 'rapidapi'

export function classifyApiRequest(
  input: string,
  googlePlacesProvider?: GooglePlacesMeterProvider | null,
): ApiRequestKind | null {
  let url: URL
  try {
    url = new URL(input, 'http://local.invalid')
  } catch {
    return null
  }
  const path = url.pathname
  const rest = url.searchParams.get('rest') || ''

  if (path === '/api/google-places' || path.startsWith('/api/google-places/')) {
    const isPhoto = /\/photos\/[A-Za-z0-9_-]+\/media$/.test(rest)
    const operation = isPhoto
      ? 'photo'
      : /^v1\/places\//.test(rest)
        ? 'details'
        : 'search'
    if (googlePlacesProvider === 'official') {
      return operation === 'photo'
        ? 'google-official-photo'
        : operation === 'details'
          ? 'google-official-details'
          : 'google-official-search'
    }
    if (googlePlacesProvider === 'rapidapi') {
      return operation === 'photo'
        ? 'google-rapidapi-photo'
        : operation === 'details'
          ? 'google-rapidapi-details'
          : 'google-rapidapi-search'
    }
    return null
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
  if (path.startsWith('/api/openrouteservice')) return 'openrouteservice-directions'
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
