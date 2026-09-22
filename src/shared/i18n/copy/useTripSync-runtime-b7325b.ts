import { createCopy } from '../copyFactory'
export const en = {
  "m4d45f90234": "Paris"
} as const
export const zhCN: Record<keyof typeof en, string> = {
  "m4d45f90234": "巴黎"
}
export const runtimeCopy = createCopy(en, zhCN)
