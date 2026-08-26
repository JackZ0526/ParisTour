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

  it('animates by place occurrence and mutates by durable action ids', () => {
    const identities = timelineStopIdentities(1, [
      stop('hotel', 'check-in'),
      stop('museum', 'museum-stop'),
      stop('hotel', 'overnight'),
    ])

    // renderKey === matchKey so rewriting stop.id (default itinerary) is not a
    // fake delete + re-add on the peer.
    expect(identities.map((item) => item.renderKey)).toEqual([
      'd1-hotel-occ0',
      'd1-museum-occ0',
      'd1-hotel-occ1',
    ])
    expect(identities.map((item) => item.matchKey)).toEqual([
      'd1-hotel-occ0',
      'd1-museum-occ0',
      'd1-hotel-occ1',
    ])
    expect(identities.map((item) => item.actionId)).toEqual([
      'check-in',
      'museum-stop',
      'overnight',
    ])
  })

  it('keeps render keys stable when index-suffixed default ids rewrite', () => {
    const before = timelineStopIdentities(2, [
      stop('louvre', 'd2-louvre-0'),
      stop('arc', 'd2-arc-1'),
      stop('seine', 'd2-seine-2'),
    ])
    // Peer delete of another stop + restamp looks like index drift on ids.
    const after = timelineStopIdentities(2, [
      stop('louvre', 'd2-louvre-0'),
      stop('seine', 'd2-seine-1'),
    ])

    expect(before.map((item) => item.renderKey)).toEqual([
      'd2-louvre-occ0',
      'd2-arc-occ0',
      'd2-seine-occ0',
    ])
    expect(after.map((item) => item.renderKey)).toEqual([
      'd2-louvre-occ0',
      'd2-seine-occ0',
    ])
    expect(before.map((item) => item.renderKey).filter((key) => !after.some((item) => item.renderKey === key))).toEqual([
      'd2-arc-occ0',
    ])
  })

  it('does not classify insertion, removal, or duplicates as a reorder', () => {
    expect(isKeySetReordered(['a', 'b'], ['b', 'a', 'c'])).toBe(false)
    expect(isKeySetReordered(['a', 'b'], ['b'])).toBe(false)
    expect(isKeySetReordered(['a', 'a'], ['a', 'a'])).toBe(false)
  })
})
