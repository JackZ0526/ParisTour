import { useState } from 'react'
import {
  loadRecommendationPreferences,
  type RecommendationPreferences,
} from '../features/place/services/recommendationPreferences'

/**
 * useTripDialogs — dialog open state & preference value extracted from App.tsx.
 */
export function useTripDialogs() {
  const [shareOpen, setShareOpen] = useState(false)
  const [backupOpen, setBackupOpen] = useState(false)
  const [recommendationPreferencesOpen, setRecommendationPreferencesOpen] =
    useState(false)
  const [recommendationPreferences, setRecommendationPreferences] =
    useState<RecommendationPreferences>(() =>
      loadRecommendationPreferences(),
    )

  return {
    shareOpen,
    setShareOpen,
    backupOpen,
    setBackupOpen,
    recommendationPreferencesOpen,
    setRecommendationPreferencesOpen,
    recommendationPreferences,
    setRecommendationPreferences,
  }
}

