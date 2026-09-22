import { createCopy } from '../copyFactory'
export const en = {
  "mb93610fe1f": "Paris city center"
} as const
export const zhCN: Record<keyof typeof en, string> = {
  "mb93610fe1f": "巴黎市区"
}
export const runtimeCopy = createCopy(en, zhCN)
