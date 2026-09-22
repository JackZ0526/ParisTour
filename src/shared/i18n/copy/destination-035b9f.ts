// Localized copy extracted from src/shared/services/llm/business/destination.ts. Keep both dictionaries in sync.
import { createCopy } from '../copyFactory'

export const en = {
  "m82f5e426d8": "OpenAI API key is not configured; cannot generate popular destinations.",
  "m4e89c71c69": "Travel inspiration assistant. Suggest currently popular travel cities/regions for the user's quick-pick destination chips.",
  "m334adc195d": "{ \"destinations\": [{ \"name\": \"Barcelona\", \"subtitle\": \"Barcelona\" }, { \"name\": \"Kyoto\", \"subtitle\": \"Kyoto\" }] }",
  "m7004b0307d": "Model did not return any destinations.",
  "mce3851a07e": "Could not parse the destination list.",
  "mabcf4c869d": "Destination list is empty after filtering."
} as const

export const zhCN: Record<keyof typeof en, string> = {
  "m82f5e426d8": "未配置 OpenAI API Key，无法生成热门目的地。",
  "m4e89c71c69": "旅行灵感助手。为用户推荐当下热门旅游城市/目的地。",
  "m334adc195d": "{ \"destinations\": [{ \"name\": \"巴塞罗那\", \"subtitle\": \"Barcelona\" }, { \"name\": \"京都\", \"subtitle\": \"Kyoto\" }] }",
  "m7004b0307d": "大模型没有返回热门目的地。",
  "mce3851a07e": "无法解析热门目的地列表。",
  "mabcf4c869d": "热门目的地列表为空。"
}

export const localizedCopy = createCopy(en, zhCN)
