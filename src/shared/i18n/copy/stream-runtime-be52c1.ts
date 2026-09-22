import { createCopy } from '../copyFactory'
export const en = {
  "m3bb953077e": "AI is disabled (VITE_LLM_ENABLED=false).",
  "m142ba457c6": "OpenAI web search returned no content."
} as const
export const zhCN: Record<keyof typeof en, string> = {
  "m3bb953077e": "大模型已关闭（VITE_LLM_ENABLED=false）。",
  "m142ba457c6": "OpenAI 联网查询没有返回内容。"
}
export const runtimeCopy = createCopy(en, zhCN)
