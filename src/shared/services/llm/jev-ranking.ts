import { requestJev } from './jev-request'
import type { VerifiedPlaceCandidate } from './types'

export function parseCandidateScores(value: unknown, candidates: VerifiedPlaceCandidate[]): VerifiedPlaceCandidate[] | null {
  const scores = (value as { scores?: Array<{ id: string; score: number }> } | null)?.scores
  if (!Array.isArray(scores) || scores.length !== candidates.length) return null
  const byId = new Map<string, number>()
  for (const row of scores) {
    if (!row || typeof row.id !== 'string' || typeof row.score !== 'number' || !Number.isFinite(row.score) || row.score < 0 || row.score > 4 || byId.has(row.id)) return null
    byId.set(row.id, row.score)
  }
  if (candidates.some((c) => !c.id || !byId.has(c.id))) return null
  return [...candidates].sort((a, b) => byId.get(b.id!)! - byId.get(a.id!)!)
}

/** A single batched evaluation; failure never invents candidates. */
export async function rankVerifiedCandidates(candidates: VerifiedPlaceCandidate[], context: unknown, signal?: AbortSignal): Promise<VerifiedPlaceCandidate[] | null> {
  signal?.throwIfAborted()
  const unique = [...new Map(candidates.filter((c) => c.id).map((c) => [c.id, c])).values()].slice(0, 64)
  if (!unique.length) return null
  // Opening schedules are validated deterministically by itinerary generation.
  // Keep them on the original candidates, but do not send their bulky provider
  // payload to a preference scorer (or translate those unused fields).
  const facts = unique.map(({ id, name, type, address, location, rating, userRatingCount, priceLevel, distanceMeters }) =>
    ({ id, name, type, address, location, rating, userRatingCount, priceLevel, distanceMeters }))
  return parseCandidateScores(await requestJev('rank', { context, candidates: facts }, signal), unique)
}
