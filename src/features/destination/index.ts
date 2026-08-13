/** Public API of the destination feature. */
export { DestinationPanel } from './components/DestinationPanel'
export { loadDestination, saveDestination } from './services/destination'
export {
  appendCityToQuery,
  locationBelongsToCity,
  tripCityFromDestination,
} from './services/tripCity'
export type { TripCity } from './services/tripCity'
export {
  FALLBACK_DESTINATIONS,
  loadPopularDestinations,
  refreshPopularDestinations,
} from './services/destinationSuggest'
export type { DestinationSuggestion } from '../../shared/services/llm/llm'
