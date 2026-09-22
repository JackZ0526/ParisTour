// Fixed-language prompt resources. Call-site locale selection remains explicit.
import { fixedCopy } from '../copyFactory'
export const en = {
  "md43078bfa1": "Disney Day",
  "madd0c567bb": "Scenic Drive",
  "m51f63f0cb2": "Arrival in Paris",
  "md5775f34f9": "Departure Day",
  "mddee2e5158": ", and more",
  "m0d987c8ee3": "No places scheduled for today yet.",
  "mb1c0493db3": "{p0}-day trip",
  "m96b9c54e38": "Soft preference: Avoid Louvre and Versailles by default unless explicitly asked.",
  "m37f03acf49": "Louvre and Versailles can participate normally in candidate comparison."
} as const
export const zhCN = {
  "m8d21fe1d0c": "巴黎{p0}编辑。根据当天地点列表，用简体中文生成短标题、主题与总结。",
  "m44da01c4d1": "巴黎旅行顾问。根据游客当天已有行程和推荐偏好，从已验证候选中挑选互补、少重复的地点。",
  "m3ce5c77592": "软偏好：默认避开卢浮宫和凡尔赛；用户明确要求时可以推荐。",
  "m96ff8bc2e3": "卢浮宫和凡尔赛可正常参与候选比较。"
} as const
export const englishPromptFragments = fixedCopy(en)
export const chinesePromptFragments = fixedCopy(zhCN)
