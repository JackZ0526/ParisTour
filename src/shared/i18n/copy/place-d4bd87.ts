// Localized copy extracted from src/shared/services/llm/business/place.ts. Keep both dictionaries in sync.
import { createCopy } from '../copyFactory'

export const en = {
  "websiteMissing": "Google did not supply a website URI",
  "m0132cf2cfb": "Google websiteUri：{p0}",
  "m30a559e649": "Travel copywriter. Write a concise, punchy 1-2 sentence itinerary note for a stop.",
  "m84997a6e3e": "<output_format>1–2 short sentences (maximum 30 words). Focus strictly on what to do or see here. Do NOT write an encyclopedia essay, background history, or marketing fluff. No title, no bullet points.</output_format>",
  "m2b46e94290": "Travel advisor. Write an engaging place review.",
  "me9bb5d43cd": "{p0} pace",
  "m284e918fd8": "Day {p0}",
  "mc80f6ce28a": "Free time",
  "me73362652d": "No places added yet — pick spots on the map to start building this day.",
  "m9e8dbfa115": "Fits well into today's rhythm."
} as const

export const zhCN: Record<keyof typeof en, string> = {
  "websiteMissing": "Google 未提供官网地址",
  "m0132cf2cfb": "Google 官网地址：{p0}",
  "m30a559e649": "旅行文案助手。用简短精炼的 1–2 句话为行程地点写游玩亮点。",
  "m84997a6e3e": "<output_format>1–2 句精炼游玩亮点（不超过 40 字）。突出游览体验，切勿写长篇百科历史。不要标题，不要列表。</output_format>",
  "m2b46e94290": "旅行顾问。为地点详情页写中文点评。",
  "me9bb5d43cd": "{p0}节奏",
  "m284e918fd8": "第 {p0} 天",
  "mc80f6ce28a": "自由安排",
  "me73362652d": "今天还没有安排地点，添加景点后会自动生成标题与总结。",
  "m9e8dbfa115": "适合补充进今天的行程"
}

export const localizedCopy = createCopy(en, zhCN)
