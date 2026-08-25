import { describe, expect, it } from 'vitest'
import { buildTripChatSuggestions } from '../features/chat/services/tripChatSuggestions'
import type { DayPlan, Place, SelectedHotel } from '../types'

const hotel: SelectedHotel = {
  id: 'hotel-padam',
  bookingHotelId: '8913188',
  name: 'Padam Hôtel',
  address: '9 Rue Jean Giraudoux, Paris',
  lat: 48.868,
  lng: 2.298,
  nearestMetro: 'Iéna',
  areaKey: 'custom',
  source: 'custom',
}

function place(id: string, name: string, type: Place['type']): Place {
  return {
    id,
    name,
    type,
    description: '',
    ratingHint: '',
    priceHint: '',
    image: '',
    googleMapsUrl: `https://maps.google.com/?q=${encodeURIComponent(name)}`,
    location: { lat: 48.86, lng: 2.34 },
  }
}

function day(ids: string[]): DayPlan {
  return {
    day: 1,
    title: 'Coffee & Check-in',
    theme: 'Arrival',
    pace: 'relaxed',
    summary: '',
    metroHintFromArea: {},
    stops: ids.map((placeId, index) => ({
      id: `stop-${index}`,
      time: `${10 + index}:00`,
      placeId,
      note: '',
    })),
  }
}

describe('trip chat suggestions', () => {
  it('uses the current hotel and actual day places instead of fixed landmarks', () => {
    const customPlaces = {
      coffee: place('coffee', 'Parallel Coffee', 'cafe'),
    }
    const labels = buildTripChatSuggestions({
      hotel,
      days: [day(['coffee'])],
      currentDay: 1,
      customPlaces,
      locale: 'en',
    }).map((item) => item.label)

    expect(labels).toContain('Tell me about Padam Hôtel')
    expect(labels).toContain('Tell me more about Parallel Coffee')
    expect(labels).toContain('Add a restaurant near today’s route')
    expect(labels.join(' ')).not.toContain('Arc de Triomphe')
  })

  it('only offers removal for a busy day and names a real stop', () => {
    const customPlaces = Object.fromEntries(
      ['a', 'b', 'c', 'd', 'e'].map((id, index) => [
        id,
        place(id, `Place ${index + 1}`, index === 0 ? 'cafe' : index === 1 ? 'restaurant' : 'attraction'),
      ]),
    )
    const suggestions = buildTripChatSuggestions({
      hotel,
      days: [day(['a', 'b', 'c', 'd', 'e'])],
      currentDay: 1,
      customPlaces,
      locale: 'en',
    })

    expect(suggestions.some((item) => item.label === 'Remove Place 5 from today')).toBe(true)
  })

  it('prioritizes the place the user is currently viewing', () => {
    const customPlaces = {
      coffee: place('coffee', 'Parallel Coffee', 'cafe'),
      garden: place('garden', 'Tuileries Garden', 'attraction'),
    }
    const suggestions = buildTripChatSuggestions({
      hotel,
      days: [day(['coffee', 'garden'])],
      currentDay: 1,
      customPlaces,
      viewing: { type: 'place', id: 'garden', name: 'Tuileries Garden', day: 1 },
      locale: 'en',
    })

    expect(suggestions[0]?.label).toBe('Tell me more about Tuileries Garden')
    expect(suggestions.some((item) => item.label === 'What should I do after Tuileries Garden?')).toBe(true)
  })
})
