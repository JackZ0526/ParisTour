import { hotelAreaKeyFromLabel, normalizeHotelAreaLabel, isHotelSelected } from '../data/hotels'
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
  /** After「就住这儿了」, other candidate cards are collapsed */
  othersCollapsed?: boolean
}

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
  if (!state) return null
  const selected = normalizeSelected(state.selected)
  const candidates = Array.isArray(state.candidates)
    ? state.candidates.map(normalizeCandidate)
    : []
  // Keep a confirmed stay even when the candidate list was stripped from a snapshot.
  if (!candidates.length && !isHotelSelected(selected)) {
    return null
  }
  return {
    ...state,
    candidates,
    selected,
  }
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
