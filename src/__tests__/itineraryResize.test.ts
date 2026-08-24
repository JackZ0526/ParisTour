import { describe, it, expect } from 'vitest'
import { resizeItineraryToLength, emptyItinerary } from '../features/itinerary/utils/itineraryState'
import type { DayPlan } from '../types'

describe('resizeItineraryToLength', () => {
  it('returns original array when length and day indices match exactly', () => {
    const days = emptyItinerary(6)
    const result = resizeItineraryToLength(days, 6)
    expect(result).toBe(days)
    expect(result.length).toBe(6)
  })

  it('preserves existing days when expanding from 6 days to 7 days', () => {
    const days: DayPlan[] = [
      {
        day: 1,
        title: 'Arrival',
        theme: 'Check in',
        pace: 'relaxed',
        summary: 'Arrival',
        metroHintFromArea: {},
        stops: [{ time: '14:00', placeId: 'hotel-selected', note: 'Check in' }],
      },
      {
        day: 2,
        title: 'Day 2',
        theme: 'Museums',
        pace: 'moderate',
        summary: 'Museums',
        metroHintFromArea: {},
        stops: [{ time: '10:00', placeId: 'louvre', note: 'Art' }],
      },
      {
        day: 3,
        title: 'Day 3',
        theme: 'Eiffel',
        pace: 'moderate',
        summary: 'Eiffel',
        metroHintFromArea: {},
        stops: [{ time: '10:00', placeId: 'eiffel', note: 'Tower' }],
      },
      {
        day: 4,
        title: 'Day 4',
        theme: 'Marais',
        pace: 'moderate',
        summary: 'Marais',
        metroHintFromArea: {},
        stops: [{ time: '10:00', placeId: 'pompidou', note: 'Modern Art' }],
      },
      {
        day: 5,
        title: 'Day 5',
        theme: 'Versailles',
        pace: 'moderate',
        summary: 'Versailles',
        metroHintFromArea: {},
        stops: [{ time: '09:00', placeId: 'versailles', note: 'Palace' }],
      },
      {
        day: 6,
        title: 'Day 6 Departure',
        theme: 'Flight Home',
        pace: 'relaxed',
        summary: 'Departure',
        metroHintFromArea: {},
        stops: [{ time: '12:00', placeId: 'attr-cdg', note: 'Head to airport' }],
      },
    ]

    const resized = resizeItineraryToLength(days, 7)
    expect(resized.length).toBe(7)
    expect(resized[0].stops[0].placeId).toBe('hotel-selected')
    expect(resized[1].stops[0].placeId).toBe('louvre')
    expect(resized[2].stops[0].placeId).toBe('eiffel')
    expect(resized[3].stops[0].placeId).toBe('pompidou')
    expect(resized[4].stops[0].placeId).toBe('versailles')
    // Day 7 receives the return day (Day 6)
    expect(resized[6].stops[0].placeId).toBe('attr-cdg')
    expect(resized[6].day).toBe(7)
  })

  it('clamps invalid counts to [1, 30]', () => {
    const days = emptyItinerary(3)
    expect(resizeItineraryToLength(days, 0).length).toBe(1)
    expect(resizeItineraryToLength(days, 100).length).toBe(30)
  })
})
