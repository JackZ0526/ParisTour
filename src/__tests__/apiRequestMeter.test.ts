import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  classifyApiRequest,
  getApiRequestMeterSnapshot,
  groupCount,
  API_REQUEST_GROUPS,
  recordApiRequest,
  resetApiRequestMeterForTests,
} from '../shared/services/apiRequestMeter'
import { authFetch } from '../features/auth/services/authFetch'

describe('API request meter', () => {
  afterEach(() => {
    resetApiRequestMeterForTests()
    vi.unstubAllGlobals()
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
    expect(
      classifyApiRequest(
        '/api/google-places?rest=v1%2Fplaces%3AsearchText',
        'official',
      ),
    ).toBe('google-official-search')
    expect(
      classifyApiRequest(
        '/api/google-places?rest=v1%2Fplaces%2FChIJ-id&provider=rapidapi-new',
        'rapidapi',
      ),
    ).toBe('google-rapidapi-details')
  })

  it('classifies Tripadvisor, Booking, LLM, and other paid routes', () => {
    expect(classifyApiRequest('/api/tripadvisor?rest=restaurants%2Fmedia-gallery')).toBe(
      'tripadvisor-gallery',
    )
    expect(
      classifyApiRequest('/api/tripadvisor?rest=api%2Fv1%2Fautocomplete'),
    ).toBe('tripadvisor-autocomplete')
    expect(classifyApiRequest('/api/tripadvisor?rest=auto-complete')).toBe(
      'tripadvisor-autocomplete',
    )
    expect(
      classifyApiRequest('/api/tripadvisor?rest=api%2Fv1%2Frestaurants%2Fdetail'),
    ).toBe('tripadvisor-details')
    expect(
      classifyApiRequest('/api/tripadvisor?rest=restaurants%2Freviews'),
    ).toBe('tripadvisor-details')
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
    recordApiRequest('google-official-search', 2, now)
    recordApiRequest('google-rapidapi-details', 1, now)
    recordApiRequest('tripadvisor-gallery', 3, now)
    const snapshot = getApiRequestMeterSnapshot(now)
    expect(snapshot.used).toBe(6)
    expect(snapshot.byKind['google-official-search']).toBe(2)
    expect(snapshot.byKind['google-rapidapi-details']).toBe(1)
    expect(snapshot.byKind['tripadvisor-gallery']).toBe(3)
    const google = API_REQUEST_GROUPS.find((group) => group.id === 'google-places')
    expect(google && groupCount(snapshot, google)).toBe(3)
  })

  it('records the Google Places provider returned by the server', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('{}', {
          headers: { 'x-paristour-places-provider': 'official' },
        }),
      )
      .mockResolvedValueOnce(
        new Response('{}', {
          headers: { 'x-paristour-places-provider': 'rapidapi' },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    await authFetch('/api/google-places?rest=v1%2Fplaces%3AsearchText')
    await authFetch('/api/google-places?rest=v1%2Fplaces%2FChIJ-id')

    const snapshot = getApiRequestMeterSnapshot()
    expect(snapshot.byKind['google-official-search']).toBe(1)
    expect(snapshot.byKind['google-rapidapi-details']).toBe(1)
    expect(snapshot.byKind['google-place-search']).toBeUndefined()
    expect(snapshot.byKind['google-place-details']).toBeUndefined()
  })
})
