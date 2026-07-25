import type { HotelCandidate, SelectedHotel } from '../types'

const STORAGE_KEY = 'paris-tour-hotel-cache-v1'

export interface HotelCacheState {
  candidates: HotelCandidate[]
  selected: SelectedHotel | null
  model: string
  batch: number
  fetchedAt: number
  /** Last preferences used for「换一批 / 助手重推」 */
  lastPreferences?: string
}

function readRaw(): HotelCacheState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as HotelCacheState
    if (!parsed || !Array.isArray(parsed.candidates)) return null
    return parsed
  } catch {
    return null
  }
}

export function loadHotelCache(): HotelCacheState | null {
  const state = readRaw()
  if (!state?.candidates.length) return null
  return state
}

export function saveHotelCache(state: HotelCacheState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* ignore quota */
  }
}

export function clearHotelCache() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
