import { createCopy } from '../copyFactory'
export const en = {
  "m5985017e99": "Arrival in Paris",
  "me46a2e2594": "TBD",
  "ma14acedf5e": "After clearing CDG, head to the hotel to check in, drop your bags, and rest before going out.",
  "m5a6894206d": "RER B / taxi from CDG",
  "m7b9d6848c7": "Check-in 30–45 min",
  "m2dad347696": "45 min",
  "m1966ba1b9f": "60 min",
  "m8f29e5c330": "75 min",
  "meaed892bd1": "70 min",
  "m26b07203b4": "Disneyland Paris",
  "macb35fba12": "Park day via RER A",
  "m6814f3629f": "RER A → Marne-la-Vallée–Chessy (about 45–60 min)",
  "m79b62069f5": "Full day",
  "m1172f4a8f5": "Departure",
  "ma1c8cd8ef8": "Work backwards from the flight",
  "m15d63a7e94": "RER B or taxi",
  "m3a1c2538bc": "Departure"
} as const
export const zhCN: Record<keyof typeof en, string> = {
  "m5985017e99": "抵达巴黎",
  "me46a2e2594": "待定",
  "ma14acedf5e": "从 CDG 出关后先到酒店办理入住、放下行李，稍作休息再出门。",
  "m5a6894206d": "RER B / 出租车自戴高乐机场",
  "m7b9d6848c7": "入住 30–45 分钟",
  "m2dad347696": "45 分钟",
  "m1966ba1b9f": "60 分钟",
  "m8f29e5c330": "75 分钟",
  "meaed892bd1": "70 分钟",
  "m26b07203b4": "巴黎迪士尼",
  "macb35fba12": "RER A 乐园日",
  "m6814f3629f": "RER A → Marne-la-Vallée–Chessy（约 45–60 分钟）",
  "m79b62069f5": "全天",
  "m1172f4a8f5": "返程",
  "ma1c8cd8ef8": "按航班倒推",
  "m15d63a7e94": "RER B 或出租车",
  "m3a1c2538bc": "离境"
}
export const runtimeCopy = createCopy(en, zhCN)
