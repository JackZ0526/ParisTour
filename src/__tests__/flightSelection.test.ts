import { describe, expect, it } from 'vitest'
import {
  areFlightSelectionsEqual,
  type FlightSelection,
} from '../features/flight/services/flightSelection'

const selection: FlightSelection = {
  outbound: {
    flightNumber: 'AC304',
    airline: 'Air Canada',
    status: 'Scheduled',
    from: {
      code: 'YVR',
      city: 'Vancouver',
      scheduled: '2026-09-10 08:00-07:00',
      timeZone: 'America/Vancouver',
    },
    to: {
      code: 'YUL',
      city: 'Montreal',
      scheduled: '2026-09-10 15:35-04:00',
      timeZone: 'America/Toronto',
    },
    duration: '4h 35m',
    aircraft: 'A220',
    source: 'timetable',
  },
  returnFlight: null,
}

describe('areFlightSelectionsEqual', () => {
  it('treats separately hydrated copies as the same selection', () => {
    const hydratedCopy = JSON.parse(JSON.stringify(selection)) as FlightSelection

    expect(hydratedCopy).not.toBe(selection)
    expect(hydratedCopy.outbound).not.toBe(selection.outbound)
    expect(areFlightSelectionsEqual(selection, hydratedCopy)).toBe(true)
  })

  it('detects a meaningful nested flight change', () => {
    const changed = JSON.parse(JSON.stringify(selection)) as FlightSelection
    if (changed.outbound?.from) changed.outbound.from.terminal = 'M'

    expect(areFlightSelectionsEqual(selection, changed)).toBe(false)
  })
})
