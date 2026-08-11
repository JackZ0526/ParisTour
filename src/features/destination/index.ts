/** Public API of the destination feature. */
export { DestinationPanel } from './components/DestinationPanel'
export { loadDestination, saveDestination } from './services/destination'
export {
  FALLBACK_DESTINATIONS,
  loadPopularDestinations,
  refreshPopularDestinations,
} from './services/destinationSuggest'
export type { DestinationSuggestion } from '../../services/llm'
