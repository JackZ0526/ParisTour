import { createCopy } from '../copyFactory'
export const en = {
  "m66fe9f5be6": "Configure an OpenAI API key to get hotel recommendations.",
  "m124648392d": "{p0}-day Paris trip",
  "m98f36a7100": "Paris trip",
  "m209fdff4d3": "The model returned no hotel recommendations.",
  "mf1f66563e2": "Could not read the hotel recommendations. Please try again.",
  "m3cf21586ab": "No hotels were recommended. Please try again."
} as const
export const zhCN: Record<keyof typeof en, string> = {
  "m66fe9f5be6": "未配置 OpenAI API Key，无法推荐酒店。",
  "m124648392d": "{p0}日巴黎行程",
  "m98f36a7100": "巴黎行程",
  "m209fdff4d3": "大模型没有返回酒店推荐。",
  "mf1f66563e2": "无法解析酒店推荐列表，请再试一次。",
  "m3cf21586ab": "酒店推荐为空，请再试一次。"
}
export const runtimeCopy4 = createCopy(en, zhCN)
