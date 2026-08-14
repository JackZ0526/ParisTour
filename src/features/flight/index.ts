/** Public API of the flight feature. */
export { FlightPanel } from './components/FlightPanel'
export {
  lookupFlight,
  meaningfulFlightStatus,
  templateToFlightInfo,
  type FlightLookupDirection,
  type FlightTravelContext,
} from './services/flightLookup'
export {
  clearFlightSelection,
  areFlightsComplete,
  loadFlightSelection,
  saveFlightSelection,
  type FlightSelection,
  type PersistedFlightSelection,
} from './services/flightSelection'
export {
  clearAllFlightCache,
  clearCachedFlight,
  flightCacheKey,
  getCachedFlight,
  hasCompleteSchedule,
  purgeNonApiFlightCache,
  setCachedFlight,
} from './services/flightCache'
export { recommendedFlights } from './constants/flights'
export { formatAirportLocalTime, parseAirportLocalTime } from './utils/flightTime'
