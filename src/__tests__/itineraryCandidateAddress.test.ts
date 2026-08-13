import { beforeEach, describe, expect, it, vi } from 'vitest'

const { generateText } = vi.hoisted(() => ({ generateText: vi.fn() }))

vi.mock('../shared/services/llm/business/_service', () => ({
  generateText,
  isLlmConfigured: () => true,
}))

import {
  generateFullItinerary,
  generateSingleDayItinerary,
} from '../shared/services/llm/business/itinerary'
import { DEFAULT_RECOMMENDATION_PREFERENCES } from '../features/place/services/recommendationPreferences'

const candidate = {
  id: 'ChIJCafeAddress',
  name: 'Café Test',
  type: 'cafe' as const,
  address: '10 Rue de Test, 75001 Paris, France',
  rating: 4.7,
  userRatingCount: 321,
}

const hotel = {
  name: 'Test Hotel',
  address: '1 Rue Hôtel, 75001 Paris',
  lat: 48.86,
  lng: 2.34,
}

function placeJson() {
  return {
    key: 'cafe-test',
    googlePlaceId: candidate.id,
    name: candidate.name,
    type: 'cafe',
    area: '1区',
  }
}

function dayJson(day: number) {
  return {
    day,
    title: '测试日',
    theme: '咖啡',
    pace: '适中',
    summary: '测试地址传递。',
    metroHintFromArea: { custom: '步行。' },
    stops: [
      {
        time: '10:00',
        placeKey: 'cafe-test',
        note: '喝咖啡。',
        transport: '步行',
        walkLevel: '短步行',
      },
    ],
  }
}

describe('itinerary candidate Google address', () => {
  beforeEach(() => generateText.mockReset())

  it('copies the verified Google address into a full-itinerary place draft', async () => {
    generateText.mockResolvedValue(
      JSON.stringify({ places: [placeJson()], days: [dayJson(1)] }),
    )

    const result = await generateFullItinerary({
      destination: 'Paris',
      dayCount: 1,
      tripStartDate: '2026-11-10',
      tripEndDate: '2026-11-10',
      itineraryStartDate: '2026-11-10',
      hotel,
      recommendationPreferences: DEFAULT_RECOMMENDATION_PREFERENCES,
      verifiedCandidates: [candidate],
    })

    expect(result.places[0].googleAddress).toBe(candidate.address)
  })

  it('copies the verified Google address into a regenerated-day place draft', async () => {
    generateText.mockResolvedValue(
      JSON.stringify({ places: [placeJson()], day: dayJson(2) }),
    )

    const result = await generateSingleDayItinerary({
      destination: 'Paris',
      dayCount: 3,
      dayNumber: 2,
      tripStartDate: '2026-11-10',
      tripEndDate: '2026-11-12',
      itineraryStartDate: '2026-11-10',
      hotel,
      occupiedPlaces: [],
      recommendationPreferences: DEFAULT_RECOMMENDATION_PREFERENCES,
      verifiedCandidates: [candidate],
    })

    expect(result.places[0].googleAddress).toBe(candidate.address)
  })
})
