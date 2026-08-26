import type { DayPlan, ItineraryStop, Place } from '../../../types'
import { ensureStopId } from '../../../appHelpers'
import { keepFixedHotelPositions } from '../../itinerary/utils/itineraryState'
import type {
  RemoteItineraryAnimation,
  TripMutation,
  TripMutationSource,
} from './mutationTypes'

export type ItineraryMutationDocument = {
  days: DayPlan[]
  customPlaces: Record<string, Place>
}

export type ItineraryMutationApplyResult = {
  document: ItineraryMutationDocument
  changed: boolean
  animation: RemoteItineraryAnimation | null
  ignoredReason?: 'duplicate' | 'entity_missing' | 'invalid_anchor'
}

function stopId(stop: ItineraryStop): string {
  return typeof stop.id === 'string' ? stop.id : ''
}

/** Parse `d{day}-{placeId}-occ{n}` or legacy `d{day}-{placeId}-{index}`. */
function parseEnsureStopId(
  id: string,
): { day: number; placeId: string; index: number | null; occurrence: number | null } | null {
  const occ = /^d(\d+)-(.+)-occ(\d+)$/.exec(id)
  if (occ) {
    return {
      day: Number(occ[1]),
      placeId: occ[2],
      index: null,
      occurrence: Number(occ[3]),
    }
  }
  const legacy = /^d(\d+)-(.+)-(\d+)$/.exec(id)
  if (!legacy) return null
  return {
    day: Number(legacy[1]),
    placeId: legacy[2],
    index: Number(legacy[3]),
    occurrence: null,
  }
}

function findStop(
  days: DayPlan[],
  id: string,
  hints?: { dayNumber?: number; placeId?: string },
) {
  if (!id && !hints?.placeId) return null
  if (id) {
    for (let dayIndex = 0; dayIndex < days.length; dayIndex += 1) {
      const day = days[dayIndex]
      for (let index = 0; index < day.stops.length; index += 1) {
        const stop = day.stops[index]
        if (stopId(stop) === id) return { dayIndex, index }
        if (ensureStopId(day.day, stop, index, day.stops) === id) {
          return { dayIndex, index }
        }
      }
    }
  }

  const parsed = id ? parseEnsureStopId(id) : null
  const dayNumber = hints?.dayNumber ?? parsed?.day
  const placeId = hints?.placeId ?? parsed?.placeId
  if (dayNumber == null || !placeId) return null

  const dayIndex = days.findIndex((day) => day.day === dayNumber)
  if (dayIndex < 0) return null
  const day = days[dayIndex]

  if (parsed?.index != null) {
    const atIndex = day.stops[parsed.index]
    if (atIndex?.placeId === placeId) {
      return { dayIndex, index: parsed.index }
    }
  }
  if (parsed?.occurrence != null) {
    let seen = 0
    for (let index = 0; index < day.stops.length; index += 1) {
      if (day.stops[index]?.placeId !== placeId) continue
      if (seen === parsed.occurrence) return { dayIndex, index }
      seen += 1
    }
  }

  const matches: number[] = []
  day.stops.forEach((stop, index) => {
    if (stop.placeId === placeId) matches.push(index)
  })
  if (matches.length === 1) return { dayIndex, index: matches[0] }
  return null
}

function insertionIndex(
  stops: ItineraryStop[],
  dayNumber: number,
  afterStopId?: string | null,
  beforeStopId?: string | null,
): number | null {
  if (beforeStopId) {
    const before = stops.findIndex(
      (stop, index) =>
        stopId(stop) === beforeStopId ||
        ensureStopId(dayNumber, stop, index, stops) === beforeStopId,
    )
    if (before < 0) return null
    return before
  }
  if (afterStopId) {
    const after = stops.findIndex(
      (stop, index) =>
        stopId(stop) === afterStopId ||
        ensureStopId(dayNumber, stop, index, stops) === afterStopId,
    )
    if (after < 0) return null
    return after + 1
  }
  return stops.length
}

function animationFor(
  mutation: TripMutation,
  source: TripMutationSource,
  fromDayNumber?: number,
): RemoteItineraryAnimation | null {
  if (source !== 'remote') return null
  const revision = 'revision' in mutation ? Number(mutation.revision) : undefined
  const base = { mutationId: mutation.mutationId, revision }
  switch (mutation.type) {
    case 'stop.add':
      return { ...base, type: 'add', stopId: mutation.payload.stop.id, toDayNumber: mutation.payload.dayNumber }
    case 'stop.delete':
      return { ...base, type: 'delete', stopId: mutation.payload.stopId, fromDayNumber }
    case 'stop.move':
      return {
        ...base,
        type: 'move',
        stopId: mutation.payload.stopId,
        fromDayNumber,
        toDayNumber: mutation.payload.targetDayNumber,
      }
    case 'stop.replace':
      return { ...base, type: 'replace', stopId: mutation.payload.stopId, fromDayNumber }
    case 'stop.patch':
      return { ...base, type: 'patch', stopId: mutation.payload.stopId, fromDayNumber }
    default:
      return null
  }
}

export function applyItineraryMutation(
  current: ItineraryMutationDocument,
  mutation: TripMutation,
  source: TripMutationSource = 'local',
): ItineraryMutationApplyResult {
  const days = current.days
  const lastDayNumber = days.reduce((max, day) => Math.max(max, day.day), 0)

  switch (mutation.type) {
    case 'stop.add': {
      const id = mutation.payload.stop.id
      if (findStop(days, id)) {
        return { document: current, changed: false, animation: null, ignoredReason: 'duplicate' }
      }
      const dayIndex = days.findIndex((day) => day.day === mutation.payload.dayNumber)
      if (dayIndex < 0) {
        return { document: current, changed: false, animation: null, ignoredReason: 'entity_missing' }
      }
      const at = insertionIndex(
        days[dayIndex].stops,
        days[dayIndex].day,
        mutation.payload.afterStopId,
        mutation.payload.beforeStopId,
      )
      if (at == null) {
        return { document: current, changed: false, animation: null, ignoredReason: 'invalid_anchor' }
      }
      const nextStops = [...days[dayIndex].stops]
      nextStops.splice(at, 0, mutation.payload.stop)
      const nextDays = [...days]
      nextDays[dayIndex] = {
        ...days[dayIndex],
        stops: keepFixedHotelPositions(
          days[dayIndex].day,
          nextStops,
          lastDayNumber,
        ),
      }
      const nextPlaces = mutation.payload.place
        ? { ...current.customPlaces, [mutation.payload.place.id]: mutation.payload.place }
        : current.customPlaces
      return {
        document: { days: nextDays, customPlaces: nextPlaces },
        changed: true,
        animation: animationFor(mutation, source),
      }
    }

    case 'stop.delete': {
      const found = findStop(days, mutation.payload.stopId, {
        dayNumber: mutation.payload.dayNumber,
        placeId: mutation.payload.placeId,
      })
      if (!found) {
        return { document: current, changed: false, animation: null, ignoredReason: 'entity_missing' }
      }
      const nextDays = [...days]
      const day = days[found.dayIndex]
      nextDays[found.dayIndex] = {
        ...day,
        stops: day.stops.filter((_, index) => index !== found.index),
      }
      return {
        document: { ...current, days: nextDays },
        changed: true,
        animation: animationFor(mutation, source, day.day),
      }
    }

    case 'stop.move': {
      if (
        mutation.payload.stopId === mutation.payload.afterStopId ||
        mutation.payload.stopId === mutation.payload.beforeStopId
      ) {
        return { document: current, changed: false, animation: null, ignoredReason: 'invalid_anchor' }
      }
      const found = findStop(days, mutation.payload.stopId)
      const targetDayIndex = days.findIndex(
        (day) => day.day === mutation.payload.targetDayNumber,
      )
      if (!found || targetDayIndex < 0) {
        return { document: current, changed: false, animation: null, ignoredReason: 'entity_missing' }
      }
      const fromDay = days[found.dayIndex]
      const moving = fromDay.stops[found.index]
      const nextDays = days.map((day) => ({ ...day, stops: [...day.stops] }))
      nextDays[found.dayIndex].stops.splice(found.index, 1)
      const targetStops = nextDays[targetDayIndex].stops
      const at = insertionIndex(
        targetStops,
        nextDays[targetDayIndex].day,
        mutation.payload.afterStopId,
        mutation.payload.beforeStopId,
      )
      if (at == null) {
        return { document: current, changed: false, animation: null, ignoredReason: 'invalid_anchor' }
      }
      targetStops.splice(at, 0, moving)
      nextDays[found.dayIndex].stops = keepFixedHotelPositions(
        nextDays[found.dayIndex].day,
        nextDays[found.dayIndex].stops,
        lastDayNumber,
      )
      nextDays[targetDayIndex].stops = keepFixedHotelPositions(
        nextDays[targetDayIndex].day,
        nextDays[targetDayIndex].stops,
        lastDayNumber,
      )
      return {
        document: { ...current, days: nextDays },
        changed: true,
        animation: animationFor(mutation, source, fromDay.day),
      }
    }

    case 'stop.replace': {
      const found = findStop(days, mutation.payload.stopId)
      if (!found) {
        return { document: current, changed: false, animation: null, ignoredReason: 'entity_missing' }
      }
      const day = days[found.dayIndex]
      const previous = day.stops[found.index]
      const nextStop: ItineraryStop = {
        ...previous,
        ...mutation.payload.patch,
        id: mutation.payload.stopId,
        placeId: mutation.payload.place.id,
      }
      const nextStops = [...day.stops]
      nextStops[found.index] = nextStop
      const nextDays = [...days]
      nextDays[found.dayIndex] = { ...day, stops: nextStops }
      return {
        document: {
          days: nextDays,
          customPlaces: {
            ...current.customPlaces,
            [mutation.payload.place.id]: mutation.payload.place,
          },
        },
        changed: true,
        animation: animationFor(mutation, source, day.day),
      }
    }

    case 'stop.patch': {
      const found = findStop(days, mutation.payload.stopId)
      if (!found) {
        return { document: current, changed: false, animation: null, ignoredReason: 'entity_missing' }
      }
      const day = days[found.dayIndex]
      const nextStops = [...day.stops]
      nextStops[found.index] = {
        ...nextStops[found.index],
        ...mutation.payload.fields,
      }
      const nextDays = [...days]
      nextDays[found.dayIndex] = { ...day, stops: nextStops }
      return {
        document: { ...current, days: nextDays },
        changed: true,
        animation: animationFor(mutation, source, day.day),
      }
    }

    case 'day.patch': {
      const dayIndex = days.findIndex((day) => day.day === mutation.payload.dayNumber)
      if (dayIndex < 0) {
        return { document: current, changed: false, animation: null, ignoredReason: 'entity_missing' }
      }
      const nextDays = [...days]
      nextDays[dayIndex] = { ...days[dayIndex], ...mutation.payload.fields }
      return { document: { ...current, days: nextDays }, changed: true, animation: null }
    }

    case 'custom_place.upsert': {
      const place = mutation.payload.place
      if (current.customPlaces[place.id] === place) {
        return { document: current, changed: false, animation: null, ignoredReason: 'duplicate' }
      }
      return {
        document: {
          ...current,
          customPlaces: { ...current.customPlaces, [place.id]: place },
        },
        changed: true,
        animation: null,
      }
    }

    case 'custom_place.delete': {
      if (!(mutation.payload.placeId in current.customPlaces)) {
        return { document: current, changed: false, animation: null, ignoredReason: 'entity_missing' }
      }
      const nextPlaces = { ...current.customPlaces }
      delete nextPlaces[mutation.payload.placeId]
      return {
        document: { ...current, customPlaces: nextPlaces },
        changed: true,
        animation: null,
      }
    }

    case 'day.replace': {
      const nextDay = {
        ...mutation.payload.day,
        day: mutation.payload.dayNumber,
      }
      const dayIndex = days.findIndex((day) => day.day === mutation.payload.dayNumber)
      const nextDays = [...days]
      if (dayIndex < 0) nextDays.push(nextDay)
      else nextDays[dayIndex] = nextDay
      nextDays.sort((a, b) => a.day - b.day)
      return {
        document: {
          days: nextDays,
          customPlaces: mutation.payload.places
            ? { ...current.customPlaces, ...mutation.payload.places }
            : current.customPlaces,
        },
        changed: true,
        animation: null,
      }
    }

    case 'itinerary.replace':
      return {
        document: {
          days: mutation.payload.days,
          customPlaces: mutation.payload.customPlaces || {},
        },
        changed: true,
        animation: null,
      }
  }
}

export function applyItineraryMutations(
  current: ItineraryMutationDocument,
  mutations: TripMutation[],
  source: TripMutationSource = 'local',
): ItineraryMutationApplyResult {
  let document = current
  let changed = false
  let animation: RemoteItineraryAnimation | null = null
  let ignoredReason: ItineraryMutationApplyResult['ignoredReason']
  for (const mutation of mutations) {
    const result = applyItineraryMutation(document, mutation, source)
    document = result.document
    changed ||= result.changed
    animation = result.animation || animation
    if (result.ignoredReason === 'entity_missing') ignoredReason = 'entity_missing'
    else if (!ignoredReason && result.ignoredReason) ignoredReason = result.ignoredReason
  }
  return { document, changed, animation, ignoredReason }
}

