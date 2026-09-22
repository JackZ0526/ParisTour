// Localized copy extracted from src/hooks/useItineraryGeneration.ts. Keep both dictionaries in sync.
import { createCopy } from '../copyFactory'

export const en = {
  "m1c136e10eb": "Itinerary translation did not complete. Please try again."
} as const

export const zhCN: Record<keyof typeof en, string> = {
  "m1c136e10eb": "行程文案翻译未完成，请重试。"
}

export const localizedCopy = createCopy(en, zhCN)
