import type { VerifiedPlaceCandidate } from '../shared/services/llm/types'
import { expect, it, vi } from 'vitest'
import { samePlace, uniquePlaces } from '../shared/utils/placeIdentity'
import { RankedRecommendationQueue } from '../features/place/services/rankedRecommendations'
it('uses canonical provider IDs across languages and resource prefixes', () => {
  expect(samePlace({ googlePlaceId: 'ChIJabc', name: '任意中文名' }, { id: 'places/ChIJabc', name: 'Different language' })).toBe(true)
  expect(samePlace({ googlePlaceId: 'ChIJa', name: 'Same chain' }, { googlePlaceId: 'ChIJb', name: 'Same chain' })).toBe(false)
})
it('handles general translated venue types, aliases and accents without merging distinct venues', () => {
  expect(samePlace({ name: 'Louvre Museum' }, { name: 'Musée du Louvre' })).toBe(true)
  expect(samePlace({ name: 'Rodin Museum' }, { name: 'Musée Rodin' })).toBe(true)
  expect(samePlace({ name: 'Local', nameLocal: '测试馆' }, { name: '测试馆' })).toBe(true)
  expect(samePlace({ name: 'Musée Rodin' }, { name: "Musée d’Orsay" })).toBe(false)
  expect(samePlace({ name: 'Cafe 1' }, { name: 'Cafe 2' })).toBe(false)
  expect(samePlace({ name: 'Same cafe', location: { lat: 48, lng: 2 } }, { name: 'Same cafe', location: { lat: 49, lng: 2 } })).toBe(false)
})
it('filters saved and seen canonical identities before ranking and across refresh batches', async () => {
  const rows = [
    { id: 'ChIJ1', name: 'Musée du Louvre', type: 'attraction' as const },
    { id: 'ChIJ2', name: 'Museum Two', type: 'attraction' as const },
    { id: 'ChIJ2', name: '博物馆二', type: 'attraction' as const },
    { id: 'ChIJ3', name: 'Museum Three', type: 'attraction' as const },
  ]
  const rank = vi.fn(async (candidates: VerifiedPlaceCandidate[]) => candidates)
  const queue = new RankedRecommendationQueue(rank)
  const input = { key: 'trip', context: {}, excludeNames: [], excludePlaces: [{ googlePlaceId: 'ChIJ1', name: '卢浮宫' }], count: 1, locale: 'en', load: async () => rows }
  expect((await queue.take(input))?.[0].googlePlaceId).toBe('ChIJ2')
  expect((await queue.take(input))?.[0].googlePlaceId).toBe('ChIJ3')
  expect(uniquePlaces(rows)).toHaveLength(3)
  queue.clear()
})
