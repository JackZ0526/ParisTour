import {
  isLlmConfigured,
  suggestPopularDestinations,
  type DestinationSuggestion,
} from '../../../shared/services/llm/llm'
import { getLlmArtifact, setLlmArtifact } from '../../../shared/services/llm/llmArtifactStore'
import { translate } from '../../../shared/i18n'

const ARTIFACT_KEY = 'destinations:popular'

export const FALLBACK_DESTINATIONS: DestinationSuggestion[] = [
  { name: '巴黎', subtitle: 'Paris' },
  { name: '东京', subtitle: 'Tokyo' },
  { name: '罗马', subtitle: 'Rome' },
  { name: '巴塞罗那', subtitle: 'Barcelona' },
  { name: '纽约', subtitle: 'New York' },
  { name: '伦敦', subtitle: 'London' },
  { name: '京都', subtitle: 'Kyoto' },
  { name: '佛罗伦萨', subtitle: 'Florence' },
]

interface CachePayload {
  fetchedAt: number
  destinations: DestinationSuggestion[]
}

function readCache(): DestinationSuggestion[] | null {
  try {
    const parsed = getLlmArtifact<CachePayload>(ARTIFACT_KEY)
    if (!parsed?.fetchedAt || !Array.isArray(parsed.destinations)) return null
    const cleaned = parsed.destinations
      .filter((d) => d && typeof d.name === 'string' && d.name.trim())
      .map((d) => ({
        name: d.name.trim(),
        subtitle: typeof d.subtitle === 'string' && d.subtitle.trim() ? d.subtitle.trim() : undefined,
      }))
    return cleaned.length ? cleaned : null
  } catch {
    return null
  }
}

function writeCache(destinations: DestinationSuggestion[]) {
  const payload: CachePayload = { fetchedAt: Date.now(), destinations }
  setLlmArtifact(ARTIFACT_KEY, payload)
}

function excludeNamesFrom(destinations: DestinationSuggestion[]): string[] {
  const names: string[] = []
  for (const d of destinations) {
    if (d.name.trim()) names.push(d.name.trim())
    if (d.subtitle?.trim()) names.push(d.subtitle.trim())
  }
  return names
}

/**
 * Load popular destination chips once. Reuses durable store until the user
 * explicitly refreshes (「再给我来一批」). Never returns empty — falls back
 * to a static list if LLM fails.
 */
export async function loadPopularDestinations(): Promise<{
  destinations: DestinationSuggestion[]
  source: 'cache' | 'llm' | 'fallback'
}> {
  const cached = readCache()
  if (cached) return { destinations: cached, source: 'cache' }

  if (!isLlmConfigured()) {
    return { destinations: FALLBACK_DESTINATIONS, source: 'fallback' }
  }

  try {
    const list = await suggestPopularDestinations()
    if (list.length) {
      writeCache(list)
      return { destinations: list, source: 'llm' }
    }
  } catch {
    /* fall through */
  }

  return { destinations: FALLBACK_DESTINATIONS, source: 'fallback' }
}

/**
 * Ask the LLM for a fresh chip batch, bypassing the durable cache.
 * Passes the current batch (and optional selection) so the model avoids repeats.
 * On success, replaces the cache. On failure, throws and leaves cache + chips unchanged.
 */
export async function refreshPopularDestinations(options: {
  currentDestinations: DestinationSuggestion[]
  selectedDestination?: string
  batch?: number
}): Promise<{
  destinations: DestinationSuggestion[]
  source: 'llm'
}> {
  if (!isLlmConfigured()) {
    throw new Error(translate('errors.openaiNotConfigured'))
  }

  const list = await suggestPopularDestinations({
    excludeNames: excludeNamesFrom(options.currentDestinations),
    currentDestination: options.selectedDestination,
    batch: Math.max(2, options.batch || 2),
    count: 8,
  })

  if (!list.length) {
    throw new Error(translate('errors.noNewDestinations'))
  }

  writeCache(list)
  return { destinations: list, source: 'llm' }
}
