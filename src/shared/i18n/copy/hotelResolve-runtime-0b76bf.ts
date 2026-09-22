import { createCopy } from '../copyFactory'
export const en = {
  "mcfbbf42958": "Paris hotel",
  "m54ed77bc93": "{p0}, a base for your Paris itinerary.",
  "m7a0b145afa": "Check the nearest metro station"
} as const
export const zhCN: Record<keyof typeof en, string> = {
  "mcfbbf42958": "巴黎酒店",
  "m54ed77bc93": "{p0}，适合作为巴黎行程住宿起点。",
  "m7a0b145afa": "请确认最近地铁站"
}
export const runtimeCopy = createCopy(en, zhCN)
