import { expect, it, vi } from 'vitest'
import { rankVerifiedCandidates } from '../shared/services/llm/jev-ranking'
import { requestJev } from '../shared/services/llm/jev-request'
import type { VerifiedPlaceCandidate } from '../shared/services/llm/types'
vi.mock('../shared/services/llm/jev-request', () => ({ requestJev: vi.fn() }))
it('sends only scoring facts and preserves the full schedule on returned candidates', async () => {
  const row: VerifiedPlaceCandidate = { id: 'cafe-1', name: 'Cafe', type: 'cafe', rating: 4.5, openingSchedule: {} }
  vi.mocked(requestJev).mockResolvedValue({ scores: [{ id: 'cafe-1', score: 3 }] })
  expect(await rankVerifiedCandidates([row], {})).toEqual([row])
  const state = vi.mocked(requestJev).mock.calls[0][1] as { candidates: unknown[] }
  expect(state.candidates[0]).not.toHaveProperty('openingSchedule')
  expect(row).toHaveProperty('openingSchedule')
})
