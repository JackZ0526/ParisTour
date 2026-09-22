import { createCopy } from '../copyFactory'
export const en = {
  "m7153d91387": " · Reasoning {p0}"
} as const
export const zhCN: Record<keyof typeof en, string> = {
  "m7153d91387": " · 思考{p0}"
}
export const runtimeCopy = createCopy(en, zhCN)
