import { afterEach, expect, it, vi } from 'vitest'
vi.mock('../features/map/services/googlePlaceDetails', () => ({ fetchGooglePlaceDetails: vi.fn(async () => null) }))
import { validateDayOpeningHours } from '../features/itinerary/services/validateOpeningHours'
import { setLocale } from '../shared/i18n'
import type { DayPlan, Place } from '../types'
import type { VerifiedPlaceCandidate } from '../shared/services/llm/types'
afterEach(() => setLocale('zh-CN', { persist: false }))
it.each(['en', 'zh-CN'] as const)('marks missing hours as unverified in %s instead of claiming open', async locale => {
  setLocale(locale, { persist: false })
  const place = { id: 'p', name: 'Venue', type: 'attraction', location: { lat: 48, lng: 2 } } as Place
  const day = { day: 1, stops: [{ id: 's', placeId: 'p', time: '10:00', duration: '60 min', note: '' }] } as DayPlan
  expect(await validateDayOpeningHours(day, '2026-10-13', { p: place }, [{ id: 'p', name: 'Venue', type: 'attraction', openingSchedule: {} }])).toEqual([])
  expect(day.stops[0].note).toBe(locale === 'en' ? 'Opening hours need confirmation for this date.' : '当天营业时间待确认。')
})

it.each(['en', 'zh-CN'] as const)('fits a full visit into a later split window without moving surrounding stops (%s)', async locale => {
  setLocale(locale, { persist: false })
  const venue = { id: 'p', name: 'Generic gallery', type: 'attraction' } as Place
  const hotel = { id: 'hotel', name: 'Hotel', type: 'hotel' } as Place
  const airport = { id: 'airport', name: 'Return hotel', type: 'hotel' } as Place
  const candidate: VerifiedPlaceCandidate = { id: 'p', name: venue.name, type: 'attraction', openingSchedule: { regular: { periods: [
    { open: { day: 2, hour: 9 }, close: { day: 2, hour: 12 } },
    { open: { day: 2, hour: 14 }, close: { day: 2, hour: 18 } },
  ] } } }
  const day = { day: 2, stops: [
    { placeId: 'hotel', time: '10:00', duration: '60 min', note: '' },
    { placeId: 'p', time: '12:00', duration: '90 min', note: '' },
    { placeId: 'airport', time: '16:00', duration: '60 min', note: '' },
  ] } as DayPlan
  expect(await validateDayOpeningHours(day, '2026-10-13', { p: venue, hotel, airport }, [candidate], undefined, true, '10:00')).toEqual([])
  expect(day.stops.map(stop => stop.time)).toEqual(['10:00', '14:00', '16:00'])
  expect(day.stops[1].duration).toBe('90 min')
  expect(day.stops[1].note).toBe(locale === 'en' ? 'Visit time adjusted to opening hours.' : '已按营业时间调整到访时间。')
})

it('keeps an impossible visit rejected rather than shortening it or moving the flight', async () => {
  const venue = { id: 'p', name: 'Gallery', type: 'attraction' } as Place
  const airport = { id: 'airport', name: 'Airport', type: 'transport' } as Place
  const candidate: VerifiedPlaceCandidate = { id: 'p', name: venue.name, type: 'attraction', openingSchedule: { regular: { periods: [
    { open: { day: 2, hour: 14 }, close: { day: 2, hour: 18 } },
  ] } } }
  const day = { day: 2, stops: [
    { placeId: 'p', time: '12:00', duration: '90 min', note: '' },
    { placeId: 'airport', time: '16:00', duration: '60 min', note: '' },
  ] } as DayPlan
  expect(await validateDayOpeningHours(day, '2026-10-13', { p: venue, airport }, [candidate], undefined, true)).toEqual([venue])
  expect(day.stops.map(stop => stop.time)).toEqual(['12:00', '16:00'])
})

it('fits linked visits together while retaining their order, durations and hotel anchor', async () => {
  const gallery = { id: 'gallery', name: 'Gallery', type: 'attraction' } as Place
  const lunch = { id: 'lunch', name: 'Lunch', type: 'restaurant' } as Place
  const hotel = { id: 'hotel', name: 'Hotel', type: 'hotel' } as Place
  const candidates: VerifiedPlaceCandidate[] = [
    { id: 'gallery', name: gallery.name, type: 'attraction', openingSchedule: { regular: { periods: [{ open: { day: 2, hour: 10 }, close: { day: 2, hour: 18 } }] } } },
    { id: 'lunch', name: lunch.name, type: 'restaurant', openingSchedule: { regular: { periods: [{ open: { day: 2, hour: 12 }, close: { day: 2, hour: 14 } }] } } },
  ]
  const day = { day: 2, stops: [
    { placeId: 'gallery', time: '11:00', duration: '120 min', note: '' },
    { placeId: 'lunch', time: '13:30', duration: '60 min', note: '' },
    { placeId: 'hotel', time: '16:00', duration: '60 min', note: '' },
  ] } as DayPlan
  expect(await validateDayOpeningHours(day, '2026-10-13', { gallery, lunch, hotel }, candidates, undefined, true, '10:00')).toEqual([])
  expect(day.stops.map(stop => [stop.placeId, stop.time, stop.duration])).toEqual([
    ['gallery', '10:30', '120 min'], ['lunch', '13:00', '60 min'], ['hotel', '16:00', '60 min'],
  ])
})
