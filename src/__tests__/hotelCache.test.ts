import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  flushHotelCacheToStorage,
  hotelSelectionFingerprint,
  loadHotelCache,
  resetHotelCacheForTests,
  saveHotelCache,
} from '../features/hotel/services/hotelCache'
import { applyBookingHotelIdentity } from '../features/hotel/services/hotelResolve'
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

  it('replaces legacy Google identity fields with Booking canonical data', () => {
    const migrated = applyBookingHotelIdentity(
      {
        ...candidate,
        name: 'Padam hôtel 4*',
        area: '7区 (Tour Eiffel / 埃菲尔)',
        googlePlaceId: 'google-legacy',
        rating: 4.8,
        reviewCount: 900,
        description: '4-star boutique hotel in the 16th arrondissement.',
        reason: 'Near Trocadéro.',
        tripFit: 'Matches the old Google record.',
        hotelAdvisorVersion: 2,
      },
      {
        id: 'booking-padam',
        name: 'Padam Hôtel',
        address: '9 Rue Jean Giraudoux, 75116 Paris',
        location: { lat: 48.868, lng: 2.296 },
        photos: [],
        facilities: [],
        reviews: [],
      },
    )

    expect(migrated).toMatchObject({
      bookingHotelId: 'booking-padam',
      bookingIdentityVersion: 3,
      name: 'Padam Hôtel',
      address: '9 Rue Jean Giraudoux, 75116 Paris',
      lat: 48.868,
      lng: 2.296,
    })
    expect(migrated.googlePlaceId).toBeUndefined()
    expect(migrated.rating).toBeUndefined()
    expect(migrated.reviewCount).toBeUndefined()
    expect(migrated.description).toBe('')
    expect(migrated.reason).toBeUndefined()
    expect(migrated.tripFit).toBeUndefined()
    expect(migrated.hotelAdvisorVersion).toBeUndefined()
    expect(migrated.area).toContain('16区')
  })
})
