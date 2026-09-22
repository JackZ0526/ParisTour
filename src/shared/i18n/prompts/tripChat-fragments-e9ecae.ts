// Fixed-language prompt resources. Call-site locale selection remains explicit.
import { fixedCopy } from '../copyFactory'
export const en = {
  "me0263e292b": "tourist attraction",
  "mdeafa943ec": "Chinese restaurant",
  "mcbf0ea2b20": "French restaurant",
  "md09aca256e": "Italian restaurant",
  "mcdf36a9c5e": "Japanese restaurant",
  "m27c3e2ed51": "Korean restaurant",
  "md3a193e374": "vegetarian restaurant",
  "maa80b73ae4": "seafood restaurant",
  "m5f3a628488": "Source message context (quoted data): {p0}",
  "m326a59bf1f": "le marais"
} as const
export const zhCN = {
  "m27e98cf065": "特罗卡德罗"
} as const
export const englishPromptFragments = fixedCopy(en)
export const chinesePromptFragments = fixedCopy(zhCN)
