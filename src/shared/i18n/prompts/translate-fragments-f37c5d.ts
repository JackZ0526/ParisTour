// Fixed-language prompt resources. Call-site locale selection remains explicit.
import { fixedCopy } from '../copyFactory'
export const en = {
  "mb36980739a": "Paris travel itinerary"
} as const
export const zhCN = {
  "mfc2907b1df": "翻译助手。把用户给出的文本译成简洁通顺的简体中文。",
  "m8f79ac954b": "旅行应用的地名翻译助手。把巴黎等地的店名/景点名译成简洁自然的简体中文显示名。",
  "m1327a71f58": "{ \"zh\": \"卢浮宫\" }"
} as const
export const englishPromptFragments = fixedCopy(en)
export const chinesePromptFragments = fixedCopy(zhCN)
