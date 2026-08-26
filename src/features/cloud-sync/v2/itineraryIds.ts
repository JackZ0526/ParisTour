import { ensureStopId } from '../../../appHelpers'
import type { DayPlan, Place } from '../../../types'
import type { TripMutationDraft } from './mutationTypes'

export function withStableStopIds(days: DayPlan[]): DayPlan[] {
  return days.map((day) => ({
    ...day,
    stops: day.stops.map((stop, index) => ({
      ...stop,
      id: ensureStopId(day.day, stop, index, day.stops),
    })),
  }))
}

export function itineraryReplaceDraft(
  days: DayPlan[],
  customPlaces: Record<string, Place>,
): TripMutationDraft {
  return {
    type: 'itinerary.replace',
    payload: {
      days: withStableStopIds(days),
      customPlaces,
    },
  }
}

export function dayReplaceDraft(
  dayNumber: number,
  days: DayPlan[],
  places?: Record<string, Place>,
): TripMutationDraft | null {
  const day = withStableStopIds(days).find((entry) => entry.day === dayNumber)
  if (!day) return null
  return {
    type: 'day.replace',
    payload: {
      dayNumber,
      day,
      places,
    },
  }
}
