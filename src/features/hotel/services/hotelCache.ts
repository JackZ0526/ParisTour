import { hotelAreaKeyFromLabel, normalizeHotelAreaLabel, isHotelSelected } from '../constants/hotels'
import type { HotelCandidate, SelectedHotel } from '../../../types'

const STORAGE_KEY = 'paris-tour-hotel-cache-v1'
const PERSIST_DEBOUNCE_MS = 320

export interface HotelCacheState {
  candidates: HotelCandidate[]
  selected: SelectedHotel | null
  model: string
  batch: number
  fetchedAt: number
  /** Last preferences used for「换一批 / 助手重推」 */
  lastPreferences?: string
  /** After「就住这儿了」, other candidate cards are collapsed */
  othersCollapsed?: boolean
}

let initialized = false
let memory: HotelCacheState | null = null
let dirty = false
let persistTimer: ReturnType<typeof setTimeout> | null = null
let persistIdle: number | null = null
let pagehideBound = false

function normalizeCandidate(card: HotelCandidate): HotelCandidate {
  return {
    ...card,
    area: normalizeHotelAreaLabel({
      area: card.area,
      address: card.address,
      name: card.name,
      lat: card.lat,
      lng: card.lng,
    }),
  }
}

/** Re-derive areaKey so cached 16区 hotels are not stuck on saintGermain. */
function normalizeSelected(hotel: SelectedHotel | null | undefined): SelectedHotel | null {
  if (!hotel) return null
  const area = normalizeHotelAreaLabel({
    address: hotel.address,
    name: hotel.name,
    lat: hotel.lat,
    lng: hotel.lng,
  })
  return {
    ...hotel,
    areaKey: hotelAreaKeyFromLabel(area),
  }
}

function hydrateState(parsed: HotelCacheState): HotelCacheState | null {
  const selected = normalizeSelected(parsed.selected)
  const candidates = Array.isArray(parsed.candidates)
    ? parsed.candidates.map(normalizeCandidate)
    : []
  if (!candidates.length && !isHotelSelected(selected)) {
    return null
  }
  return {
    ...parsed,
    candidates,
    selected,
  }
}

function readRaw(): HotelCacheState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as HotelCacheState
    if (!parsed || !Array.isArray(parsed.candidates)) return null
    return hydrateState(parsed)
  } catch {
    return null
  }
}

function persistNow() {
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  if (persistIdle != null && typeof window !== 'undefined' && window.cancelIdleCallback) {
    window.cancelIdleCallback(persistIdle)
    persistIdle = null
  }
  if (!dirty) return
  try {
    if (memory) localStorage.setItem(STORAGE_KEY, JSON.stringify(memory))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore quota / private mode */
  }
  dirty = false
}

function bindPagehideFlush() {
  if (pagehideBound || typeof window === 'undefined') return
  pagehideBound = true
  const flush = () => persistNow()
  window.addEventListener('pagehide', flush)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush()
  })
}

function schedulePersist() {
  bindPagehideFlush()
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    persistTimer = null
    const ric = typeof window !== 'undefined' ? window.requestIdleCallback : undefined
    if (typeof ric === 'function') {
      persistIdle = ric(() => {
        persistIdle = null
        persistNow()
      }, { timeout: 400 })
      return
    }
    persistNow()
  }, PERSIST_DEBOUNCE_MS)
}

function ensureMemory(): HotelCacheState | null {
  if (!initialized) {
    memory = readRaw()
    initialized = true
  }
  return memory
}

export function loadHotelCache(): HotelCacheState | null {
  return ensureMemory()
}

export function hotelSelectionFingerprint(
  candidates: Array<{ id?: string; bookingHotelId?: string | null }>,
  selectedId: string | null | undefined,
): string {
  const ids = candidates.map((card) => card.bookingHotelId || card.id || '')
  return `${selectedId ?? ''}|${ids.join('\0')}`
}

export function saveHotelCache(state: HotelCacheState) {
  memory = hydrateState(state)
  initialized = true
  dirty = true
  schedulePersist()
}

export function clearHotelCache() {
  memory = null
  initialized = true
  dirty = false
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

/** Flush deferred localStorage writes (cloud save / page hide). */
export function flushHotelCacheToStorage() {
  persistNow()
}

export function resetHotelCacheForTests() {
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  if (persistIdle != null && typeof window !== 'undefined' && window.cancelIdleCallback) {
    window.cancelIdleCallback(persistIdle)
    persistIdle = null
  }
  initialized = false
  memory = null
  dirty = false
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
