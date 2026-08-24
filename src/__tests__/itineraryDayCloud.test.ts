import { describe, expect, it } from 'vitest'
import type { DayPlan } from '../types'
import {
  dayCloudDiffIsEmpty,
  daysToMap,
  hashDayPlan,
  mapToDays,
  peekDayCloudDiff,
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

  it('records removed days as deletes', () => {
    const last = {
      '1': hashDayPlan(day(1, 'Louvre')),
      '2': hashDayPlan(day(2, 'Versailles')),
    }
    const diff = peekDayCloudDiff([day(1, 'Louvre')], last)
    expect(diff.deletes).toEqual(['2'])
    expect(Object.keys(diff.upserts)).toEqual([])
  })

  it('round-trips a day map in numeric order', () => {
    const days = [day(3, 'C'), day(1, 'A')]
    expect(mapToDays(daysToMap(days)).map((d) => d.day)).toEqual([1, 3])
  })
})
