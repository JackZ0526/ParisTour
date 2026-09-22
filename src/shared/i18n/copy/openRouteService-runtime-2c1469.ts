import { createCopy } from '../copyFactory'
export const en = {
  "m2bdf5c8ea7": "Road route request failed (HTTP {p0})"
} as const
export const zhCN: Record<keyof typeof en, string> = {
  "m2bdf5c8ea7": "道路路线请求失败（HTTP {p0}）"
}
export const runtimeCopy = createCopy(en, zhCN)
