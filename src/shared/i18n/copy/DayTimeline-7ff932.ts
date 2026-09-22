// Localized copy extracted from src/features/itinerary/components/DayTimeline.tsx. Keep both dictionaries in sync.
import { createCopy } from '../copyFactory'

export const en = {
  "m9d73d2eaaa": "Calculating navigation…",
  "m8ba45f2ac6": "View map directions"
} as const

export const zhCN: Record<keyof typeof en, string> = {
  "m9d73d2eaaa": "正在计算导航…",
  "m8ba45f2ac6": "查看地图导航"
}

export const localizedCopy = createCopy(en, zhCN)
