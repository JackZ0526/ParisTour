import { createCopy } from '../copyFactory'
export const en = {
  "m8026eb273e": "The model returned no itinerary.",
  "md6d3cb1805": "Could not parse the itinerary JSON. Please try again.\npreview={p0}",
  "m4897c42c42": "No itinerary days were returned. Please try again.\nkeys={p0}",
  "m4f6b1c05b6": "Follow navigation or take the metro to the next stop.",
  "mff20f6c2d9": "Could not read the itinerary days. Please try again.",
  "m8e24503f06": "The model returned no day plan.",
  "mdc12471a08": "Could not parse the day plan JSON. Please try again.\npreview={p0}",
  "m00f4728c54": "The day plan is empty. Please try again.\npreview={p0}",
  "m840997ab9d": "Could not read the day's stops. Please try again.",
  "mc35e8b33b6": "No OpenAI API key is configured for itinerary translation."
} as const
export const zhCN: Record<keyof typeof en, string> = {
  "m8026eb273e": "大模型没有返回行程。",
  "md6d3cb1805": "无法解析行程 JSON，请再试一次。\npreview={p0}",
  "m4897c42c42": "行程天数为空，请再试一次。\nkeys={p0}",
  "m4f6b1c05b6": "按导航或地铁前往下一个地点。",
  "mff20f6c2d9": "无法解析行程天数，请再试一次。",
  "m8e24503f06": "大模型没有返回单日行程。",
  "mdc12471a08": "无法解析单日行程 JSON，请再试一次。\npreview={p0}",
  "m00f4728c54": "单日行程为空，请再试一次。\npreview={p0}",
  "m840997ab9d": "无法解析单日行程站点，请再试一次。",
  "mc35e8b33b6": "未配置 OpenAI API Key，无法翻译行程文案。"
}
export const runtimeCopy3 = createCopy(en, zhCN)
