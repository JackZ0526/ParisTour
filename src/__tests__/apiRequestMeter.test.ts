import { afterEach, describe, expect, it } from 'vitest'
import {
  classifyApiRequest,
  getApiRequestMeterSnapshot,
  groupCount,
  API_REQUEST_GROUPS,
  recordApiRequest,
  resetApiRequestMeterForTests,
} from '../shared/services/apiRequestMeter'

describe('API request meter', () => {
  afterEach(() => {
    resetApiRequestMeterForTests()
  })

  it('classifies Google Places search and details separately', () => {
    expect(
      classifyApiRequest('/api/google-places?rest=v1%2Fplaces%3AsearchText'),
    ).toBe('google-place-search')
    expect(
      classifyApiRequest(
        '/api/google-places?rest=v1%2Fplaces%2FChIJ-id&languageCode=fr',
      ),
    ).toBe('google-place-details')
  })

  it('classifies Tripadvisor, Booking, LLM, and other paid routes', () => {
    expect(
      classifyApiRequest('/api/tripadvisor?rest=restaurants%2Fmedia-gallery'),
    ).toBe('tripadvisor-gallery')
    expect(classifyApiRequest('/api/tripadvisor?rest=auto-complete')).toBe(
      'tripadvisor-autocomplete',
    )
    expect(classifyApiRequest('/api/booking?rest=stays%2Fsearch-by-geo')).toBe(
      'booking-search',
    )
    expect(classifyApiRequest('/api/booking?rest=stays%2Fget-photos')).toBe(
      'booking-photos',
    )
    expect(classifyApiRequest('/api/deepseek/chat/completions')).toBe('llm-deepseek')
    expect(classifyApiRequest('/api/place-website?url=https%3A%2F%2Fx.test')).toBe(
      'place-website',
    )
    expect(classifyApiRequest('https://nominatim.openstreetmap.org/search')).toBe(
      null,
    )
  })

  it('counts each kind independently for the local day', () => {
    const now = new Date(2026, 7, 12, 18)
    recordApiRequest('google-place-search', 2, now)
    recordApiRequest('google-place-details', 1, now)
    recordApiRequest('tripadvisor-gallery', 3, now)
    const snapshot = getApiRequestMeterSnapshot(now)
    expect(snapshot.used).toBe(6)
    expect(snapshot.byKind['google-place-search']).toBe(2)
    expect(snapshot.byKind['google-place-details']).toBe(1)
    expect(snapshot.byKind['tripadvisor-gallery']).toBe(3)
    const google = API_REQUEST_GROUPS.find((group) => group.id === 'google-places')
    expect(google && groupCount(snapshot, google)).toBe(3)
  })
})
