import type { DayPlan } from '../../../types'
import { loadItineraryState, saveItineraryState } from '../../itinerary/utils/itineraryState'

export type DayPlanMap = Record<string, DayPlan>

export type DayCloudDiff = {
  upserts: DayPlanMap
  hashes: Record<string, string>
  deletes: string[]
}

export function dayKey(day: number | string): string {
  return String(day)
}

/** Short stable fingerprint so pull_trip_days known-maps stay small. */
export function hashDayPlan(day: DayPlan): string {
  const s = JSON.stringify(day)
  let h = 2166136261
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(16)
}

export function daysToMap(days: DayPlan[] | null | undefined): DayPlanMap {
  const out: DayPlanMap = {}
  for (const day of days || []) {
    if (!day || typeof day.day !== 'number') continue
    out[dayKey(day.day)] = day
  }
  return out
}

export function mapToDays(map: DayPlanMap): DayPlan[] {
  return Object.values(map).sort((a, b) => a.day - b.day)
}

export function hashesForDays(days: DayPlan[] | null | undefined): Record<string, string> {
  const hashes: Record<string, string> = {}
  for (const day of days || []) {
    if (!day || typeof day.day !== 'number') continue
    hashes[dayKey(day.day)] = hashDayPlan(day)
  }
  return hashes
}

export function peekDayCloudDiff(
  days: DayPlan[] | null | undefined,
  lastHashes: Record<string, string> | null | undefined,
): DayCloudDiff {
  const current = daysToMap(days)
  const last = lastHashes && typeof lastHashes === 'object' ? lastHashes : {}
  const upserts: DayPlanMap = {}
  const hashes: Record<string, string> = {}
  const deletes: string[] = []
  for (const [key, plan] of Object.entries(current)) {
    const hash = hashDayPlan(plan)
    if (last[key] !== hash) {
      upserts[key] = plan
      hashes[key] = hash
    }
  }
  for (const key of Object.keys(last)) {
    if (!(key in current)) deletes.push(key)
  }
  return { upserts, hashes, deletes }
}

export function dayCloudDiffIsEmpty(diff: DayCloudDiff): boolean {
  return Object.keys(diff.upserts).length === 0 && diff.deletes.length === 0
}

export function asDayPlanMap(raw: unknown): DayPlanMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: DayPlanMap = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!key || !value || typeof value !== 'object' || Array.isArray(value)) continue
    const plan = value as DayPlan
    if (typeof plan.day !== 'number' || !Array.isArray(plan.stops)) continue
    out[dayKey(key)] = plan
  }
  return out
}

/**
 * Merge remote day upserts/deletes. Keys in `skipKeys` (local unacked edits)
 * are left untouched.
 */
export function mergeCloudDays(options: {
  upserts?: DayPlanMap | null
  deletes?: string[] | null
  skipKeys?: Iterable<string>
}): boolean {
  const skip = new Set(options.skipKeys || [])
  const itinerary = loadItineraryState()
  const map = daysToMap(itinerary.days)
  let changed = false
  for (const key of options.deletes || []) {
    if (!key || skip.has(key) || !(key in map)) continue
    delete map[key]
    changed = true
  }
  for (const [key, plan] of Object.entries(options.upserts || {})) {
    if (!key || skip.has(key) || !plan) continue
    map[key] = plan
    changed = true
  }
  if (!changed) return false
  saveItineraryState(mapToDays(map), itinerary.customPlaces, {
    generated: itinerary.generated,
    fingerprint: itinerary.fingerprint ?? undefined,
  })
  return true
}
