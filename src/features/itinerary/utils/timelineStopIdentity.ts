import type { ItineraryStop } from '../../../types'

export type TimelineStopIdentity = {
  /** React/state key. Explicit stop ids remain the source of truth when present. */
  renderKey: string
  /** Position-independent fallback used to match legacy stops across devices. */
  matchKey: string
}

/**
 * Build identities that survive a reorder.
 *
 * Older cloud snapshots can contain stops without ids, and some historical
 * clients generated ids from the array index. Matching by place occurrence
 * gives the animation layer a stable semantic identity without changing the
 * persisted itinerary model. The occurrence suffix keeps repeated places
 * (notably Day 1's two hotel cards) distinct.
 */
export function timelineStopIdentities(
  dayNumber: number,
  stops: ItineraryStop[],
): TimelineStopIdentity[] {
  const occurrences = new Map<string, number>()

  return stops.map((stop) => {
    const occurrence = occurrences.get(stop.placeId) ?? 0
    occurrences.set(stop.placeId, occurrence + 1)
    const matchKey = `d${dayNumber}-${stop.placeId}-occ${occurrence}`
    const explicitId = typeof stop.id === 'string' ? stop.id.trim() : ''

    return {
      renderKey: explicitId || matchKey,
      matchKey,
    }
  })
}

/** True only when two unique key lists contain the same cards in a new order. */
export function isKeySetReordered(previous: string[], current: string[]): boolean {
  if (
    previous.length === 0 ||
    previous.length !== current.length ||
    previous.every((key, index) => key === current[index])
  ) {
    return false
  }

  const previousSet = new Set(previous)
  const currentSet = new Set(current)
  if (previousSet.size !== previous.length || currentSet.size !== current.length) {
    return false
  }
  if (previousSet.size !== currentSet.size) return false
  return previous.every((key) => currentSet.has(key))
}
