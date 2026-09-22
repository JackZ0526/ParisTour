// Localized copy extracted from src/features/place/services/recommendationPreferences.ts. Keep both dictionaries in sync.
import { createCopy } from '../copyFactory'

export const en = {
  "m7432b3e7a1": "No custom preference tags set; plan at a classic comfortable pace."
} as const

export const zhCN: Record<keyof typeof en, string> = {
  "m7432b3e7a1": "用户未设置特殊偏好标签，按经典舒适节奏安排。"
}

export const localizedCopy = createCopy(en, zhCN)
