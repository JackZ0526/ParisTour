import type { FlightInfo } from '../../../types'
const STORAGE_KEY = 'paris-tour-flight-cache-v1'
/** Schedules for a given flight+date rarely change day-to-day; keep for 14 days. */
const TTL_MS = 1000 * 60 * 60 * 24 * 14
type CacheFile = {
  entries: Record<string, { info: FlightInfo; fetchedAt: number; lookupDate: string }>
}
const memory = new Map<string, { info: FlightInfo; expiresAt: number }>()
const inflight = new Map<string, Promise<FlightInfo>>()
export function flightCacheKey(flightNumber: string, lookupDate: string): string {
  return `${flightNumber.trim().toUpperCase().replace(/\s+/g, '')}|${lookupDate}`
}
/** Usable schedule = both planned dep and arr times present. */
export function hasCompleteSchedule(info: FlightInfo | null | undefined): boolean {
  return Boolean(info?.from?.scheduled?.trim() && info?.to?.scheduled?.trim())
}
function readFile(): CacheFile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { entries: {} }
    const parsed = JSON.parse(raw) as CacheFile
    if (!parsed || typeof parsed.entries !== 'object') return { entries: {} }
    return parsed
  } catch {
    return { entries: {} }
  }
}
function writeFile(file: CacheFile) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(file))
  } catch {
    /* quota */
  }
}
function dropKey(key: string) {
  memory.delete(key)
  const file = readFile()
  if (file.entries[key]) {
    delete file.entries[key]
    writeFile(file)
  }
}
export function getCachedFlight(flightNumber: string, lookupDate: string): FlightInfo | null {
  const key = flightCacheKey(flightNumber, lookupDate)
  const mem = memory.get(key)
  if (mem && mem.expiresAt > Date.now()) {
    if (!hasCompleteSchedule(mem.info) || mem.info.source === 'llm') {
      dropKey(key)
      return null
    }
    return mem.info
  }
  const file = readFile()
  const entry = file.entries[key]
  if (!entry) return null
  if (
    Date.now() - entry.fetchedAt > TTL_MS ||
    !hasCompleteSchedule(entry.info) ||
    entry.info.source === 'llm'
  ) {
    delete file.entries[key]
    writeFile(file)
    memory.delete(key)
    return null
  }
  memory.set(key, { info: entry.info, expiresAt: entry.fetchedAt + TTL_MS })
  return entry.info
}
export function setCachedFlight(flightNumber: string, lookupDate: string, info: FlightInfo) {
  if (!hasCompleteSchedule(info) || info.source === 'llm') return
  const key = flightCacheKey(flightNumber, lookupDate)
  const fetchedAt = Date.now()
  memory.set(key, { info, expiresAt: fetchedAt + TTL_MS })
  const file = readFile()
  file.entries[key] = { info, fetchedAt, lookupDate }
  writeFile(file)
}
export function clearCachedFlight(flightNumber: string, lookupDate: string) {
  dropKey(flightCacheKey(flightNumber, lookupDate))
}

/** Wipe all flight lookup cache (memory + localStorage). */
export function clearAllFlightCache() {
  memory.clear()
  inflight.clear()
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

const API_FLIGHT_SOURCES = new Set(['timetable', 'aerodatabox'])

/** Drop incomplete / LLM / non-API cache rows; keep TimeTable + AeroDataBox. */
export function purgeNonApiFlightCache() {
  memory.clear()
  const file = readFile()
  let changed = false
  for (const key of Object.keys(file.entries)) {
    const info = file.entries[key]?.info
    if (!info || !API_FLIGHT_SOURCES.has(info.source) || !hasCompleteSchedule(info)) {
      delete file.entries[key]
      changed = true
    }
  }
  if (changed) writeFile(file)
}
/** Deduplicate concurrent lookups for the same flight+date. */
export async function withFlightLookupLock(
  flightNumber: string,
  lookupDate: string,
  fn: () => Promise<FlightInfo>,
): Promise<FlightInfo> {
  const key = flightCacheKey(flightNumber, lookupDate)
  const pending = inflight.get(key)
  if (pending) return pending
  const task = fn()
    .then((info) => {
      setCachedFlight(flightNumber, lookupDate, info)
      inflight.delete(key)
      return info
    })
    .catch((err) => {
      inflight.delete(key)
      throw err
    })
  inflight.set(key, task)
  return task
}
