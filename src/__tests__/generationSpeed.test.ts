import { describe, it, expect, vi } from 'vitest'
import { parseCandidateScores } from '../shared/services/llm/jev-ranking'
import { RankedRecommendationQueue } from '../features/place/services/rankedRecommendations'
import { runPool } from '../shared/services/asyncPool'
import { mergePlaceEnrichment } from '../features/itinerary/services/placeEnrichment'
import { parseRankState } from '../../api/_lib/jev-ranking'
import type { VerifiedPlaceCandidate } from '../shared/services/llm/types'
import type { Place } from '../types'
const rows: VerifiedPlaceCandidate[] = Array.from({ length: 12 }, (_, i) => ({ id: `id${i}`, name: `Cafe ${i}`, type: 'cafe', location: { lat: 48.8, lng: 2.3 } }))
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>((r) => { resolve = r }); return { promise, resolve } }

describe('generation speed correctness', () => {
  it('rejects unknown, duplicate, incomplete and invalid candidate scores', () => {
    expect(parseCandidateScores({ scores: [{ id: 'alien', score: 4 }] }, [rows[0]])).toBeNull()
    expect(parseCandidateScores({ scores: [{ id: 'id0', score: NaN }] }, [rows[0]])).toBeNull()
    expect(parseCandidateScores({ scores: [{ id: 'id0', score: 5 }] }, [rows[0]])).toBeNull()
    expect(parseCandidateScores({ scores: [] }, [rows[0]])).toBeNull()
    expect(parseCandidateScores({ scores: [{ id: 'id0', score: 1 }, { id: 'id0', score: 3 }] }, rows.slice(0, 2))).toBeNull()
  })
  it('server bounds workload and rejects duplicate IDs', () => {
    expect(parseRankState(JSON.stringify({ candidates: [rows[0], rows[0]] }))).toBeNull()
    expect(parseRankState(JSON.stringify({ candidates: Array.from({ length: 65 }, (_, i) => ({ ...rows[0], id: `${i}` })) }))).toBeNull()
  })
  it('refresh consumes remaining ranked candidates without another AI call', async () => {
    const rank = vi.fn(async (candidates: VerifiedPlaceCandidate[]) => candidates)
    const queue = new RankedRecommendationQueue(rank)
    const input = { key: 'trip1-cafe', context: {}, excludeNames: ['Cafe 0'], count: 4, locale: 'en', load: vi.fn(async () => rows) }
    const first = await queue.take(input)
    const second = await queue.take(input)
    expect(first).toHaveLength(4)
    expect(second).toHaveLength(4)
    expect(new Set([...first!, ...second!].map((c) => c.name)).size).toBe(8)
    expect(first!.some((c) => c.name === 'Cafe 0')).toBe(false)
    expect(rank).toHaveBeenCalledTimes(1)
    queue.clear()
  })
  it('failed ranking reuses verified search order and queues the next batch without generative fallback', async () => {
    const rank = vi.fn(async () => null)
    const queue = new RankedRecommendationQueue(rank)
    const input = { key: 'a', context: {}, excludeNames: ['Cafe 0'], count: 4, locale: 'en', load: async () => rows }
    expect((await queue.take(input))?.map(row => row.name)).toEqual(['Cafe 1', 'Cafe 2', 'Cafe 3', 'Cafe 4'])
    expect((await queue.take(input))?.map(row => row.name)).toEqual(['Cafe 5', 'Cafe 6', 'Cafe 7', 'Cafe 8'])
    expect(rank).toHaveBeenCalledTimes(1)
    queue.clear()
  })
  it('clearing a queue prevents stale async results from publishing', async () => {
    const gate = deferred<VerifiedPlaceCandidate[]>()
    const queue = new RankedRecommendationQueue(async () => gate.promise)
    const pending = queue.take({ key: 'a', context: {}, excludeNames: [], count: 4, locale: 'en', load: async () => rows })
    await Promise.resolve()
    queue.clear()
    gate.resolve(rows)
    expect(await pending).toBeNull()
  })
  it('publishes a fast day and starts the next day before the slow day finishes', async () => {
    const slow = deferred<string>()
    const published: string[] = [], started: number[] = []
    const pending = runPool([1, 2, 3], 2, async (day) => { started.push(day); return day === 1 ? slow.promise : `${day}` }, (value) => { published.push(value) })
    await new Promise((r) => setTimeout(r, 0))
    expect(started).toEqual([1, 2, 3])
    expect(published).toEqual(['2', '3'])
    slow.resolve('1')
    await pending
    expect(published).toEqual(['2', '3', '1'])
  })
  it('enrichment never resurrects deleted places or overwrites an edit', () => {
    const original = { a: { id: 'a', name: 'Old' } as Place, b: { id: 'b' } as Place }
    const changed = { ...original.a, name: 'User edit' }
    const update = { a: { ...original.a, image: 'photo' }, b: { ...original.b, image: 'photo' } }
    expect(mergePlaceEnrichment({ a: changed }, original, update)).toEqual({ a: changed })
    expect(mergePlaceEnrichment(original, original, update)).toEqual(update)
  })
})

it('replans a conflicting parallel day before publishing it', async () => {
  const { runConflictSafePool } = await import('../shared/services/asyncPool')
  const saved = new Set<string>()
  const work = vi.fn(async (_day: number) => saved.has('Louvre') ? 'Orsay' : 'Louvre')
  await runConflictSafePool([1, 2], 2, work, (name) => saved.has(name), (name) => { saved.add(name) })
  expect([...saved]).toEqual(['Louvre', 'Orsay'])
  expect(work).toHaveBeenCalledTimes(3)
})

it('does not publish late worker results after a generation failure', async () => {
  const gate = deferred<string>()
  const publish = vi.fn()
  const pending = runPool([1, 2], 2, async (day) => {
    if (day === 1) throw new Error('failed day')
    return gate.promise
  }, publish)
  await expect(pending).rejects.toThrow('failed day')
  gate.resolve('late day')
  await new Promise((r) => setTimeout(r, 0))
  expect(publish).not.toHaveBeenCalled()
})

it('refills candidates in the background without blocking a ready batch', async () => {
  const refill = deferred<VerifiedPlaceCandidate[]>()
  const rank = vi.fn(async (candidates: VerifiedPlaceCandidate[]) => candidates)
  const queue = new RankedRecommendationQueue(rank)
  const input = { key: 'background', context: {}, excludeNames: [], count: 4, locale: 'en', load: vi.fn((round: number) => round === 0 ? Promise.resolve(rows.slice(0, 8)) : refill.promise) }
  const first = await queue.take(input)
  expect(first).toHaveLength(4)
  expect(input.load).toHaveBeenCalledTimes(2)
  const second = await queue.take(input)
  expect(second).toHaveLength(4)
  const thirdPending = queue.take(input)
  refill.resolve(rows.slice(8))
  const third = await thirdPending
  expect(third).toHaveLength(4)
  expect(new Set([...first!, ...second!, ...third!].map((c) => c.name)).size).toBe(12)
  queue.clear()
})
