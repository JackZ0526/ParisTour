import { createCopy } from '../copyFactory'
export const en = {
  "m4d45f90234": "Paris",
  "m300ee3dee4": "Loading…"
} as const
export const zhCN: Record<keyof typeof en, string> = {
  "m4d45f90234": "巴黎",
  "m300ee3dee4": "加载中…"
}
export const runtimeCopy = createCopy(en, zhCN)
