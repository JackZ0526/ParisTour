import type { Place } from '../../../types'
/** Merge only onto the exact placeholders this run published, never newer edits. */
export function mergePlaceEnrichment(current: Record<string, Place>, original: Record<string, Place>, updates: Record<string, Place>) {
  const next = { ...current }
  for (const [id, place] of Object.entries(updates)) {
    if (current[id] && current[id] === original[id]) next[id] = place
  }
  return next
}
