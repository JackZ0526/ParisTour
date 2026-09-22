// Localized copy extracted from src/features/chat/components/ChatWorkStepPanels.tsx. Keep both dictionaries in sync.
import { createCopy } from '../copyFactory'

export const en = {
  "m99551c1ae1": "Skipped: ",
  "mf652ae72de": "Waiting: ",
  "m8b8cbf31e3": "Reasoning Process",
  "m5bb34a4081": "Collapse",
  "mab58149f37": "View"
} as const

export const zhCN: Record<keyof typeof en, string> = {
  "m99551c1ae1": "已跳过：",
  "mf652ae72de": "等待：",
  "m8b8cbf31e3": "深度思考过程",
  "m5bb34a4081": "收起",
  "mab58149f37": "展开"
}

export const localizedCopy = createCopy(en, zhCN)
