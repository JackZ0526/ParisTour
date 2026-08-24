import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  flushHotelCacheToStorage,
  hotelSelectionFingerprint,
  loadHotelCache,
  resetHotelCacheForTests,
  saveHotelCache,
} from '../features/hotel/services/hotelCache'
import type { HotelCandidate } from '../types'

const STORAGE_KEY = 'paris-tour-hotel-cache-v1'

function stubLocalStorage() {
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) || null,
    setItem: (key: string, value: string) => {
      storage.set(key, value)
    },
    removeItem: (key: string) => {
      storage.delete(key)
    },
    clear: () => storage.clear(),
  })
}

const candidate: HotelCandidate = {
  id: 'h1',
  name: 'Padam Hôtel',
  area: '16区',
  address: 'Paris',
  description: '',
  priceHint: '',
  nearestMetro: '',
  image: '',
  lat: 48.86,
  lng: 2.29,
  source: 'llm',
}

describe('hotelCache', () => {
  beforeEach(() => {
    stubLocalStorage()
    resetHotelCacheForTests()
  })

  it('reads a write from memory before localStorage is flushed', () => {
    saveHotelCache({
      candidates: [candidate],
      selected: null,
      model: 'test',
      batch: 1,
      fetchedAt: 1,
    })
    expect(loadHotelCache()?.candidates[0]?.name).toBe('Padam Hôtel')
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('flushes the in-memory cache to localStorage on demand', () => {
    saveHotelCache({
      candidates: [candidate],
      selected: null,
      model: 'test',
      batch: 1,
      fetchedAt: 1,
    })
    flushHotelCacheToStorage()
    expect(localStorage.getItem(STORAGE_KEY)).toContain('Padam')
  })

  it('fingerprints hotel selection without depending on fetch timestamps', () => {
    expect(hotelSelectionFingerprint([{ id: 'a' }, { id: 'b', bookingHotelId: 'bk' }], 'a')).toBe(
      hotelSelectionFingerprint([{ id: 'a' }, { id: 'b', bookingHotelId: 'bk' }], 'a'),
    )
    expect(hotelSelectionFingerprint([{ id: 'a' }], 'a')).not.toBe(
      hotelSelectionFingerprint([{ id: 'a' }], 'b'),
    )
  })
})
