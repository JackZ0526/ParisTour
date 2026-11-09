import { createCopy } from '../copyFactory'

export const en = {
  loading: 'Finding this place…',
  unavailable: 'Could not find this place. Please try again.',
  retry: 'Try again',
}
export const zhCN: Record<keyof typeof en, string> = {
  loading: '正在查找这个地点…',
  unavailable: '暂时没有找到这个地点，请重试。',
  retry: '重试',
}
export const chatPlacesCopy = createCopy(en, zhCN)
