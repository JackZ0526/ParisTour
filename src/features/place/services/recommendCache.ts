import type {
  PlaceRecommendation,
  RecommendPlaceType,
} from '../../../shared/services/llm/llm'
import {
  getLlmArtifact,
  removeLlmArtifact,
  removeLlmArtifactsByPrefix,
  setLlmArtifact,
} from '../../../shared/services/llm/llmArtifactStore'
import { getLocale, type Locale } from '../../../shared/i18n'

export interface DayRecommendCache {
  day: number
  /** Highest batch retained for backwards compatibility with older snapshots. */
  batch: number
  /** Each recommendation tab advances independently. */
  batches?: Partial<Record<RecommendPlaceType, number>>
  model: string
  recommendations: PlaceRecommendation[]
  fetchedAt: number
  locale?: Locale
}

function dayKey(day: number, locale?: Locale) {
  const loc = locale || getLocale()
  return `recommend:v2:${loc}:day:${day}`
}

export function getDayRecommendCache(day: number, locale?: Locale): DayRecommendCache | null {
  const entry = getLlmArtifact<DayRecommendCache>(dayKey(day, locale))
  if (!entry || !Array.isArray(entry.recommendations) || !entry.recommendations.length) {
    return null
  }
  return entry
}

export function setDayRecommendCache(entry: DayRecommendCache) {
  setLlmArtifact(dayKey(entry.day, entry.locale), entry)
}

export function clearDayRecommendCache(day: number, locale?: Locale) {
  removeLlmArtifact(dayKey(day, locale))
}

export function clearAllRecommendCache() {
  removeLlmArtifactsByPrefix('recommend:v2:')
  removeLlmArtifactsByPrefix('recommend:day:')
}
