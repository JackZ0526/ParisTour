import type { PlaceRecommendation } from './llm'

const STORAGE_KEY = 'paris-tour-rec-cache-v1'

export interface DayRecommendCache {
  day: number
  batch: number
  model: string
  recommendations: PlaceRecommendation[]
  fetchedAt: number
}

type CacheMap = Record<string, DayRecommendCache>

function dayKey(day: number) {
  return String(day)
}

function readAll(): CacheMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as CacheMap
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeAll(map: CacheMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    /* ignore quota */
  }
}

export function getDayRecommendCache(day: number): DayRecommendCache | null {
  const entry = readAll()[dayKey(day)]
  if (!entry || !Array.isArray(entry.recommendations) || !entry.recommendations.length) {
    return null
  }
  return entry
}

export function setDayRecommendCache(entry: DayRecommendCache) {
  const map = readAll()
  map[dayKey(entry.day)] = entry
  writeAll(map)
}

export function clearDayRecommendCache(day: number) {
  const map = readAll()
  delete map[dayKey(day)]
  writeAll(map)
}

export function clearAllRecommendCache() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
