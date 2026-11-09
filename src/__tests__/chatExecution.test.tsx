import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useRef } from 'react'
import { useItineraryDays } from '../hooks/useItineraryDays'
import { PENDING_HOTEL } from '../features/hotel/constants/hotels'
import { SELECTED_HOTEL_PLACE_ID } from '../features/itinerary/utils/dayOrigin'
import { stopsToClear, verifiedChatHandlers, formatChatExecutionReply } from '../features/chat/services/chatExecution'
import type { TripChatHandlers } from '../features/chat/components/TripChatPanel'
import type { DayPlan, Place, PlaceType } from '../types'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const makePlace = (id: string, type: PlaceType): Place => ({ id, type, name: id, description: '', ratingHint: '', image: '', location: { lat: 48.85, lng: 2.35 }, googleMapsUrl: '' })
const customPlaces = Object.fromEntries([makePlace('coffee', 'cafe'), makePlace('food', 'restaurant'), makePlace('museum', 'attraction'), makePlace('airport', 'transport')].map(p => [p.id, p]))
function sample(): DayPlan[] {
  return Array.from({ length: 6 }, (_, index) => {
    const day = index + 1
    const ids = day === 6 ? ['coffee', 'airport'] : [SELECTED_HOTEL_PLACE_ID, 'coffee', 'food', 'museum', SELECTED_HOTEL_PLACE_ID]
    return { day, title: '', theme: '', pace: 'relaxed', summary: '', metroHintFromArea: {}, stops: ids.map((placeId, i) => ({ id: `d${day}s${i}`, placeId, time: '12:00', note: '' })) }
  })
}
let root: ReactTestRenderer
let raw: TripChatHandlers
let hook: ReturnType<typeof useItineraryDays>
const onMutation = vi.fn()
function Harness() {
  hook = useItineraryDays(PENDING_HOTEL, { days: sample(), customPlaces }, { numberOfDaysRef: useRef(6), onMutation })
  raw = {
    readState: () => ({ days: hook.days, customPlaces: hook.placesWithHotel, hotel: PENDING_HOTEL, hotelCandidates: [], currentDay: hook.day.day, selectedPlaceId: hook.selectedPlaceId }),
    removeStop: hook.handleDeleteOnDay, addPlace: hook.handleAddOnDay, replaceStop: hook.handleReplaceOnDay, reorderStop: hook.handleReorderOnDay,
    switchDay: hook.handleSwitchDay, selectPlace: hook.setSelectedPlaceId, setHotel: () => {}, setHotelCandidates: () => {},
  }
  return null
}
function mount() {
  act(() => { root = create(<Harness />) })
  return verifiedChatHandlers(() => raw, mutation => { act(mutation) })
}
afterEach(() => { if (root) act(() => root.unmount()); vi.clearAllMocks() })

describe('chat actions against the real itinerary state hook', () => {
  it('deletes activities across six days with stable IDs and cloud mutations, preserving hotel and airport anchors', () => {
    const handlers = mount()
    const days = [1, 2, 3, 4, 5, 6]
    const targets = stopsToClear(handlers.readState(), days, ['cafe', 'restaurant', 'attraction'])
    expect(targets).toHaveLength(16)
    for (const target of targets) handlers.removeStop(target.day, target.stopId)
    expect(stopsToClear(handlers.readState(), days, ['cafe', 'restaurant', 'attraction'])).toEqual([])
    expect(hook.days.slice(0, 5).every(day => day.stops.every(s => s.placeId === SELECTED_HOTEL_PLACE_ID))).toBe(true)
    expect(hook.days[5].stops.map(s => s.placeId)).toEqual(['airport'])
    expect(onMutation.mock.calls.map(([m]) => m.type)).toEqual(Array(16).fill('stop.delete'))
    expect(new Set(onMutation.mock.calls.map(([m]) => m.payload.stopId)).size).toBe(16)
  })
  it('limits removal to the requested days and categories', () => {
    const handlers = mount()
    for (const target of stopsToClear(handlers.readState(), [2, 4], ['cafe'])) handlers.removeStop(target.day, target.stopId)
    expect(hook.days.map(day => day.stops.some(s => s.placeId === 'coffee'))).toEqual([true, false, true, false, true, true])
    expect(hook.days[1].stops.some(s => s.placeId === 'food')).toBe(true)
  })
  it('rejects a protected deletion instead of reporting success', () => {
    const handlers = mount()
    expect(() => handlers.removeStop(1, 'd1s0')).toThrow()
    expect(hook.days[0].stops).toHaveLength(5)
    expect(onMutation).not.toHaveBeenCalled()
  })
  it('verifies add, replace, selection, day switch and consecutive reorder actions using fresh state', () => {
    const handlers = mount()
    const place = makePlace('new-cafe', 'cafe')
    handlers.addPlace(2, place, { mode: 'end', select: false })
    expect(hook.days[1].stops.at(-2)?.placeId).toBe(place.id)
    handlers.replaceStop(2, 'd2s1', makePlace('new-museum', 'attraction'), { select: false })
    expect(hook.days[1].stops[1].placeId).toBe('new-museum')
    handlers.reorderStop(2, 1, 3)
    handlers.reorderStop(2, 3, 2)
    expect(hook.days[1].stops[2].placeId).toBe('new-museum')
    handlers.switchDay(3)
    handlers.selectPlace('museum')
    expect(handlers.readState()).toMatchObject({ currentDay: 3, selectedPlaceId: 'museum' })
  })
  it('bounds new stop notes and cloud mutations while retaining full place descriptions', () => {
    const handlers = mount()
    const long = '提供咖啡和手工甜点的小店，适合休息片刻。' + '这里还有很多详细介绍。'.repeat(40)
    const venue = { ...makePlace('long-intro', 'cafe'), description: long }
    handlers.addPlace(2, venue, { select: false })
    const added = hook.days[1].stops.find(stop => stop.placeId === venue.id)!
    expect([...added.note].length).toBeLessThanOrEqual(80)
    expect(hook.customPlaces[venue.id].description).toBe(long)
    expect(onMutation.mock.calls.at(-1)?.[0].payload.stop.note).toBe(added.note)
    const address = '49 Av. Franklin Delano Roosevelt, 75008 Paris'
    handlers.replaceStop(2, added.id!, { ...makePlace('address-intro', 'restaurant'), description: address, googleAddress: address }, { select: false })
    expect(hook.days[1].stops.find(stop => stop.id === added.id)?.note).toBe('')
    expect(onMutation.mock.calls.at(-1)?.[0].payload.patch.note).toBe('')
  })
  it('does not create orphaned places for a nonexistent day and rejects silently ignored handlers', () => {
    const handlers = mount()
    expect(() => handlers.addPlace(99, makePlace('orphan', 'cafe'))).toThrow()
    expect(hook.customPlaces.orphan).toBeUndefined()
    raw = { ...raw, removeStop: () => {} }
    expect(() => handlers.removeStop(2, 'd2s1')).toThrow()
    expect(hook.days[1].stops).toHaveLength(5)
  })
})

describe('execution receipts', () => {
  it('never persists a model success claim when no action ran', () => {
    const result = { reply: '已全部清空了，只剩酒店', actions: [] }
    expect(formatChatExecutionReply(result, result.reply, [], '行程未改动', 'zh-CN')).toBe('行程未改动')
    expect(formatChatExecutionReply({ reply: 'Done.', actions: [] }, 'Done.', [], 'No changes were applied.', 'en', true)).toBe('No changes were applied.')
  })
  it('uses actual partial/failure receipts and identifies unsupported operations', () => {
    const result = { reply: 'Deleted everything', actions: [{ type: 'remove_place' as const, day: 1, placeName: 'A' }], rejectedActions: 1 }
    const reply = formatChatExecutionReply(result, result.reply, ['Day 1: A removed', 'Day 2: target not found'], 'No change', 'en')
    expect(reply).toBe('Day 1: A removed\nDay 2: target not found\n1 invalid or unsupported operations were not executed.')
  })
  it('keeps ordinary recommendations and pending confirmations honest', () => {
    const result = { reply: 'Recommend Café A', actions: [] }
    expect(formatChatExecutionReply(result, result.reply, [], 'No change', 'en')).toBe(result.reply)
    const edit = { reply: '已添加A', actions: [{ type: 'add_place' as const, placeName: 'A' }] }
    expect(formatChatExecutionReply(edit, edit.reply, ['等待在详情页确认，尚未添加'], '未修改', 'zh-CN')).toBe('等待在详情页确认，尚未添加')
  })
})
