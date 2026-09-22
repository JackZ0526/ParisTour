// Localized copy extracted from src/features/chat/components/chatHelpers.ts. Keep both dictionaries in sync.
import { createCopy } from '../copyFactory'

export const en = {
  "me90f381b27": "Chat assistant encountered an error. Please try again later."
} as const

export const zhCN: Record<keyof typeof en, string> = {
  "me90f381b27": "对话助手出错了，请稍后再试。"
}

export const localizedCopy = createCopy(en, zhCN)
