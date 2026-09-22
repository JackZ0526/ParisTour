import { createCopy } from '../copyFactory'
export const en = {
  "m5baf5f7a41": "Based in {p0}",
  "m384e6a0cae": "{p0} days"
} as const
export const zhCN: Record<keyof typeof en, string> = {
  "m5baf5f7a41": "以{p0}为落脚点",
  "m384e6a0cae": "{p0}天"
}
export const runtimeCopy = createCopy(en, zhCN)
