import { getPlace } from '../constants/places'
import { SELECTED_HOTEL_PLACE_ID } from '../../itinerary/utils/dayOrigin'
import type { Place } from '../../../types'

export type PlaceAdvisorReview = {
  text: string
  rating?: number
  author?: string
}

/** Listing facts used by 行程顾问点评 once Google / Tripadvisor details settle. */
export type PlaceAdvisorFacts = {
  address?: string
  description?: string
  rating?: number
  reviewCount?: number
  priceLevel?: string
  cuisine?: string
  reviews: PlaceAdvisorReview[]
  settled: boolean
}

export function placeAdvisorFactsSignature(facts: PlaceAdvisorFacts | null): string {
  if (!facts?.settled) return ''
  return [
    facts.address || '',
    facts.description || '',
    facts.rating ?? '',
    facts.reviewCount ?? '',
    facts.priceLevel || '',
    facts.cuisine || '',
    facts.reviews
      .slice(0, 6)
      .map((review) => `${review.rating ?? ''} ${review.text.slice(0, 80)}`)
      .join('|'),
  ].join('::')
}

export function placeAdvisorCopyFields(facts: PlaceAdvisorFacts | null): {
  address?: string
  listingDescription?: string
  rating?: number
  reviewCount?: number
  priceLevel?: string
  cuisine?: string
  featuredReviews?: PlaceAdvisorReview[]
} {
  if (!facts) return {}
  return {
    address: facts.address,
    listingDescription: facts.description,
    rating: facts.rating,
    reviewCount: facts.reviewCount,
    priceLevel: facts.priceLevel,
    cuisine: facts.cuisine,
    featuredReviews: facts.reviews.slice(0, 6).map((review) => ({
      author: review.author,
      rating: review.rating,
      text: review.text.slice(0, 400),
    })),
  }
}

export function nearbyStopsForAdvisor(
  stops: Array<{ placeId: string }>,
  currentPlaceId: string | undefined,
  customPlaces: Record<string, Place> = {},
): Array<{ name: string; type: string }> {
  const out: Array<{ name: string; type: string }> = []
  for (const stop of stops) {
    if (stop.placeId === currentPlaceId || stop.placeId === SELECTED_HOTEL_PLACE_ID) continue
    try {
      const place = getPlace(stop.placeId, customPlaces)
      out.push({ name: place.name, type: place.type })
    } catch {
      /* catalog miss */
    }
  }
  return out.slice(0, 8)
}
