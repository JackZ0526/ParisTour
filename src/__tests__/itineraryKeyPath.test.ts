import { describe, expect, it } from 'vitest'

import { ensureStopId, syncDaysCopyToHotelArea } from '../appHelpers'
import {
  fingerprintTripInputsEqual,
  fingerprintsEqual,
} from '../features/itinerary/utils/itineraryState'

describe('key-path helpers', () => {
  it('ensureStopId prefers explicit stop.id', () => {
    const stop = { id: 'explicit-stop', placeId: 'place-a', time: '12:00' } as any
    expect(ensureStopId(3, stop, 0)).toBe('explicit-stop')
  })

  it('ensureStopId generates stable fallback when id missing', () => {
    const stop = { placeId: 'place-a', time: '12:00' } as any
    expect(ensureStopId(2, stop, 4)).toBe('d2-place-a-4')
  })

  it('syncDaysCopyToHotelArea rewrites wrong district mentions', () => {
    const days = [
      {
        day: 1,
        title: 't',
        theme: '以玛黑为落脚点',
        pace: 'moderate',
        summary: '落脚于玛黑，今晚散步。',
        stops: [],
      },
    ] as any

    const next = syncDaysCopyToHotelArea(days, 'opera')
    expect(next[0].theme).toContain('歌剧院一带')
    expect(next[0].summary).toContain('歌剧院一带')
  })

  it('fingerprintsEqual compares full identity fields', () => {
    const a = {
      hotelId: 'h1',
      startDate: '2026-01-01',
      endDate: '2026-01-02',
      itineraryStartDate: '2026-01-02',
      outboundFlight: 'CDG-AAA',
      returnFlight: 'BBB-CDG',
    }
    const b = { ...a }
    const c = { ...a, returnFlight: 'DIFF' }

    expect(fingerprintsEqual(a, b)).toBe(true)
    expect(fingerprintsEqual(a, c)).toBe(false)
  })

  it('fingerprintTripInputsEqual ignores itineraryStartDate', () => {
    const a = {
      hotelId: 'h1',
      startDate: '2026-01-01',
      endDate: '2026-01-02',
      itineraryStartDate: '2026-01-02',
      outboundFlight: 'CDG-AAA',
      returnFlight: 'BBB-CDG',
    }
    const b = { ...a, itineraryStartDate: '2026-01-03' }

    expect(fingerprintTripInputsEqual(a, b)).toBe(true)
  })
})

