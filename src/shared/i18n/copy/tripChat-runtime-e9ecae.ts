import { createCopy } from '../copyFactory'
export const en = {
  "md4ac60484d": "France",
  "m58ecc8701f": "spring",
  "m76e4fbe256": "summer",
  "mce4e99b183": "autumn",
  "mc63d5b7467": "winter",
  "me203a4c760": "the destination",
  "m250b4a823a": " (calendar dates {p0} / {p1})",
  "m07b930df67": "Place “{p0}”{p1}",
  "mcc85884dd5": "Hotel “{p0}”",
  "m5dbd015496": "Unavailable",
  "m6a8bb9403f": "{p0} ratings",
  "ma4af10fb35": "Review count unknown",
  "m5cca5d695f": "{p0} km",
  "ma6b0d87966": "; price level {p0}"
} as const
export const zhCN: Record<keyof typeof en, string> = {
  "md4ac60484d": "法国",
  "m58ecc8701f": "春季",
  "m76e4fbe256": "夏季",
  "mce4e99b183": "秋季",
  "mc63d5b7467": "冬季",
  "me203a4c760": "目的地",
  "m250b4a823a": "（日历日 {p0} / {p1}）",
  "m07b930df67": "地点「{p0}」{p1}",
  "mcc85884dd5": "酒店「{p0}」",
  "m5dbd015496": "暂无",
  "m6a8bb9403f": "{p0} 条评分",
  "ma4af10fb35": "评论数未知",
  "m5cca5d695f": "{p0} 公里",
  "ma6b0d87966": "；价位 {p0}"
}
export const runtimeCopy = createCopy(en, zhCN)
