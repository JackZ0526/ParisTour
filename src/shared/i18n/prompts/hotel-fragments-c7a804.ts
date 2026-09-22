// Fixed-language prompt resources. Call-site locale selection remains explicit.
import { fixedCopy } from '../copyFactory'
export const en = {
  "m5cf534f1c1": "{p0} day{p1} in Paris",
  "m1eb93acae0": "When count is 1, isBest must be true.",
  "mcb03fe7028": "Exactly 1 hotel has isBest=true as the top pick; the rest false.",
  "mcbb82df109": "Paris {p0}-day trip, metro-first",
  "m2293c23437": "Paris trip, metro-first",
  "mc0f39e677d": "Central Paris"
} as const
export const zhCN = {} as const
export const englishPromptFragments = fixedCopy(en)
export const chinesePromptFragments = fixedCopy(zhCN)
