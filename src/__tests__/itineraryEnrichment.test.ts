import { describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ generate: vi.fn(), details: vi.fn(), rank: vi.fn() }))
vi.mock('../shared/services/llm/llm', () => ({ generateSingleDayItinerary: mocks.generate, generateFullItinerary: vi.fn() }))
vi.mock('../shared/services/llm/jev-ranking', () => ({ rankVerifiedCandidates: mocks.rank }))
vi.mock('../features/map/services/googlePlaceDetails', () => ({ fetchGooglePlaceDetails: mocks.details, placeDetailsQuery: (s: string) => s, searchNearbyGooglePlaceCandidates: vi.fn() }))
import { buildGeneratedSingleDay } from '../features/itinerary/services/itineraryGenerate'
import { DEFAULT_RECOMMENDATION_PREFERENCES } from '../features/place/services/recommendationPreferences'
import type { SelectedHotel } from '../types'

describe('route before optional enrichment', () => {
  it('preserves the verified identity when a candidate maps to a built-in landmark', async () => {
    mocks.details.mockClear()
    const candidate = { id: 'ChIVerifiedTower', name: 'Arc de Triomphe', type: 'attraction' as const, location: { lat: 48.8584, lng: 2.2945 }, openingSchedule: {} }
    mocks.rank.mockResolvedValue([candidate])
    mocks.generate.mockResolvedValue({ day: { day: 2, title: 'Tower', theme: 'Landmark', pace: 'relaxed', stops: [{ placeKey: 'p0', time: '10:00', duration: '60 min', note: 'Visit' }] }, places: [{ key: 'p0', googlePlaceId: candidate.id, name: candidate.name, type: candidate.type }] })
    const result = await buildGeneratedSingleDay({ fast: true, destination: 'Paris', dayCount: 3, dayNumber: 2,
      tripStartDate: '2026-10-12', tripEndDate: '2026-10-14', itineraryStartDate: '2026-10-12',
      hotel: { id: 'test', name: 'Hotel', lat: 48.86, lng: 2.35, areaKey: 'marais' } as SelectedHotel,
      existingDays: [], existingCustomPlaces: {}, occupiedPlaces: [], verifiedCandidates: [candidate], recommendationPreferences: DEFAULT_RECOMMENDATION_PREFERENCES,
    })
    const id = result.days.find(day => day.day === 2)!.stops[0].placeId
    expect(id).toBe('attr-arc')
    expect(result.customPlaces[id].googlePlaceId).toBe(candidate.id)
    expect(mocks.details).not.toHaveBeenCalled()
  })
  it('publishes real candidate coordinates without awaiting details and hydrates later', async () => {
    const candidate = { id: 'ChITestEnrichment', name: 'Verified Cafe', type: 'cafe' as const, location: { lat: 48.87, lng: 2.36 }, address: 'Verified address', openingSchedule: {} }
    mocks.rank.mockResolvedValue([candidate])
    mocks.generate.mockResolvedValue({ day: { day: 2, title: 'Walk', theme: 'Coffee', pace: 'relaxed', summary: '', stops: [{ placeKey: 'p0', time: '10:00', note: 'Coffee' }] }, places: [{ key: 'p0', googlePlaceId: candidate.id, name: candidate.name, type: 'cafe' }] })
    mocks.details.mockResolvedValue({ id: candidate.id, name: candidate.name, location: candidate.location, summary: 'More detail', rating: 4.8 })
    const result = await buildGeneratedSingleDay({ fast: true, destination: 'Paris', dayCount: 3, dayNumber: 2,
      tripStartDate: '2026-10-12', tripEndDate: '2026-10-14', itineraryStartDate: '2026-10-12',
      hotel: { id: 'test', name: 'Hotel', lat: 48.86, lng: 2.35, areaKey: 'marais' } as SelectedHotel,
      existingDays: [], existingCustomPlaces: {}, occupiedPlaces: [], verifiedCandidates: [candidate], recommendationPreferences: DEFAULT_RECOMMENDATION_PREFERENCES,
    })
    expect(mocks.details).not.toHaveBeenCalled()
    const day = result.days.find((d) => d.day === 2)!
    const place = result.customPlaces[day.stops[0].placeId]
    expect(place).toMatchObject({ name: candidate.name, location: candidate.location, googleAddress: candidate.address })
    expect(result.enrich).toBeTypeOf('function')
    const enriched = await result.enrich!()
    expect(mocks.details).toHaveBeenCalledTimes(1)
    expect(enriched[place.id]).toMatchObject({ id: place.id, googleRating: 4.8, location: candidate.location })
  })
})

it('filters arbitrary closed venues before the model and repairs a closed time slot once', async () => {
  mocks.details.mockClear()
  const rows = [
    { id: 'ChIClosed', name: 'Tuesday closed gallery', type: 'attraction' as const, location: { lat: 48.87, lng: 2.36 }, openingSchedule: { regular: { periods: [{ open: { day: 1, hour: 9 }, close: { day: 1, hour: 17 } }] } } },
    { id: 'ChILate', name: 'Afternoon gallery', type: 'attraction' as const, location: { lat: 48.88, lng: 2.36 }, openingSchedule: { regular: { periods: [{ open: { day: 2, hour: 14 }, close: { day: 2, hour: 18 } }] } } },
    { id: 'ChIOpen', name: 'All day gallery', type: 'attraction' as const, location: { lat: 48.89, lng: 2.36 }, openingSchedule: { regular: { periods: [{ open: { day: 2, hour: 9 }, close: { day: 2, hour: 18 } }] } } },
  ]
  mocks.rank.mockClear().mockImplementation(async candidates => candidates.slice(0, 1))
  mocks.generate.mockReset().mockImplementation(async input => {
    const row = input.verifiedCandidates[0]
    return { day: { day: 2, title: 'Gallery', pace: 'relaxed', stops: [{ placeKey: 'p0', time: '10:00', duration: '60 min', note: 'Visit' }] }, places: [{ key: 'p0', googlePlaceId: row.id, name: row.name, type: row.type }] }
  })
  const result = await buildGeneratedSingleDay({ fast: true, destination: 'Paris', dayCount: 3, dayNumber: 2,
    tripStartDate: '2026-10-12', tripEndDate: '2026-10-14', itineraryStartDate: '2026-10-12',
    hotel: { id: 'test', name: 'Hotel', lat: 48.86, lng: 2.35, areaKey: 'marais' } as SelectedHotel,
    existingDays: [], existingCustomPlaces: {}, occupiedPlaces: [], verifiedCandidates: rows, recommendationPreferences: DEFAULT_RECOMMENDATION_PREFERENCES,
  })
  expect(mocks.generate).toHaveBeenCalledTimes(2)
  expect(mocks.generate.mock.calls[0][0].verifiedCandidates.map((r: { id: string }) => r.id)).toEqual(['ChILate'])
  expect(mocks.rank).toHaveBeenCalledTimes(1)
  expect(mocks.generate.mock.calls[1][0].openingRepair.rejectedVisits[0]).toMatchObject({ name: 'Afternoon gallery', time: '10:00', openingWindows: ['14:00–18:00'] })
  const day = result.days.find(d => d.day === 2)!
  expect(result.customPlaces[day.stops[0].placeId].googlePlaceId).toBe('ChIOpen')
  expect(mocks.details).not.toHaveBeenCalled()
})

it('never publishes a route after the model repeatedly ignores opening hours', async () => {
  const candidate = { id: 'ChIClosedSlot', name: 'Evening only venue', type: 'attraction' as const, location: { lat: 48.87, lng: 2.36 }, openingSchedule: { regular: { periods: [{ open: { day: 2, hour: 18 }, close: { day: 2, hour: 23 } }] } } }
  mocks.rank.mockImplementation(async candidates => candidates)
  mocks.generate.mockReset().mockResolvedValue({ day: { day: 2, title: 'Invalid morning', pace: 'relaxed', stops: [{ placeKey: 'p0', time: '10:00', duration: '1 hour', note: 'Visit' }] }, places: [{ key: 'p0', name: candidate.name, googlePlaceId: candidate.id, type: 'attraction' }] })
  const originalDays = [{ day: 2, title: 'Keep me', stops: [] }]
  await expect(buildGeneratedSingleDay({ fast: true, destination: 'Paris', dayCount: 3, dayNumber: 2,
    tripStartDate: '2026-10-12', tripEndDate: '2026-10-14', itineraryStartDate: '2026-10-12',
    hotel: { id: 'test', name: 'Hotel', lat: 48.86, lng: 2.35, areaKey: 'marais' } as SelectedHotel,
    existingDays: originalDays as never, existingCustomPlaces: {}, occupiedPlaces: [], verifiedCandidates: [candidate], recommendationPreferences: DEFAULT_RECOMMENDATION_PREFERENCES,
  })).rejects.toThrow()
  expect(mocks.generate).toHaveBeenCalledTimes(1) // No available replacement: fail before another paid call.
  expect(originalDays).toEqual([{ day: 2, title: 'Keep me', stops: [] }])
})
