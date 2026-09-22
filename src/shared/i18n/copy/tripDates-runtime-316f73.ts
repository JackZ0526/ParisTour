import { createCopy } from '../copyFactory'
export const en = {
  "m8f7a64e226": "{p0} days · {p1} nights",
  "mb33f8fa7f5": "{p0}/{p1}"
} as const
export const zhCN: Record<keyof typeof en, string> = {
  "m8f7a64e226": "{p0}个白天 · {p1}晚",
  "mb33f8fa7f5": "{p0}月{p1}日"
}
export const runtimeCopy = createCopy(en, zhCN)
