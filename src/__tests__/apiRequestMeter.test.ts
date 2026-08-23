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

  it('classifies Google Places search, details, and photo separately', () => {
    expect(
      classifyApiRequest('/api/google-places?rest=v1%2Fplaces%3AsearchText'),
    ).toBeNull()
    expect(
      classifyApiRequest(
        '/api/google-places?rest=v1%2Fplaces%2FChIJ-id&languageCode=fr',
      ),
    ).toBeNull()
    expect(
      classifyApiRequest(
        '/api/google-places?rest=v1%2Fplaces%3AsearchText',
        'official',
      ),
    ).toBe('google-official-search')
    expect(
      classifyApiRequest(
        '/api/google-places?rest=v1%2Fplaces%2FChIJ-id',
        'official',
      ),
    ).toBe('google-official-details')
    expect(
      classifyApiRequest(
        '/api/google-places?rest=v1%2Fplaces%2FChIJ-id%2Fphotos%2Fphoto-res%2Fmedia&maxWidthPx=900',
        'official',
      ),
    ).toBe('google-official-photo')
    expect(
      classifyApiRequest(
        '/api/google-places?rest=v1%2Fplaces%2FChIJ-id&provider=rapidapi-new',
        'rapidapi',
      ),
    ).toBe('google-rapidapi-details')
    expect(
      classifyApiRequest(
        '/api/google-places?rest=v1%2Fplaces%2FChIJ-id%2Fphotos%2Fphoto-res%2Fmedia',
        'rapidapi',
      ),
    ).toBe('google-rapidapi-photo')
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
    expect(classifyApiRequest('/api/openrouteservice')).toBe(
      'openrouteservice-directions',
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

  it('counts road route requests outside the Google group', () => {
    const now = new Date(2026, 7, 12, 18)
    recordApiRequest('openrouteservice-directions', 1, now)
    recordApiRequest('google-official-details', 2, now)
    const snapshot = getApiRequestMeterSnapshot(now)
    const google = API_REQUEST_GROUPS.find((group) => group.id === 'google-places')

    expect(snapshot.used).toBe(3)
    expect(snapshot.byKind['openrouteservice-directions']).toBe(1)
    expect(google?.labelKey).toBe('apiMeter.groups.google-places')
    expect(google && groupCount(snapshot, google)).toBe(2)
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
    expect('google-place-search' in snapshot.byKind).toBe(false)
    expect('google-place-details' in snapshot.byKind).toBe(false)
    expect('google-place-photo' in snapshot.byKind).toBe(false)
  })

  it('correctly persists and restores api meter position in localStorage', async () => {
    const store = new Map<string, string>()
    const storageMock = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, val: string) => {
        store.set(key, val)
      },
      removeItem: (key: string) => {
        store.delete(key)
      },
      clear: () => store.clear(),
      length: 0,
      key: () => null,
    }
    vi.stubGlobal('localStorage', storageMock)

    const { getInitialApiMeterPosition, saveApiMeterPosition } = await import(
      '../shared/components/ApiRequestMeter'
    )
    saveApiMeterPosition({ side: 'right', top: 320 })
    const restored = getInitialApiMeterPosition()
    expect(restored.side).toBe('right')
    expect(restored.top).toBe(320)
  })
})
