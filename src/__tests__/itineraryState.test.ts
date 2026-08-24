import { describe, expect, it } from 'vitest'
import type { DayPlan } from '../types'
import {
  isThinItineraryAgainstBaseline,
  itineraryStopCount,
} from '../features/itinerary/utils/itineraryState'

const day = (n: number, stops: number): DayPlan => ({
  day: n,
  title: `D${n}`,
  theme: '',
  pace: 'moderate',
  summary: '',
  metroHintFromArea: {},
  stops: Array.from({ length: stops }, (_, i) => ({
    id: `d${n}-${i}`,
    time: '10:00',
    placeId: `p${n}-${i}`,
    note: '',
    transport: '',
    walkLevel: 'minimal',
    duration: '',
  })),
})

describe('isThinItineraryAgainstBaseline', () => {
  const baseline = [day(1, 4), day(2, 6), day(3, 7), day(4, 7), day(5, 2), day(6, 2)]

  it('counts stops across days', () => {
    expect(itineraryStopCount(baseline)).toBe(28)
  })

  it('rejects an empty or stub regen against a full baseline', () => {
    expect(isThinItineraryAgainstBaseline([], baseline)).toBe(true)
    expect(
      isThinItineraryAgainstBaseline(
        [day(1, 7), day(2, 1), day(3, 1), day(4, 1), day(5, 1), day(6, 0)],
        baseline,
      ),
    ).toBe(true)
  })

  it('keeps a full plan and a modest edit', () => {
    expect(isThinItineraryAgainstBaseline(baseline, baseline)).toBe(false)
    const edited = [day(1, 4), day(2, 5), day(3, 7), day(4, 7), day(5, 2), day(6, 2)]
    expect(isThinItineraryAgainstBaseline(edited, baseline)).toBe(false)
  })
})
