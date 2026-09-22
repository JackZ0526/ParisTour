// Localized copy extracted from src/shared/components/AppUpdatePrompt.tsx. Keep both dictionaries in sync.
import { createCopy } from '../copyFactory'

export const en = {
  "me4073ba2f0": "Update failed. Please try again.",
  "m8176d7ba03": "New version ready. Refresh after saving your work.",
  "m0171badeae": "Later",
  "m1ad1faa250": "Refresh"
} as const

export const zhCN: Record<keyof typeof en, string> = {
  "me4073ba2f0": "更新失败，请重试。",
  "m8176d7ba03": "新版本已就绪，保存当前操作后即可刷新。",
  "m0171badeae": "稍后",
  "m1ad1faa250": "刷新更新"
}

export const localizedCopy = createCopy(en, zhCN)
