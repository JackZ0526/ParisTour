import { createCopy } from '../copyFactory'
export const en = {
  "m0cbda6b524": "Internet",
  "m4fb5c52c92": "Dining",
  "m37188c928f": "Rooms",
  "m4b81846f62": "Services",
  "m1a26edf94a": "Other",
  "md685485797": "Superb",
  "mb997afc069": "Very good",
  "m27e4fe4c3f": "Good",
  "m05c4965a75": "Pleasant"
} as const
export const zhCN: Record<keyof typeof en, string> = {
  "m0cbda6b524": "网络",
  "m4fb5c52c92": "餐饮",
  "m37188c928f": "客房",
  "m4b81846f62": "服务",
  "m1a26edf94a": "其他",
  "md685485797": "好极了",
  "mb997afc069": "非常好",
  "m27e4fe4c3f": "好",
  "m05c4965a75": "令人愉悦"
}
export const runtimeCopy = createCopy(en, zhCN)
