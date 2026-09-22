// Localized copy extracted from src/App.tsx. Keep both dictionaries in sync.
import { createCopy } from '../copyFactory'

export const en = {
  "m538259cd3a": "Loading hotels",
  "m96c6ab37bc": "Loading profile"
} as const

export const zhCN: Record<keyof typeof en, string> = {
  "m538259cd3a": "加载住宿",
  "m96c6ab37bc": "加载个人中心"
}

export const localizedCopy = createCopy(en, zhCN)
