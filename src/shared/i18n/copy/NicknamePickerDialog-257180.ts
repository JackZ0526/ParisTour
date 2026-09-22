// Localized copy extracted from src/features/navigation/components/NicknamePickerDialog.tsx. Keep both dictionaries in sync.
import { createCopy } from '../copyFactory'

export const en = {
  "m69e224ceb4": "Nickname cannot exceed {p0} characters"
} as const

export const zhCN: Record<keyof typeof en, string> = {
  "m69e224ceb4": "昵称不能超过 {p0} 个字符"
}

export const localizedCopy = createCopy(en, zhCN)
