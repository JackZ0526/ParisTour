import { describe, expect, it } from 'vitest'
import type { DayPlan, ItineraryStop, Place } from '../types'
import { applyItineraryMutation } from '../features/cloud-sync/v2/itineraryMutationReducer'
import type { TripMutation } from '../features/cloud-sync/v2/mutationTypes'

const makeStop = (id: string, placeId = id): ItineraryStop & { id: string } => ({
  id,
  placeId,
  time: '10:00',
  note: '',
})

const makePlace = (id: string): Place => ({
  id,
  name: id,
  type: 'attraction',
  description: id,
  ratingHint: '',
  image: '',
  location: { lat: 48.8, lng: 2.3 },
  googleMapsUrl: '',
})

const makeDay = (day: number, stops: ItineraryStop[]): DayPlan => ({
  day,
  title: `D${day}`,
  theme: '',
  pace: 'moderate',
  summary: '',
  metroHintFromArea: {},
  stops,
})

function mutation<T extends TripMutation['type']>(
  type: T,
  payload: Extract<TripMutation, { type: T }>['payload'],
): Extract<TripMutation, { type: T }> {
  return {
    protocol: 2,
    mutationId: `${type}-1`,
    tripId: 'trip-1',
    deviceId: 'device-1',
    baseRevision: 0,
    createdAt: '2026-08-26T00:00:00.000Z',
    type,
    payload,
  } as Extract<TripMutation, { type: T }>
}

describe('itineraryMutationReducer', () => {
  it('adds once and treats a retried mutation as idempotent', () => {
    const document = { days: [makeDay(2, [makeStop('a'), makeStop('c')])], customPlaces: {} }
    const add = mutation('stop.add', {
      dayNumber: 2,
      stop: makeStop('b'),
      place: makePlace('b'),
      afterStopId: 'a',
    })
    const first = applyItineraryMutation(document, add)
    const retried = applyItineraryMutation(first.document, add)

    expect(first.document.days[0].stops.map((stop) => stop.id)).toEqual(['a', 'b', 'c'])
    expect(first.document.customPlaces.b?.name).toBe('b')
    expect(retried.changed).toBe(false)
    expect(retried.ignoredReason).toBe('duplicate')
  })

  it('moves by stable anchors instead of stale array indexes', () => {
    const document = {
      days: [makeDay(2, [makeStop('a'), makeStop('b'), makeStop('c')])],
      customPlaces: {},
    }
    const result = applyItineraryMutation(
      document,
      mutation('stop.move', {
        stopId: 'c',
        targetDayNumber: 2,
        beforeStopId: 'a',
      }),
      'remote',
    )

    expect(result.document.days[0].stops.map((stop) => stop.id)).toEqual(['c', 'a', 'b'])
    expect(result.animation).toMatchObject({ type: 'move', stopId: 'c', fromDayNumber: 2 })
  })

  it('keeps the stop entity id stable when replacing its place', () => {
    const document = { days: [makeDay(3, [makeStop('a', 'old')])], customPlaces: {} }
    const replacement = makePlace('new')
    const result = applyItineraryMutation(
      document,
      mutation('stop.replace', {
        stopId: 'a',
        place: replacement,
        patch: { note: 'new note' },
      }),
    )

    expect(result.document.days[0].stops[0]).toMatchObject({
      id: 'a',
      placeId: 'new',
      note: 'new note',
    })
  })

  it('makes repeated deletes safe no-ops', () => {
    const document = { days: [makeDay(2, [makeStop('a'), makeStop('b')])], customPlaces: {} }
    const remove = mutation('stop.delete', { stopId: 'a' })
    const first = applyItineraryMutation(document, remove)
    const second = applyItineraryMutation(first.document, remove)

    expect(first.document.days[0].stops.map((stop) => stop.id)).toEqual(['b'])
    expect(second.changed).toBe(false)
    expect(second.ignoredReason).toBe('entity_missing')
  })

  it('deletes a stop addressed by ensureStopId when explicit id is absent', () => {
    const document = {
      days: [
        makeDay(2, [
          { placeId: 'louvre', time: '09:00', note: '' },
          makeStop('b'),
        ]),
      ],
      customPlaces: {},
    }
    const result = applyItineraryMutation(
      document,
      mutation('stop.delete', { stopId: 'd2-louvre-0' }),
    )
    expect(result.changed).toBe(true)
    expect(result.document.days[0].stops.map((stop) => stop.id)).toEqual(['b'])
  })

  it('deletes a default stop when ensureStopId index drifted but placeId is unique', () => {
    const document = {
      days: [
        makeDay(2, [
          { ...makeStop('a'), placeId: 'hotel' },
          { id: 'd2-louvre-4', placeId: 'louvre', time: '10:00', note: '' },
          makeStop('c'),
        ]),
      ],
      customPlaces: {},
    }
    // Peer still addresses the stop by an older index-suffixed id.
    const result = applyItineraryMutation(
      document,
      mutation('stop.delete', { stopId: 'd2-louvre-1' }),
    )
    expect(result.changed).toBe(true)
    expect(result.document.days[0].stops.map((stop) => stop.placeId)).toEqual([
      'hotel',
      'c',
    ])
  })

  it('deletes via placeId hint when stopId is unknown', () => {
    const document = {
      days: [
        makeDay(2, [
          makeStop('a'),
          { id: 'server-row-9', placeId: 'louvre', time: '10:00', note: '' },
        ]),
      ],
      customPlaces: {},
    }
    const result = applyItineraryMutation(
      document,
      mutation('stop.delete', {
        stopId: 'd2-louvre-99',
        dayNumber: 2,
        placeId: 'louvre',
      }),
    )
    expect(result.changed).toBe(true)
    expect(result.document.days[0].stops.map((stop) => stop.id)).toEqual(['a'])
  })

  it('rejects a move that anchors a stop to itself', () => {
    const document = {
      days: [makeDay(2, [makeStop('a'), makeStop('b')])],
      customPlaces: {},
    }
    const result = applyItineraryMutation(
      document,
      mutation('stop.move', {
        stopId: 'a',
        targetDayNumber: 2,
        afterStopId: 'a',
      }),
    )
    expect(result.changed).toBe(false)
    expect(result.ignoredReason).toBe('invalid_anchor')
  })

  it('moves a stop across days by target day number', () => {
    const document = {
      days: [makeDay(1, [makeStop('a'), makeStop('b')]), makeDay(2, [makeStop('c')])],
      customPlaces: {},
    }
    const result = applyItineraryMutation(
      document,
      mutation('stop.move', {
        stopId: 'b',
        targetDayNumber: 2,
        afterStopId: 'c',
      }),
    )
    expect(result.document.days[0].stops.map((stop) => stop.id)).toEqual(['a'])
    expect(result.document.days[1].stops.map((stop) => stop.id)).toEqual(['c', 'b'])
  })

  it('replaces a day and the whole itinerary transactionally', () => {
    const document = {
      days: [makeDay(1, [makeStop('a')])],
      customPlaces: { a: makePlace('a') },
    }
    const replacedDay = applyItineraryMutation(
      document,
      mutation('day.replace', {
        dayNumber: 1,
        day: makeDay(1, [makeStop('x')]),
        places: { x: makePlace('x') },
      }),
    )
    expect(replacedDay.document.days[0].stops.map((stop) => stop.id)).toEqual(['x'])
    expect(replacedDay.document.customPlaces.x?.id).toBe('x')

    const cleared = applyItineraryMutation(
      replacedDay.document,
      mutation('itinerary.replace', { days: [], customPlaces: {} }),
    )
    expect(cleared.document.days).toEqual([])
    expect(cleared.document.customPlaces).toEqual({})
  })
})
