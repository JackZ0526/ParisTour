import { createCopy } from '../copyFactory'
export const en = {
  "m005602ce1f": "Could not generate the itinerary. Please try again.",
  "mcf7d21139c": "Itinerary generation failed. Please try again.",
  "md04abf225c": "Could not regenerate this day. Please try again.",
  "m92a7c89836": "Day regeneration failed. Please try again."
} as const
export const zhCN: Record<keyof typeof en, string> = {
  "m005602ce1f": "暂时无法生成行程，请稍后再试。",
  "mcf7d21139c": "行程生成失败，请再试一次。",
  "md04abf225c": "暂时无法重新生成当天行程，请稍后再试。",
  "m92a7c89836": "当天行程重新生成失败，请再试一次。"
}
export const runtimeCopy = createCopy(en, zhCN)
