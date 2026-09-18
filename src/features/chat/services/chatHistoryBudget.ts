import type { TripChatTurn } from './tripChat'

/** Keep recent context bounded; current itinerary is supplied separately on every turn. */
export function budgetChatHistory(history: TripChatTurn[], maxChars = 24_000): TripChatTurn[] {
  const result: TripChatTurn[] = []
  let remaining = maxChars
  let imageTurns = 0
  for (const turn of history.slice(-24).reverse()) {
    const cost = turn.content.length + (turn.quote?.length ?? 0) + (turn.quoteContext?.length ?? 0)
    if (cost > remaining) break
    remaining -= cost
    const keepImages = Boolean(turn.images?.length) && imageTurns++ < 2
    result.unshift({ ...turn, images: keepImages ? turn.images : undefined,
      content: !keepImages && turn.images?.length ? `${turn.content}\n[Earlier image attachment omitted from context.]` : turn.content })
  }
  return result
}
