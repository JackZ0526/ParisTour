import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  mergeCloudDays,
  daysToMap,
  hashDayPlan,
} from '../features/cloud-sync/services/itineraryDayCloud'
import {
  planRemoteApply,
} from '../features/cloud-sync/services/tripCloudPolicy'
import { loadItineraryState, saveItineraryState } from '../features/itinerary/utils/itineraryState'
import { SELECTED_HOTEL_PLACE_ID } from '../features/itinerary/utils/dayOrigin'
import type { DayPlan, ItineraryStop, Place } from '../types'

const makeStop = (placeId: string, time: string): ItineraryStop => ({
  placeId,
  time,
  note: '',
})

const makeDay = (n: number, title: string, stops: ItineraryStop[] = []): DayPlan => ({
  day: n,
  title,
  theme: '',
  pace: 'moderate',
  summary: '',
  metroHintFromArea: {},
  stops,
})

const makePlace = (id: string, name: string): Place => ({
  id,
  name,
  type: 'attraction',
  location: { lat: 48.8584, lng: 2.2945 },
  description: name,
  ratingHint: '4.8',
  image: '',
  googleMapsUrl: '',
})

describe('tripCloud realtime stop deletion & synchronization', () => {
  let store: Map<string, string>

  beforeEach(() => {
    store = new Map<string, string>()
    const storageMock = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, val: string) => {
        store.set(key, val)
      },
      removeItem: (key: string) => {
        store.delete(key)
      },
      clear: () => store.clear(),
      length: 0,
      key: () => null,
    }
    vi.stubGlobal('localStorage', storageMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('merges remote stop deletion into local state when client is idle', () => {
    // 1. Initial state on mobile has Hotel + 3 stops on Day 1
    const hotelStop = makeStop(SELECTED_HOTEL_PLACE_ID, '08:00')
    const stop1 = makeStop('place-1', '09:00')
    const stop2 = makeStop('place-2', '11:00')
    const stop3 = makeStop('place-3', '14:00')
    const localDay1 = makeDay(1, 'Louvre & Marais', [hotelStop, stop1, stop2, stop3])
    saveItineraryState([localDay1], {}, { generated: true })

    // 2. Desktop deleted stop2 ('place-2') and uploaded the new Day 1 with 2 places + hotel
    const remoteDay1 = makeDay(1, 'Louvre & Marais', [hotelStop, stop1, stop3])
    const remoteUpserts = daysToMap([remoteDay1])

    // 3. Mobile receives realtime update: since client is idle, skipKeys is empty
    const applied = mergeCloudDays({
      upserts: remoteUpserts,
      deletes: [],
      skipKeys: new Set(),
    })

    expect(applied).toBe(true)

    // 4. Verify that local storage itinerary was updated with the stop deleted
    const updated = loadItineraryState()
    expect(updated.days).toHaveLength(1)
    expect(updated.days[0].stops).toHaveLength(3) // hotel + place-1 + place-3
    expect(updated.days[0].stops.map((s) => s.placeId)).toEqual([
      SELECTED_HOTEL_PLACE_ID,
      'place-1',
      'place-3',
    ])
  })

  it('merges remote added place and preserves customPlaces dictionary', () => {
    const hotelStop = makeStop(SELECTED_HOTEL_PLACE_ID, '08:00')
    const stop1 = makeStop('place-1', '09:00')
    const localDay1 = makeDay(1, 'Louvre', [hotelStop, stop1])
    saveItineraryState([localDay1], { 'place-1': makePlace('place-1', 'Louvre') }, { generated: true })

    // Desktop adds a new place 'place-custom-new'
    const newPlace = makePlace('place-custom-new', 'Sainte-Chapelle')
    const stopNew = makeStop('place-custom-new', '11:30')
    const remoteDay1 = makeDay(1, 'Louvre & Sainte-Chapelle', [hotelStop, stop1, stopNew])

    // Simulate saving customPlaces on core apply
    saveItineraryState(loadItineraryState().days, {
      'place-1': makePlace('place-1', 'Louvre'),
      'place-custom-new': newPlace,
    })

    const applied = mergeCloudDays({
      upserts: daysToMap([remoteDay1]),
      deletes: [],
      skipKeys: new Set(),
    })

    expect(applied).toBe(true)
    const updated = loadItineraryState()
    expect(updated.days[0].stops).toHaveLength(3)
    expect(updated.days[0].stops[2].placeId).toBe('place-custom-new')
    expect(updated.customPlaces['place-custom-new']?.name).toBe('Sainte-Chapelle')
  })

  it('correctly decides days-only sync when core is omitted and days_rev changed', () => {
    const decision = planRemoteApply({
      remoteNewer: true,
      artifactsRevChanged: false,
      daysRevChanged: true,
      coreSame: true,
      localCoreDirty: false,
    })
    expect(decision).toBe('days-only')
  })

  it('does not falsely skip merging when remote hash differs from local hash on day 2', () => {
    const stop1 = makeStop('place-1', '09:00')
    const stop2 = makeStop('place-2', '11:00')
    const localDay2 = makeDay(2, 'Montmartre', [stop1, stop2])
    saveItineraryState([localDay2], {}, { generated: true })

    const remoteDay2 = makeDay(2, 'Montmartre', [stop1])
    expect(hashDayPlan(localDay2)).not.toBe(hashDayPlan(remoteDay2))

    const applied = mergeCloudDays({
      upserts: { '2': remoteDay2 },
      deletes: [],
      skipKeys: new Set(),
    })

    expect(applied).toBe(true)
    const result = loadItineraryState()
    expect(result.days[0].stops).toHaveLength(1)
    expect(result.days[0].stops[0].placeId).toBe('place-1')
  })
})
