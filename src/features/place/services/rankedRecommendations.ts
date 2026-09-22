import { samePlace, uniquePlaces, type PlaceIdentity } from '../../../shared/utils/placeIdentity'
import { localizedCopy } from '../../../shared/i18n/copy/rankedRecommendations-94517e'
import type { PlaceRecommendation, VerifiedPlaceCandidate } from '../../../shared/services/llm/types'
import { rankVerifiedCandidates } from '../../../shared/services/llm/jev-ranking'

type Entry = { rows: VerifiedPlaceCandidate[]; seen: PlaceIdentity[]; round: number; at: number; pending?: Promise<boolean>; abort: AbortController }

/** Per-dialog, context-keyed candidate queues. Stale/background results cannot cross trips. */
export class RankedRecommendationQueue {
  private entries = new Map<string, Entry>()
  private rank: typeof rankVerifiedCandidates
  constructor(rank = rankVerifiedCandidates) { this.rank = rank }
  clear() {
    for (const entry of this.entries.values()) entry.abort.abort()
    this.entries.clear()
  }
  async take(input: {
    excludePlaces?: PlaceIdentity[]
    key: string; context: unknown; excludeNames: string[]; count: number; locale: string
    load: (round: number) => Promise<VerifiedPlaceCandidate[]>
  }): Promise<PlaceRecommendation[] | null> {
    let entry = this.entries.get(input.key)
    if (!entry || Date.now() - entry.at > 10 * 60_000) {
      entry?.abort.abort()
      entry = { rows: [], seen: [], round: 0, at: Date.now(), abort: new AbortController() }
      this.entries.set(input.key, entry)
      if (this.entries.size > 12) {
        const oldest = this.entries.keys().next().value!
        this.entries.get(oldest)?.abort.abort()
        this.entries.delete(oldest)
      }
    }
    const current = entry
    const excluded: PlaceIdentity[] = [...(input.excludePlaces || []), ...input.excludeNames.map(name => ({ name }))]
    current.rows = current.rows.filter((c) => !excluded.some(p => samePlace(p, c)))
    const refill = (): Promise<boolean> => {
      if (current.pending) return current.pending
      current.pending = (async () => {
        try {
          const candidates = await input.load(current.round++)
          current.abort.signal.throwIfAborted()
          const remaining = uniquePlaces(candidates).filter(c => c.id &&
            ![...current.seen, ...current.rows, ...excluded].some(p => samePlace(p, c)))
          if (!remaining.length) return true
          // Provider search order is a safe, factual fallback. Do not make another
          // generative call just to reformat already verified recommendation cards.
          const ranked = await this.rank(remaining, input.context, current.abort.signal) ?? remaining
          current.abort.signal.throwIfAborted()
          for (const row of ranked) {
            if (![...current.rows, ...current.seen, ...excluded].some(p => samePlace(p, row))) current.rows.push(row)
          }
          return true
        } catch { return false }
        finally { current.pending = undefined }
      })()
      return current.pending
    }
    if (current.rows.length < input.count && !await refill() && !current.rows.length) return null
    current.abort.signal.throwIfAborted()
    const picked = current.rows.splice(0, input.count)
    for (const row of picked) current.seen.push(row)
    if (current.rows.length <= input.count && current.round < 4) {
      void refill()
    }
    return picked.map((row) => candidateRecommendation(row, input.locale))
  }
}

export function candidateRecommendation(row: VerifiedPlaceCandidate, locale: string): PlaceRecommendation {
  const en = locale === 'en'
  const facts = [
    row.rating != null ? `Google ★ ${row.rating.toFixed(1)}` : '',
    row.distanceMeters != null ? `${(row.distanceMeters / 1000).toFixed(1)} km ${en ? localizedCopy('m51c1dc73bb', undefined, 'en') : localizedCopy('m51c1dc73bb', undefined, 'zh-CN')}` : '',
  ].filter(Boolean)
  const reason = facts.join(' · ') || (en ? localizedCopy('m1261110276', undefined, 'en') : localizedCopy('m1261110276', undefined, 'zh-CN'))
  return { googlePlaceId: row.id, name: row.name, type: row.type, reason, intro: row.address || reason, area: row.address }
}
