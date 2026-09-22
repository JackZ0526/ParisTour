import { createCopy } from '../copyFactory'
export const en = {
  "m450121ee1b": "Original place"
} as const
export const zhCN: Record<keyof typeof en, string> = {
  "m450121ee1b": "原地点"
}
export const runtimeCopy2 = createCopy(en, zhCN)
