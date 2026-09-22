// Fixed-language prompt resources. Call-site locale selection remains explicit.
import { fixedCopy } from '../copyFactory'
export const en = {} as const
export const zhCN = {
  "m020620eecf": "{ tags: [\"艺术画廊\", \"意式风味\", \"牛排肉食\"] }",
  "m7465a7d69b": "{ \"tags\": [\"艺术画廊\", \"意式风味\", \"牛排肉食\"] }"
} as const
export const englishPromptFragments = fixedCopy(en)
export const chinesePromptFragments = fixedCopy(zhCN)
