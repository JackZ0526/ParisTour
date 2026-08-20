import type { FlightInfo } from '../../../types'

const STORAGE_KEY = 'paris-tour-flights-v1'

export interface FlightSelection {
  outbound: FlightInfo | null
  returnFlight: FlightInfo | null
}

export interface PersistedFlightSelection extends FlightSelection {
  outboundInput: string
  returnInput: string
}

function areFlightEndpointsEqual(
  left: FlightInfo['from'],
  right: FlightInfo['from'],
): boolean {
  if (left === right) return true
  if (!left || !right) return false
  return (
    left.code === right.code &&
    left.name === right.name &&
    left.city === right.city &&
    left.terminal === right.terminal &&
    left.scheduled === right.scheduled &&
    left.actual === right.actual &&
    left.timeZone === right.timeZone
  )
}

function areFlightInfosEqual(
  left: FlightInfo | null,
  right: FlightInfo | null,
): boolean {
  if (left === right) return true
  if (!left || !right) return false
  return (
    left.flightNumber === right.flightNumber &&
    left.airline === right.airline &&
    left.status === right.status &&
    areFlightEndpointsEqual(left.from, right.from) &&
    areFlightEndpointsEqual(left.to, right.to) &&
    left.duration === right.duration &&
    left.aircraft === right.aircraft &&
    left.source === right.source &&
    left.rawNote === right.rawNote
  )
}

/** Ignore remount-created object identities when the selected flights are unchanged. */
export function areFlightSelectionsEqual(
  left: FlightSelection,
  right: FlightSelection,
): boolean {
  return (
    areFlightInfosEqual(left.outbound, right.outbound) &&
    areFlightInfosEqual(left.returnFlight, right.returnFlight)
  )
}

/** Both legs looked up successfully (non-null FlightInfo with a flight number). */
export function areFlightsComplete(
  flights: FlightSelection | null | undefined,
): boolean {
  return Boolean(
    flights?.outbound?.flightNumber?.trim() &&
      flights?.returnFlight?.flightNumber?.trim(),
  )
}

function isFlightInfo(value: unknown): value is FlightInfo {
  if (!value || typeof value !== 'object') return false
  const info = value as FlightInfo
  return typeof info.flightNumber === 'string' && typeof info.source === 'string'
}

export function loadFlightSelection(): PersistedFlightSelection | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PersistedFlightSelection>
    if (!parsed || typeof parsed !== 'object') return null
    const outbound = isFlightInfo(parsed.outbound) ? parsed.outbound : null
    const returnFlight = isFlightInfo(parsed.returnFlight) ? parsed.returnFlight : null
    if (!outbound && !returnFlight) return null
    return {
      outbound,
      returnFlight,
      outboundInput:
        typeof parsed.outboundInput === 'string'
          ? parsed.outboundInput
          : outbound?.flightNumber ?? '',
      returnInput:
        typeof parsed.returnInput === 'string'
          ? parsed.returnInput
          : returnFlight?.flightNumber ?? '',
    }
  } catch {
    return null
  }
}

export function saveFlightSelection(state: PersistedFlightSelection) {
  try {
    if (!state.outbound && !state.returnFlight) {
      localStorage.removeItem(STORAGE_KEY)
      return
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* ignore quota */
  }
}

export function clearFlightSelection() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
