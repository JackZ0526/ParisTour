import { createCopy } from '../copyFactory'
export const en = {
  "m64daac63aa": "Replace “{p0}”",
  "m770bb9ca1c": "Replace “{p0}” ({p1}) with a more suitable Paris hotel",
  "mf43c61089f": "Replaced “{p0}” with “{p1}” and selected it as your hotel.",
  "me40ebbb363": "Replaced “{p0}” with “{p1}”.",
  "m5779a99596": "Replace these hotels: {p0}",
  "m746a60b63f": "Replaced {p0} hotels and selected “{p1}”.",
  "md2bdc9d5dd": "Replaced {p0} hotels as requested."
} as const
export const zhCN: Record<keyof typeof en, string> = {
  "m64daac63aa": "替换「{p0}」",
  "m770bb9ca1c": "替换「{p0}」（{p1}），给一家更合适的巴黎酒店",
  "mf43c61089f": "已将「{p0}」换成「{p1}」，并设为当前住宿",
  "me40ebbb363": "已将「{p0}」换成「{p1}」",
  "m5779a99596": "替换这些酒店：{p0}",
  "m746a60b63f": "已替换 {p0} 家酒店；当前住宿改为「{p1}」",
  "md2bdc9d5dd": "已按你的要求替换 {p0} 家酒店"
}
export const runtimeCopy = createCopy(en, zhCN)
