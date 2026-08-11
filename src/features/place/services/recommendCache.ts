import type {
  PlaceRecommendation,
  RecommendPlaceType,
} from '../../../services/llm'
import {
  getLlmArtifact,
  removeLlmArtifact,
  removeLlmArtifactsByPrefix,
  setLlmArtifact,
} from '../../../services/llmArtifactStore'

export interface DayRecommendCache {
  day: number
  /** Highest batch retained for backwards compatibility with older snapshots. */
  batch: number
  /** Each recommendation tab advances independently. */
  batches?: Partial<Record<RecommendPlaceType, number>>
  model: string
  recommendations: PlaceRecommendation[]
  fetchedAt: number
}

function dayKey(day: number) {
  return `recommend:day:${day}`
}

export function getDayRecommendCache(day: number): DayRecommendCache | null {
  const entry = getLlmArtifact<DayRecommendCache>(dayKey(day))
  if (!entry || !Array.isArray(entry.recommendations) || !entry.recommendations.length) {
    return null
  }
  return entry
}

export function setDayRecommendCache(entry: DayRecommendCache) {
  setLlmArtifact(dayKey(entry.day), entry)
}

export function clearDayRecommendCache(day: number) {
  removeLlmArtifact(dayKey(day))
}

export function clearAllRecommendCache() {
  removeLlmArtifactsByPrefix('recommend:day:')
}
