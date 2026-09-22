import { createCopy } from '../copyFactory'
export const en = {
  "mb33f8fa7f5": "{p0}/{p1}",
  "mc63d5b7467": "winter",
  "m58ecc8701f": "spring",
  "m76e4fbe256": "summer",
  "mce4e99b183": "autumn",
  "mb36f1f6772": "Adjust to the day's pace.",
  "m98cd75602d": "Day {p0}",
  "me3c015188d": "Paris itinerary",
  "m0e4c137d43": "Adjust today's route to the map and your energy level.",
  "ma8ce6d4840": "OpenAI API key is not configured; cannot generate itinerary.",
  "me203a4c760": "the destination"
} as const
export const zhCN: Record<keyof typeof en, string> = {
  "mb33f8fa7f5": "{p0}月{p1}日",
  "mc63d5b7467": "冬季",
  "m58ecc8701f": "春季",
  "m76e4fbe256": "夏季",
  "mce4e99b183": "秋季",
  "mb36f1f6772": "按当天节奏灵活调整。",
  "m98cd75602d": "第 {p0} 天",
  "me3c015188d": "巴黎日程",
  "m0e4c137d43": "今天按地图与体力微调即可。",
  "ma8ce6d4840": "未配置 OpenAI API Key，无法生成行程。",
  "me203a4c760": "目的地"
}
export const runtimeCopy = createCopy(en, zhCN)
