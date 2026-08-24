import { describe, expect, it } from 'vitest'
import type { DayPlan } from '../types'
import {
  dayCloudDiffIsEmpty,
  daysToMap,
  hashDayPlan,
  mapToDays,
  peekDayCloudDiff,
  knownHashesForPresentDays,
} from '../features/cloud-sync/services/itineraryDayCloud'

const day = (n: number, title: string): DayPlan => ({
  day: n,
  title,
  theme: '',
  pace: 'moderate',
  summary: '',
  metroHintFromArea: {},
  stops: [],
})

describe('itineraryDayCloud', () => {
  it('hashes day plans stably and changes when content changes', () => {
    const a = hashDayPlan(day(1, 'Louvre'))
    const b = hashDayPlan(day(1, 'Louvre'))
    const c = hashDayPlan(day(1, 'Orsay'))
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    expect(a.length).toBeLessThan(16)
  })

  it('only diffs days whose content or presence changed', () => {
    const last = {
      '1': hashDayPlan(day(1, 'Louvre')),
      '2': hashDayPlan(day(2, 'Versailles')),
    }
    const diff = peekDayCloudDiff(
      [day(1, 'Louvre'), day(2, 'Montmartre')],
      last,
    )
    expect(Object.keys(diff.upserts)).toEqual(['2'])
    expect(diff.deletes).toEqual([])
    expect(dayCloudDiffIsEmpty(peekDayCloudDiff([day(1, 'Louvre'), day(2, 'Versailles')], last))).toBe(
      true,
    )
  })

  it('records removed days as deletes when the trip is actually shorter', () => {
    const last = {
      '1': hashDayPlan(day(1, 'Louvre')),
      '2': hashDayPlan(day(2, 'Versailles')),
    }
    const diff = peekDayCloudDiff([day(1, 'Louvre')], last, { expectedDayCount: 1 })
    expect(diff.deletes).toEqual(['2'])
    expect(Object.keys(diff.upserts)).toEqual([])
  })

  it('does not delete other days after a partial hydrate', () => {
    const last = {
      '1': hashDayPlan(day(1, 'Louvre')),
      '2': hashDayPlan(day(2, 'Versailles')),
      '3': hashDayPlan(day(3, 'Marais')),
    }
    const diff = peekDayCloudDiff([day(1, 'Louvre + cafe')], last, {
      expectedDayCount: 3,
    })
    expect(Object.keys(diff.upserts)).toEqual(['1'])
    expect(diff.deletes).toEqual([])
  })

  it('does not treat an empty local plan as deleting every day', () => {
    const last = {
      '1': hashDayPlan(day(1, 'Louvre')),
      '2': hashDayPlan(day(2, 'Versailles')),
    }
    const diff = peekDayCloudDiff([], last, { expectedDayCount: 2 })
    expect(diff.deletes).toEqual([])
    expect(Object.keys(diff.upserts)).toEqual([])
  })

  it('round-trips a day map in numeric order', () => {
    const days = [day(3, 'C'), day(1, 'A')]
    expect(mapToDays(daysToMap(days)).map((d) => d.day)).toEqual([1, 3])
  })

  it('only reports known hashes for days still present locally', () => {
    const last = {
      '1': hashDayPlan(day(1, 'Louvre')),
      '2': hashDayPlan(day(2, 'Versailles')),
    }
    expect(knownHashesForPresentDays([day(1, 'Louvre')], last)).toEqual({
      '1': last['1'],
    })
    expect(knownHashesForPresentDays([], last)).toEqual({})
  })
})
