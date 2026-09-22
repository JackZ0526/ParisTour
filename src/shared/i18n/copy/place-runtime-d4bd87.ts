import { createCopy } from '../copyFactory'
export const en = {
  "m5985017e99": "Arrival in Paris",
  "m98cd75602d": "Day {p0}",
  "ma7e5deeeba": "Café",
  "m5cf9828b5c": "Attraction",
  "m8eafe03b67": "Restaurant",
  "m56741142db": "Why We Love It",
  "m5ea2e0cde2": "Description"
} as const
export const zhCN: Record<keyof typeof en, string> = {
  "m5985017e99": "抵达巴黎",
  "m98cd75602d": "第 {p0} 天",
  "ma7e5deeeba": "咖啡馆",
  "m5cf9828b5c": "景点",
  "m8eafe03b67": "餐厅",
  "m56741142db": "推荐理由",
  "m5ea2e0cde2": "简介"
}
export const runtimeCopy = createCopy(en, zhCN)
