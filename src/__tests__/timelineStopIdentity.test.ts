import { describe, expect, it } from 'vitest'
import type { ItineraryStop } from '../types'
import {
  isKeySetReordered,
  timelineStopIdentities,
} from '../features/itinerary/utils/timelineStopIdentity'

const stop = (placeId: string, id?: string): ItineraryStop => ({
  id,
  placeId,
  time: '10:00',
  note: '',
  transport: '',
  walkLevel: 'minimal',
  duration: '',
})

describe('timeline stop identity', () => {
  it('keeps legacy stop match keys stable when places exchange positions', () => {
    const before = timelineStopIdentities(2, [stop('a'), stop('b'), stop('c')])
    const after = timelineStopIdentities(2, [stop('b'), stop('a'), stop('c')])

    expect(before.map((item) => item.matchKey)).toEqual([
      'd2-a-occ0',
      'd2-b-occ0',
      'd2-c-occ0',
    ])
    expect(after.map((item) => item.matchKey)).toEqual([
      'd2-b-occ0',
      'd2-a-occ0',
      'd2-c-occ0',
    ])
    expect(
      isKeySetReordered(
        before.map((item) => item.matchKey),
        after.map((item) => item.matchKey),
      ),
    ).toBe(true)
  })

  it('uses explicit ids for rendering and distinguishes repeated places', () => {
    const identities = timelineStopIdentities(1, [
      stop('hotel', 'check-in'),
      stop('museum', 'museum-stop'),
      stop('hotel', 'overnight'),
    ])

    expect(identities.map((item) => item.renderKey)).toEqual([
      'check-in',
      'museum-stop',
      'overnight',
    ])
    expect(identities.map((item) => item.matchKey)).toEqual([
      'd1-hotel-occ0',
      'd1-museum-occ0',
      'd1-hotel-occ1',
    ])
  })

  it('does not classify insertion, removal, or duplicates as a reorder', () => {
    expect(isKeySetReordered(['a', 'b'], ['b', 'a', 'c'])).toBe(false)
    expect(isKeySetReordered(['a', 'b'], ['b'])).toBe(false)
    expect(isKeySetReordered(['a', 'a'], ['a', 'a'])).toBe(false)
  })
})
