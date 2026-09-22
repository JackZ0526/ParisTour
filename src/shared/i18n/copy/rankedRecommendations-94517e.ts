// Localized copy extracted from src/features/place/services/rankedRecommendations.ts. Keep both dictionaries in sync.
import { createCopy } from '../copyFactory'

export const en = {
  "m51c1dc73bb": "from hotel",
  "m1261110276": "Selected from verified places"
} as const

export const zhCN: Record<keyof typeof en, string> = {
  "m51c1dc73bb": "距酒店",
  "m1261110276": "从已核实地点中筛选"
}

export const localizedCopy = createCopy(en, zhCN)
