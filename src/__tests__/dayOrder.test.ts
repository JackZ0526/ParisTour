import { dayOrderCopy } from '../shared/i18n/copy/dayOrder'
import { describe, expect, it } from 'vitest'
import { reorderItineraryDays } from '../features/itinerary/utils/dayOrder'
import { SELECTED_HOTEL_PLACE_ID } from '../features/itinerary/utils/dayOrigin'
import { itineraryReplaceDraft } from '../features/cloud-sync/v2/itineraryIds'
import { applyItineraryMutation } from '../features/cloud-sync/v2/itineraryMutationReducer'
import type { DayPlan, Place } from '../types'
import type { TripMutation } from '../features/cloud-sync/v2/mutationTypes'
const places: Record<string, Place> = { airport: { id: 'airport', name: 'CDG Airport', type: 'transport', description: '', ratingHint: '', image: '', location: {lat:49,lng:2.5}, googleMapsUrl: '' } }
export function sampleDays(): DayPlan[] {
  return Array.from({length:6},(_,i)=> {
    const day=i+1
    const ids=day===1?[SELECTED_HOTEL_PLACE_ID,`p${day}a`,`p${day}b`,SELECTED_HOTEL_PLACE_ID]:day===6?[`p${day}a`,`p${day}b`,'airport']:[`p${day}a`,`p${day}b`,SELECTED_HOTEL_PLACE_ID]
    return {day,title:`Plan ${day}`,theme:`Theme ${day}`,summary:`Summary ${day}`,pace:'relaxed',metroHintFromArea:{custom:`Hint ${day}`},stops:ids.map((placeId,j)=>({id:`stable-${day}-${j}`,time:'12:00',placeId,note:`Note ${day}-${j}`,duration:'60 min'}))}
  })
}
const activityIds=(days:DayPlan[])=>days.flatMap(day=>day.stops.filter(s=>s.placeId!==SELECTED_HOTEL_PLACE_ID&&s.placeId!=='airport').map(s=>s.id)).sort()
describe('whole-day itinerary operations',()=>{
  it('formats real day numbers in localized execution receipts',()=>{
    expect(dayOrderCopy('swapped',{p0:4,p1:2},'zh-CN')).toContain('D4 和 D2')
    expect(dayOrderCopy('moved',{p0:4,p1:2},'en')).toContain('D4 to D2')
  })
  it('swaps only the two requested days, carrying every activity and metadata field',()=>{
    const before=sampleDays(); const result=reorderItineraryDays(before,{mode:'swap',fromDay:4,toDay:2},places)
    expect(result.map(d=>d.title)).toEqual(['Plan 1','Plan 4','Plan 3','Plan 2','Plan 5','Plan 6'])
    expect(result[1]).toMatchObject({day:2,theme:'Theme 4',summary:'Summary 4',metroHintFromArea:{custom:'Hint 4'}})
    expect(result[1].stops.slice(0,2)).toEqual(before[3].stops.slice(0,2))
    expect(result[1].stops.at(-1)).toEqual(before[1].stops.at(-1))
    expect(result[0]).toBe(before[0]);expect(result[2]).toBe(before[2]);expect(result[4]).toBe(before[4])
    expect(before.map(d=>d.title)).toEqual(['Plan 1','Plan 2','Plan 3','Plan 4','Plan 5','Plan 6'])
  })
  it.each([{fromDay:4,toDay:2,titles:[1,4,2,3,5,6]},{fromDay:2,toDay:4,titles:[1,3,4,2,5,6]}])('moves with insertion and shifts intervening days: $fromDay → $toDay',({fromDay,toDay,titles})=>{
    const before=sampleDays();const next=reorderItineraryDays(before,{mode:'move',fromDay,toDay},places)
    expect(next.map(d=>d.title)).toEqual(titles.map(n=>`Plan ${n}`))
    expect(next.map(d=>d.day)).toEqual([1,2,3,4,5,6]);expect(activityIds(next)).toEqual(activityIds(before))
    expect(new Set(next.flatMap(d=>d.stops.map(s=>s.id))).size).toBe(next.reduce((n,d)=>n+d.stops.length,0))
  })
  it('keeps dated check-in, overnight and airport anchors when swapping the first and final days',()=>{
    const before=sampleDays();const next=reorderItineraryDays(before,{mode:'swap',fromDay:1,toDay:6},places)
    expect(next[0].stops.map(s=>s.placeId)).toEqual([SELECTED_HOTEL_PLACE_ID,'p6a','p6b',SELECTED_HOTEL_PLACE_ID])
    expect(next[5].stops.map(s=>s.placeId)).toEqual(['p1a','p1b','airport'])
    expect(next[0].stops[0].id).toBe(before[0].stops[0].id)
    expect(next[5].stops.at(-1)?.id).toBe(before[5].stops.at(-1)?.id)
    expect(activityIds(next)).toEqual(activityIds(before))
  })
  it('preserves stable IDs from legacy stops that did not yet have IDs',()=>{
    const before=sampleDays().map(day=>({...day,stops:day.stops.map(({id:_id,...s})=>s)}))
    const next=reorderItineraryDays(before,{mode:'swap',fromDay:2,toDay:4},places)
    expect(next[3].stops[0].id).toContain('d2-p2a-')
    expect(next[1].stops[0].id).toContain('d4-p4a-')
  })
  it('is a no-op for the same day and rejects invalid destinations without partial work',()=>{
    const days=sampleDays(); expect(reorderItineraryDays(days,{mode:'move',fromDay:2,toDay:2},places)).toBe(days)
    expect(()=>reorderItineraryDays(days,{mode:'move',fromDay:2,toDay:99},places)).toThrow()
    expect(()=>reorderItineraryDays(days,{mode:'move',fromDay:2.5,toDay:4},places)).toThrow()
  })
  it('round-trips as one existing atomic cloud operation, keeping custom place identities and retrying safely',()=>{
    const before=sampleDays(); const next=reorderItineraryDays(before,{mode:'swap',fromDay:4,toDay:2},places)
    const mutation={...itineraryReplaceDraft(next,places),protocol:2,mutationId:'swap-1',tripId:'test-trip',deviceId:'test-device',baseRevision:1,createdAt:'2026-11-09T00:00:00Z'} as TripMutation
    const remote=applyItineraryMutation({days:before,customPlaces:places},mutation,'remote')
    expect(remote.document).toEqual({days:next,customPlaces:places})
    expect(applyItineraryMutation(remote.document,mutation,'replay').document).toEqual(remote.document)
  })
})
