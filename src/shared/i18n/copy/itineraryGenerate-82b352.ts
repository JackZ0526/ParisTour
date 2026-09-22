// Localized copy extracted from src/features/itinerary/services/itineraryGenerate.ts. Keep both dictionaries in sync.
import { createCopy } from '../copyFactory'

export const en = {
  "mc80f6ce28a": "Free time",
  "m8b4c1f5047": "Day still to be filled in.",
  "m284e918fd8": "Day {p0}"
} as const

export const zhCN: Record<keyof typeof en, string> = {
  "mc80f6ce28a": "自由安排",
  "m8b4c1f5047": "今天行程待补全。",
  "m284e918fd8": "第 {p0} 天"
}

export const localizedCopy = createCopy(en, zhCN)
