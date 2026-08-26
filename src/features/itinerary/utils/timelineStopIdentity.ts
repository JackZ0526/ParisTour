import type { ItineraryStop } from '../../../types'

export type TimelineStopIdentity = {
  /**
   * React / animation key. Always place-occurrence based so rewriting durable
   * stop.id (common for default itinerary stops after reorder) does not look
   * like a delete + re-add.
   */
  renderKey: string
  /** Same as renderKey; kept for callers that distinguish the two. */
  matchKey: string
  /**
   * Id passed to itinerary mutations. Prefers the durable stop.id so cloud
   * sync addresses the same row the server stored.
   */
  actionId: string
}

/**
 * Build identities that survive a reorder and stop.id rewrites.
 *
 * Default itinerary stops use index-suffixed ids (`d2-attr-arc-1`). After a
 * peer deletes another stop, local indexes shift; if UI keys followed those
 * ids, DayTimeline would play a fake gommage while the place remained.
 * Matching by place occurrence keeps animation identity stable. Mutations
 * still use `actionId` (explicit id when present).
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
    const fallbackId = matchKey

    return {
      renderKey: matchKey,
      matchKey,
      actionId: explicitId || fallbackId,
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
