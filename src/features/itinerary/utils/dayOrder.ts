import { ensureStopId } from '../../../appHelpers'
import type { DayPlan, ItineraryStop, Place } from '../../../types'
import { getPlace } from '../../place/constants/places'
import { CDG_PLACE_ID, isAirportPlace, SELECTED_HOTEL_PLACE_ID } from './dayOrigin'
import { ensureDayEndsAtHotel } from './itineraryState'
import { dayOrderCopy } from '../../../shared/i18n/copy/dayOrder'

export interface DayOrderChange { mode: 'move' | 'swap'; fromDay: number; toDay: number }

function isAnchor(stop: ItineraryStop, places: Record<string, Place>): boolean {
  if (stop.placeId === SELECTED_HOTEL_PLACE_ID || stop.placeId === CDG_PLACE_ID) return true
  try { return isAirportPlace(getPlace(stop.placeId, places)) } catch { return false }
}

/** Move content between calendar slots. Stable stop IDs follow activities;
 * dated hotel/airport anchors stay in their original slots. Pure and atomic. */
export function reorderItineraryDays(days: DayPlan[], change: DayOrderChange, places: Record<string, Place>): DayPlan[] {
  const { fromDay, toDay, mode } = change
  const from = days.findIndex(day => day.day === fromDay)
  const to = days.findIndex(day => day.day === toDay)
  if (!Number.isInteger(fromDay) || !Number.isInteger(toDay) || from < 0 || to < 0 || !['move', 'swap'].includes(mode) || new Set(days.map(day => day.day)).size !== days.length) throw new Error(dayOrderCopy('invalid'))
  if (from === to) return days
  const order = [...days]
  if (mode === 'swap') [order[from], order[to]] = [order[to], order[from]]
  else { const [moving] = order.splice(from, 1); order.splice(to, 0, moving) }
  const next = order.map((source, index) => {
    const slot = days[index]
    if (source === slot) return slot
    const stable = (day: DayPlan) => day.stops.map((stop, i) => ({ ...stop, id: ensureStopId(day.day, stop, i, day.stops) }))
    const anchored = stable(slot).filter(stop => isAnchor(stop, places))
    const checkIn = slot.day === 1 && slot.stops[0]?.placeId === SELECTED_HOTEL_PLACE_ID ? anchored[0] : undefined
    return {
      ...source, day: slot.day,
      stops: [
        ...(checkIn ? [checkIn] : []),
        ...stable(source).filter(stop => !isAnchor(stop, places)),
        ...anchored.filter(stop => stop !== checkIn),
      ],
    }
  })
  return ensureDayEndsAtHotel(next)
}

/** Compare operation-relevant content without transport-clock effects. */
export function dayOrderSignature(days: DayPlan[]): string {
  return JSON.stringify(days.map(day => ({ ...day, stops: day.stops.map(({ time: _time, ...stop }) => stop) })))
}
