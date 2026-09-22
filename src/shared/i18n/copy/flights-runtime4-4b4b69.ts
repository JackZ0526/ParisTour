import { createCopy } from '../copyFactory'
export const en = {
  "m09696609ca": "Outbound (recommended)",
  "m841fc16c97": "Vancouver",
  "m80715448b2": "About 9–10 hours",
  "ma9df2fd523": "Public flight information retrieved with AI web search.",
  "m0a749a7368": "Return (recommended)",
  "m395a2c3bbd": "About 10 hours",
  "m79d2d4c1d4": "AF374 is the suggested return flight. AI checks public flight information; change the number to match your ticket."
} as const
export const zhCN: Record<keyof typeof en, string> = {
  "m09696609ca": "去程（推荐）",
  "m841fc16c97": "温哥华",
  "m80715448b2": "约 9–10 小时",
  "ma9df2fd523": "由大模型联网检索公开航班信息。",
  "m0a749a7368": "返程（推荐）",
  "m395a2c3bbd": "约 10 小时",
  "m79d2d4c1d4": "返程主飞 AF374；由大模型联网检索。若你的机票不同可自行改航班号。"
}
export const runtimeCopy4 = createCopy(en, zhCN)
