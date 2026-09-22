import { createCopy } from '../copyFactory'
export const en = {
  "m5babfb7953": "Return one JSON object only, with reply before actions.",
  "md99b4b080f": "Return one JSON object matching the schema. No Markdown or extra fields."
} as const
export const zhCN: Record<keyof typeof en, string> = {
  "m5babfb7953": "只输出一个 JSON 对象。字段顺序：reply 优先，再 actions。",
  "md99b4b080f": "只输出一个符合 Schema 的 JSON 对象。不要 markdown，不要额外字段。"
}
export const runtimeCopy3 = createCopy(en, zhCN)
