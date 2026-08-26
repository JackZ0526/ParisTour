import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DayPlan } from '../types'
import {
  dayCloudDiffIsEmpty,
  daysToMap,
  hashDayPlan,
  mapToDays,
  peekDayCloudDiff,
  knownHashesForPresentDays,
  mergeCloudDays,
} from '../features/cloud-sync/services/itineraryDayCloud'
import { loadItineraryState, saveItineraryState } from '../features/itinerary/utils/itineraryState'

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
  beforeEach(() => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
      length: 0,
      key: () => null,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

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

  it('authoritative initial hydrate clears stale local days when cloud is empty', () => {
    saveItineraryState([day(1, 'Stale local plan')], {}, { generated: true })

    expect(mergeCloudDays({ upserts: {}, replace: true })).toBe(true)
    expect(loadItineraryState().days).toEqual([])
    expect(loadItineraryState().generated).toBe(false)
  })

  it('authoritative initial hydrate replaces rather than merges another trip', () => {
    saveItineraryState([day(1, 'Old trip'), day(2, 'Old day 2')], {}, { generated: true })

    expect(
      mergeCloudDays({
        upserts: daysToMap([day(1, 'Cloud trip')]),
        replace: true,
      }),
    ).toBe(true)
    expect(loadItineraryState().days.map((plan) => plan.title)).toEqual(['Cloud trip'])
  })
})
