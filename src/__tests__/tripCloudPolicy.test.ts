import { describe, expect, it } from 'vitest'
import type { HotelCacheState } from '../features/hotel/services/hotelCache'
import {
  hotelCompareJson,
  hotelForCloud,
  planRemoteApply,
  snapshotCompareJson,
} from '../features/cloud-sync/services/tripCloudPolicy'
import { emptyTripSnapshot, type TripSnapshot } from '../features/cloud-sync/services/tripSnapshot'

const hotel = {
  candidates: [],
  selected: null,
  model: 'x',
  batch: 1,
  fetchedAt: 1,
  othersCollapsed: false,
} satisfies HotelCacheState

describe('tripCloudPolicy', () => {
  it('strips hotel UI fields from cloud identity', () => {
    const a = hotelForCloud({ ...hotel, fetchedAt: 1, othersCollapsed: true })
    const b = hotelForCloud({ ...hotel, fetchedAt: 99, othersCollapsed: false })
    expect(a).toEqual(b)
    expect(hotelCompareJson({ ...hotel, fetchedAt: 1 })).toBe(
      hotelCompareJson({ ...hotel, fetchedAt: 50, othersCollapsed: true }),
    )
  })

  it('ignores map routes and llm artifacts when comparing snapshots', () => {
    const base = emptyTripSnapshot()
    const a = snapshotCompareJson({
      ...base,
      destination: 'Paris',
      mapRoutes: { leftover: true } as unknown as TripSnapshot['mapRoutes'],
      llmArtifacts: { 'place-detail:x': { value: 1, generatedAt: 1 } },
      hotel: { ...hotel, fetchedAt: 1 },
    })
    const b = snapshotCompareJson({
      ...base,
      destination: 'Paris',
      mapRoutes: {},
      llmArtifacts: {},
      hotel: { ...hotel, fetchedAt: 9, othersCollapsed: true },
    })
    expect(a).toBe(b)
  })

  it('ignores itinerary day bodies when comparing core snapshots', () => {
    const base = emptyTripSnapshot()
    const itinerary = {
      days: [{ day: 1, title: 'A', theme: '', pace: 'moderate' as const, summary: '', metroHintFromArea: {}, stops: [] }],
      customPlaces: {},
      generated: true,
    }
    const a = snapshotCompareJson({
      ...base,
      itinerary,
    })
    const b = snapshotCompareJson({
      ...base,
      itinerary: {
        ...itinerary,
        days: [{ ...itinerary.days[0], title: 'B' }],
      },
    })
    expect(a).toBe(b)
  })

  it('plans remote apply for two editors and artifact-only updates', () => {
    expect(
      planRemoteApply({
        remoteNewer: true,
        artifactsRevChanged: true,
        daysRevChanged: false,
        coreSame: true,
        localCoreDirty: false,
      }),
    ).toBe('artifacts-only')

    expect(
      planRemoteApply({
        remoteNewer: true,
        artifactsRevChanged: false,
        daysRevChanged: true,
        coreSame: true,
        localCoreDirty: false,
      }),
    ).toBe('days-only')

    expect(
      planRemoteApply({
        remoteNewer: true,
        artifactsRevChanged: false,
        daysRevChanged: false,
        coreSame: false,
        localCoreDirty: true,
      }),
    ).toBe('keep-local')

    expect(
      planRemoteApply({
        remoteNewer: true,
        artifactsRevChanged: false,
        daysRevChanged: false,
        coreSame: false,
        localCoreDirty: false,
      }),
    ).toBe('apply-core')

    expect(
      planRemoteApply({
        remoteNewer: false,
        artifactsRevChanged: false,
        daysRevChanged: false,
        coreSame: false,
        localCoreDirty: false,
      }),
    ).toBe('ignore')
  })

})
