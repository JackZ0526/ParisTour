import { createCopy } from '../copyFactory'
export const en = {
  "m6eac4a4866": "No model API key is configured (OpenAI / Gemini).",
  "mc703eb216c": "Set a server-side DEEPSEEK_API_KEY or OPENAI_API_KEY in .env or Vercel, without the VITE_ prefix.",
  "mdab89e7750": "Repair JSON. Return only one valid JSON object, without Markdown or commentary.",
  "m131f711572": "Preserve the original meaning, language and fields; fix only quotes, commas, brackets, escapes or truncated structure.",
  "ma1b5b93851": "The previous model request failed",
  "m12934b0877": "{p0}. Switched to {p1} automatically.",
  "m99a191b81c": "All model requests failed."
} as const
export const zhCN: Record<keyof typeof en, string> = {
  "m6eac4a4866": "未配置可用的大模型 API Key（OpenAI / Gemini）。",
  "mc703eb216c": "未配置服务端 DEEPSEEK_API_KEY 或 OPENAI_API_KEY（请写在 .env / Vercel，不要用 VITE_ 前缀）。",
  "mdab89e7750": "你是 JSON 修复器。只输出一个有效 JSON 对象，不要 markdown 或解释。",
  "m131f711572": "保留原回复语义与字段；只修复引号、逗号、括号、转义或被截断的结构。",
  "ma1b5b93851": "上一个模型请求失败",
  "m12934b0877": "{p0}，已自动切换到 {p1}",
  "m99a191b81c": "所有大模型请求都失败了。"
}
export const runtimeCopy4 = createCopy(en, zhCN)
