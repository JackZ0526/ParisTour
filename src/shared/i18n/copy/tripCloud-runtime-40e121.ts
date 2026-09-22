import { createCopy } from '../copyFactory'
export const en = {
  "mbff55f2cd9": "Editable",
  "mffc1d065fb": "Read-only",
  "mc376d7a0b7": "From {p0} · {p1}",
  "mdc6a73a7b2": "Trip data is too large to upload",
  "mf516c6c646": "An unexpected empty itinerary was prevented from overwriting the cloud copy."
} as const
export const zhCN: Record<keyof typeof en, string> = {
  "mbff55f2cd9": "可编辑",
  "mffc1d065fb": "只读",
  "mc376d7a0b7": "来自 {p0} · {p1}",
  "mdc6a73a7b2": "行程数据过大，无法写入云端",
  "mf516c6c646": "已阻止异常空行程覆盖云端存档"
}
export const runtimeCopy = createCopy(en, zhCN)
