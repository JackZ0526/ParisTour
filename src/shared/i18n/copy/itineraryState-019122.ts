// Localized copy extracted from src/features/itinerary/utils/itineraryState.ts. Keep both dictionaries in sync.
import { createCopy } from '../copyFactory'

export const en = {
  "m0ba00e0d01": "After clearing CDG, head to the hotel to check in, drop your bags, and rest before going out.",
  "m284e918fd8": "Day {p0}",
  "mc80f6ce28a": "Free time",
  "me73362652d": "No places added yet — pick spots on the map to start building this day.",
  "mce0802155e": "Follow navigation to the next stop."
} as const

export const zhCN: Record<keyof typeof en, string> = {
  "m0ba00e0d01": "从 CDG 出关后先到酒店办理入住、放下行李，稍作休息再出门。",
  "m284e918fd8": "第 {p0} 天",
  "mc80f6ce28a": "自由安排",
  "me73362652d": "今天还没有安排地点，添加景点后会自动生成标题与总结。",
  "mce0802155e": "按导航前往下一个地点。"
}

export const localizedCopy = createCopy(en, zhCN)
