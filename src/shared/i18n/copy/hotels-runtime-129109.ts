import { createCopy } from '../copyFactory'
export const en = {
  "m2b5e719937": "Arrondissement {p0}",
  "mb93610fe1f": "Paris city center"
} as const
export const zhCN: Record<keyof typeof en, string> = {
  "m2b5e719937": "{p0}区",
  "mb93610fe1f": "巴黎市区"
}
export const runtimeCopy = createCopy(en, zhCN)
