import { createCopy } from '../copyFactory'
export const en = {
  conflict: 'This day still conflicts with the saved itinerary. Please regenerate this day.',
} as const
export const zhCN: Record<keyof typeof en, string> = {
  conflict: '这一天仍与已保存的行程冲突，请重新生成这一天。',
}
export const poolCopy = createCopy(en, zhCN)
