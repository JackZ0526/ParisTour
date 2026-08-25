import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  hotelAdvisorKeys,
  hydrateHotelAdvisorFromCache,
  rememberHotelAdvisorCopy,
} from '../features/hotel/services/hotelAdvisorMemo'
import { resetLlmArtifactStoreForTests } from '../shared/services/llm/llmArtifactStore'
import { clearLlmMemo } from '../shared/services/llm/llmMemo'
import type { HotelCandidate } from '../types'

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

function hotel(partial: Partial<HotelCandidate> & Pick<HotelCandidate, 'id' | 'name'>): HotelCandidate {
  return {
    area: '16区',
    address: 'Paris',
    description: '',
    priceHint: '',
    nearestMetro: '',
    image: '',
    lat: 48.86,
    lng: 2.29,
    source: 'custom',
    ...partial,
  }
}

describe('hotelAdvisorMemo', () => {
  beforeEach(() => {
    stubLocalStorage()
    resetLlmArtifactStoreForTests()
    clearLlmMemo()
  })

  it('keys advisor copy by booking id and name, not only the ephemeral card id', () => {
    expect(
      hotelAdvisorKeys({
        id: 'hotel-111-abc',
        name: 'Padam Hôtel',
        bookingHotelId: '12345',
      }),
    ).toEqual([
      'hotel-detail:v5:zh-CN:booking:12345',
      'hotel-detail:v5:zh-CN:name:padam hôtel',
      'hotel-detail:v5:zh-CN:hotel-111-abc',
    ])
  })

  it('restores advisor copy onto a re-added custom hotel with a new card id', () => {
    rememberHotelAdvisorCopy(
      { id: 'hotel-old', name: 'Padam Hôtel', bookingHotelId: '12345' },
      '坐落于16区安静街道，步行约20分钟可达埃菲尔铁塔。',
    )

    const restored = hydrateHotelAdvisorFromCache(
      hotel({ id: 'hotel-new', name: 'Padam Hôtel', bookingHotelId: '12345' }),
    )

    expect(restored.tripFit).toBe('坐落于16区安静街道，步行约20分钟可达埃菲尔铁塔。')
    expect(restored.hotelAdvisorVersion).toBe(4)
  })

  it('restores advisor copy by hotel name when booking id is not yet known', () => {
    rememberHotelAdvisorCopy(
      { id: 'hotel-old', name: 'Padam Hôtel' },
      '位置评分高达9.6，适合衔接市区行程。',
    )

    const restored = hydrateHotelAdvisorFromCache(hotel({ id: 'hotel-new', name: 'Padam Hôtel' }))
    expect(restored.tripFit).toContain('位置评分高达9.6')
  })

  it('does not restore Google provider facts onto a Booking-backed hotel', () => {
    const legacy = hotel({
      id: 'hotel-padam',
      name: 'Padam Hôtel',
      bookingHotelId: '12345',
      tripFit: 'Its exceptional Google score of 4.7 comes from 175 reviews.',
      hotelAdvisorVersion: 3,
    })

    expect(hydrateHotelAdvisorFromCache(legacy)).toBe(legacy)
  })
})
