// Localized copy extracted from src/features/place/components/GooglePlacePage.tsx. Keep both dictionaries in sync.
import { createCopy } from '../copyFactory'

export const en = {
  "m3efc48c121": "Google provided the rating and review count, but text reviews are not available via Places API."
} as const

export const zhCN: Record<keyof typeof en, string> = {
  "m3efc48c121": "Google 已返回评分与评论总数，但暂未向 Places API 提供可展示的评论正文。"
}

export const localizedCopy = createCopy(en, zhCN)
