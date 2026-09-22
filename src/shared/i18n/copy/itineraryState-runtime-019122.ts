import { createCopy } from '../copyFactory'
export const en = {
  "m15cc9b300c": "Return to the hotel to rest at the end of the day.",
  "m7dad739c5f": "Metro or walk back to the hotel",
  "ma8cafdfc74": "Overnight"
} as const
export const zhCN: Record<keyof typeof en, string> = {
  "m15cc9b300c": "回酒店休息，结束今天的行程。",
  "m7dad739c5f": "地铁 / 步行回酒店",
  "ma8cafdfc74": "过夜"
}
export const runtimeCopy = createCopy(en, zhCN)
