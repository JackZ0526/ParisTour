import type { DayPlan, Place } from '../../../types'
import type { VerifiedPlaceCandidate } from '../../../shared/services/llm/types'
import { samePlace } from '../../../shared/utils/placeIdentity'
import { openingCopy } from '../../../shared/i18n/copy/openingAvailability'
import { openingAvailability, openingWindows, visitDurationMinutes } from '../../place/services/openingAvailability'
import { fetchGooglePlaceDetails } from '../../map/services/googlePlaceDetails'
import { getPlace } from '../../place/constants/places'

/** Validate before publishing, even when photos/details are deferred. No name-specific closure rules. */
const clockMinutes = (time: string) => /^(\d{1,2}):(\d{2})$/.test(time) && +time.split(':')[0] < 24 && +time.split(':')[1] < 60
  ? +time.split(':')[0] * 60 + +time.split(':')[1] : undefined
const clock = (value: number) => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`

export async function validateDayOpeningHours(day: DayPlan, date: string, places: Record<string, Place>, candidates: VerifiedPlaceCandidate[], signal?: AbortSignal, repairTimes = false, earliestTime = '00:00'): Promise<Place[]> {
  const conflicts: Place[] = []
  // Resolve first, then repair in route order so adjacent adjustments cannot overlap.
  const visits = await Promise.all(day.stops.map(async stop => {
    signal?.throwIfAborted()
    let place: Place
    try { place = getPlace(stop.placeId, places) } catch { return }
    if (place.type === 'hotel' || place.type === 'transport') return { stop, place, duration: visitDurationMinutes(stop.duration) }
    const candidate = candidates.find(row => samePlace(row, place))
    const schedule = candidate?.openingSchedule !== undefined ? candidate.openingSchedule : (await fetchGooglePlaceDetails(place.name, place.location, {
      placeId: place.googlePlaceId, recoverPhotos: false,
    }).catch(() => null))?.openingSchedule
    signal?.throwIfAborted()
    return { stop, place, schedule, duration: visitDurationMinutes(stop.duration) }
  }))
  // Fit the whole ordered day before trying isolated gaps. Otherwise a museum
  // that could move earlier keeps lunch pinned outside its service window.
  // Fixed/unknown-time visits remain anchors; a failed solve changes nothing.
  if (repairTimes && visits.every(visit => visit && clockMinutes(visit.stop.time) != null) &&
      visits.some(visit => visit && openingAvailability(visit.schedule, date, visit.stop.time, visit.duration ?? 1) === 'closed')) {
    const rows = visits.map(visit => visit!)
    const originals = rows.map(row => clockMinutes(row.stop.time)!)
    const durations = rows.map(row => row.duration ?? 0)
    const domains = rows.map((row, index): number[][] => {
      if (row.place.type === 'hotel' || row.place.type === 'transport' || row.duration == null) return [[originals[index], originals[index]]]
      const windows = openingWindows(row.schedule, date)
      if (windows == null) return [[originals[index], originals[index]]]
      return windows.map(window => {
        const [from, to] = window.split('–').map(value => value === '24:00' ? 1440 : clockMinutes(value)!)
        return [Math.max(from, originals[index] - 120, clockMinutes(earliestTime) ?? 0), Math.min(to - row.duration!, originals[index] + 120)]
      }).filter(([from, to]) => from <= to)
    })
    const gaps = rows.map((row, index) => {
      if (!index) return 0
      const previous = rows[index - 1]
      const reserved = originals[index] - originals[index - 1] - durations[index - 1]
      return Math.max(30, visitDurationMinutes(row.stop.transport) ?? 0,
        row.place.type === 'transport' || previous.place.type === 'transport' || previous.duration == null ? reserved : 0)
    })
    const latest = new Array<number>(rows.length)
    for (let i = rows.length - 1; i >= 0; i--) {
      const limit = i === rows.length - 1 ? 1440 : latest[i + 1] - durations[i] - gaps[i + 1]
      latest[i] = Math.max(...domains[i].filter(([from]) => from <= limit).map(([, to]) => Math.min(to, limit)))
    }
    if (latest.every(Number.isFinite)) {
      const starts: number[] = []
      for (let i = 0; i < rows.length; i++) {
        const earliest = i ? starts[i - 1] + durations[i - 1] + gaps[i] : 0
        const options = domains[i].flatMap(([from, to]) => {
          const min = Math.max(from, earliest), max = Math.min(to, latest[i])
          return min <= max ? [Math.max(min, Math.min(originals[i], max))] : []
        }).sort((a, b) => Math.abs(a - originals[i]) - Math.abs(b - originals[i]))
        if (!options.length) break
        starts.push(options[0])
      }
      if (starts.length === rows.length) rows.forEach((row, index) => {
        if (starts[index] !== originals[index]) {
          row.stop.time = clock(starts[index])
          row.stop.note = `${row.stop.note} ${openingCopy('adjusted')}`.trim()
        }
      })
    }
  }
  for (let index = 0; index < visits.length; index++) {
    const visit = visits[index]
    if (!visit || visit.place.type === 'hotel' || visit.place.type === 'transport') continue
    const { stop, place, schedule, duration } = visit
    let availability = openingAvailability(schedule, date, stop.time, duration ?? 1)
    const original = clockMinutes(stop.time)
    if (repairTimes && availability === 'closed' && duration != null && original != null) {
      const previous = visits[index - 1], next = visits[index + 1]
      const previousTime = previous && clockMinutes(previous.stop.time)
      const nextTime = next && clockMinutes(next.stop.time)
      // Keep anchors and all other stops fixed. Unknown adjacent timing is not
      // spare time. Do not shorten a visit or shift it across the whole day.
      if ((!index || (previousTime != null && previous?.duration != null)) &&
          (index === visits.length - 1 || nextTime != null)) {
        const incomingTravel = Math.max(30, visitDurationMinutes(stop.transport) ?? 0,
          previous?.place.type === 'transport' && previousTime != null ? original - previousTime - previous.duration! : 0)
        const outgoingTravel = Math.max(30, visitDurationMinutes(next?.stop.transport) ?? 0,
          next?.place.type === 'transport' && nextTime != null ? nextTime - original - duration : 0)
        const lower = Math.max(clockMinutes(earliestTime) ?? original, original - 120,
          previousTime != null ? previousTime + previous!.duration! + incomingTravel : 0)
        const upper = Math.min(1440 - duration, original + 120,
          nextTime != null ? nextTime - duration - outgoingTravel : 1440 - duration)
        const options = (openingWindows(schedule, date) || []).flatMap(window => {
          const [from, to] = window.split('–').map(value => value === '24:00' ? 1440 : clockMinutes(value)!)
          const start = Math.max(from, lower), end = Math.min(to - duration, upper)
          return start <= end ? [Math.max(start, Math.min(original, end))] : []
        }).sort((a, b) => Math.abs(a - original) - Math.abs(b - original))
        if (options.length && openingAvailability(schedule, date, clock(options[0]), duration) === 'open') {
          stop.time = clock(options[0])
          stop.note = `${stop.note} ${openingCopy('adjusted')}`.trim()
          availability = 'open'
        }
      }
    }
    if (availability === 'closed') conflicts.push(place)
    else if (availability === 'unknown' || duration == null) {
      const hint = openingCopy('unknown')
      if (!stop.note.includes(hint)) stop.note = `${stop.note} ${hint}`.trim()
    }
  }
  return conflicts
}
