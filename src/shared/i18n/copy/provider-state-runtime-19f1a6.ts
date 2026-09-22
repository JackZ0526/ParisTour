import { createCopy } from '../copyFactory'
export const en = {
  "mcb43f4f1f6": "Switched to {p0}",
  "m6116d5a1fb": "Manually switched to {p0}"
} as const
export const zhCN: Record<keyof typeof en, string> = {
  "mcb43f4f1f6": "已切换到 {p0}",
  "m6116d5a1fb": "已手动切换到 {p0}"
}
export const runtimeCopy = createCopy(en, zhCN)
