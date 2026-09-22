import { createCopy } from '../copyFactory'
export const en = {
  "mb33f8fa7f5": "{p0}/{p1}",
  "mf181fc0a13": "{p0} · {p1} local time"
} as const
export const zhCN: Record<keyof typeof en, string> = {
  "mb33f8fa7f5": "{p0}月{p1}日",
  "mf181fc0a13": "{p0} · {p1}当地"
}
export const runtimeCopy = createCopy(en, zhCN)
