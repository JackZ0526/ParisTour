import { createCopy } from '../copyFactory'
export const en = {
  "m1966ba1b9f": "60 min"
} as const
export const zhCN: Record<keyof typeof en, string> = {
  "m1966ba1b9f": "60 分钟"
}
export const runtimeCopy = createCopy(en, zhCN)
