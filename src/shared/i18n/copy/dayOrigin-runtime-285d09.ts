import { createCopy } from '../copyFactory'
export const en = {
  "m10ef913e0b": "Check in and drop off your luggage. Address: {p0}",
  "m6c63690cc5": "Metro {p0}",
  "mf01540c8a6": "hotel"
} as const
export const zhCN: Record<keyof typeof en, string> = {
  "m10ef913e0b": "办理入住、放下行李。地址：{p0}",
  "m6c63690cc5": "地铁 {p0}",
  "mf01540c8a6": "酒店"
}
export const runtimeCopy = createCopy(en, zhCN)
