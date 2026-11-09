import type { DayPlan, HotelCandidate, Place, SelectedHotel } from '../../../types'
import { ensureStopId } from '../../../appHelpers'
import { getPlace } from '../../place/constants/places'
import { getLocale } from '../../../shared/i18n'
import type { TripChatHandlers } from '../components/TripChatPanel'
import { replyClaimsItineraryApplied, type TripChatResult } from './tripChat'

export interface ChatExecutionState {
  days: DayPlan[]
  customPlaces: Record<string, Place>
  hotel: SelectedHotel
  hotelCandidates: HotelCandidate[]
  currentDay: number
  selectedPlaceId: string | null
}

/** Model prose is a proposal. Only executor receipts may describe completed edits. */
export function formatChatExecutionReply(result: TripChatResult, reply: string, notes: string[], noChange: string, locale: string, operationRequested = false): string {
  if (!operationRequested && !result.actions.length && !result.rejectedActions && !replyClaimsItineraryApplied(result.reply)) return reply
  const unsupported = result.rejectedActions
    ? (locale === 'en' ? `${result.rejectedActions} invalid or unsupported operations were not executed.` : `${result.rejectedActions} 个无效或不支持的操作未执行。`)
    : ''
  return [notes.length ? notes.join('\n') : noChange, unsupported].filter(Boolean).join('\n')
}

function stopAt(state: ChatExecutionState, day: number, id: string) {
  const plan = state.days.find(d => d.day === day)
  return plan?.stops.find((stop, index) => ensureStopId(day, stop, index, plan.stops) === id)
}

/** Commit through React, then verify the actual application state, not a shadow plan. */
export function verifiedChatHandlers(
  latest: () => TripChatHandlers,
  commit: (mutation: () => void) => void,
): TripChatHandlers {
  const state = () => latest().readState()
  function run(mutation: () => void, verify: (after: ChatExecutionState) => boolean) {
    commit(mutation)
    if (!verify(state())) throw new Error(getLocale() === 'en'
      ? 'The requested result could not be verified. The target may be missing or protected; this operation is not marked complete.'
      : '未核对到要求的结果：目标可能不存在或受保护，此操作未标记为完成。')
  }
  return {
    readState: state,
    switchDay: day => run(() => latest().switchDay(day), after => after.currentDay === day),
    selectPlace: id => run(() => latest().selectPlace(id), after => after.selectedPlaceId === id),
    removeStop: (day, id) => {
      const existed = Boolean(stopAt(state(), day, id))
      run(() => latest().removeStop(day, id), after => existed && !stopAt(after, day, id))
    },
    addPlace: (day, place, options) => {
      const count = (s: ChatExecutionState) => s.days.find(d => d.day === day)?.stops.filter(stop => stop.placeId === place.id).length ?? 0
      const before = count(state())
      run(() => latest().addPlace(day, place, options), after => count(after) > before)
    },
    replaceStop: (day, id, place, options) => run(() => latest().replaceStop(day, id, place, options), after => stopAt(after, day, id)?.placeId === place.id),
    reorderStop: (day, from, to) => {
      const before = state().days.find(d => d.day === day)?.stops
      const ids = (stops: typeof before) => stops?.map((s, i) => ensureStopId(day, s, i, stops))
      const moving = ids(before)?.[from]
      const order = JSON.stringify(ids(before))
      run(() => latest().reorderStop(day, from, to), after => {
        const next = ids(after.days.find(d => d.day === day)?.stops)
        return Boolean(moving && next?.[to] === moving && (from === to || JSON.stringify(next) !== order))
      })
    },
    setHotel: hotel => run(() => latest().setHotel(hotel), after => after.hotel.id === hotel.id && after.hotel.name === hotel.name),
    setHotelCandidates: candidates => run(() => latest().setHotelCandidates(candidates), after => JSON.stringify(after.hotelCandidates) === JSON.stringify(candidates)),
  }
}

/** Only known activity categories are eligible; hotel and airport anchors survive. */
export function stopsToClear(state: ChatExecutionState, days: number[], types: string[]) {
  return state.days.filter(day => days.includes(day.day)).flatMap(day => day.stops.flatMap((stop, index) => {
    try {
      const place = getPlace(stop.placeId, state.customPlaces)
      return ['cafe', 'restaurant', 'attraction'].includes(place.type) && types.includes(place.type)
        ? [{ day: day.day, stopId: ensureStopId(day.day, stop, index, day.stops), name: place.name }]
        : []
    } catch { return [] }
  }))
}
