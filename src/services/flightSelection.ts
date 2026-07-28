import type { FlightInfo } from '../types'

const STORAGE_KEY = 'paris-tour-flights-v1'

export interface PersistedFlightSelection {
  outbound: FlightInfo | null
  returnFlight: FlightInfo | null
  outboundInput: string
  returnInput: string
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
