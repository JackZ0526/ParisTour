import { createCopy } from '../copyFactory'
export const en = {
  "m989d380323": "{p0}, a good addition to your Paris itinerary.",
  "m9e46a5a4a2": "A good addition to today's itinerary.",
  "m0cb92ec098": "Disney day",
  "mc1a13b1393": "Countryside drive",
  "m2a62487e50": "Departure day",
  "m713a3fee13": "Today's plan: {p0}{p1}. Adjust the order and time at each stop to suit your energy.",
  "md6f624e596": "No places planned for today yet.",
  "mc4a06175d3": "{p0}-day trip",
  "md9860f81f5": "This trip"
} as const
export const zhCN: Record<keyof typeof en, string> = {
  "m989d380323": "{p0}，适合安排进巴黎行程。",
  "m9e46a5a4a2": "适合补充进今天的行程节奏。",
  "m0cb92ec098": "迪士尼日",
  "mc1a13b1393": "近郊自驾",
  "m2a62487e50": "返程日",
  "m713a3fee13": "今天主要安排：{p0}{p1}。可根据体力微调顺序与停留时间。",
  "md6f624e596": "今天还没有安排地点。",
  "mc4a06175d3": "{p0} 日行程",
  "md9860f81f5": "本次行程"
}
export const runtimeCopy4 = createCopy(en, zhCN)
