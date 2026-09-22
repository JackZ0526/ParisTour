// Fixed-language prompt resources. Call-site locale selection remains explicit.
import { fixedCopy } from '../copyFactory'
export const en = {
  "m7cc3fa5b6d": "Soft preference: except for Day 1 and the Disney day, prefer starting ordinary sightseeing days with a cafe from verifiedCandidates; skip if route or timing does not work.",
  "m3006f55b55": "No requirement to start with a coffee shop.",
  "mbc6c7f1431": "Soft preference: prefer including Champs-Élysées (\"attr-champs\") and Arc de Triomphe (\"attr-arc\") when the route allows, ideally on the same day.",
  "mbd8d7f7467": "No requirement to include Champs-Élysées or the Arc de Triomphe.",
  "ma81432d4a4": "Soft preference: when timing allows, prefer scheduling both lunch and dinner (type=restaurant); may be reduced on flight days, Disney days, or tight-pace days.",
  "m0884b45a37": "Plan meals flexibly per route and time of day; never substitute cafe for a sit-down meal.",
  "m9dbc30a490": "Soft preference: cluster same-area spots on the same day; prefer minimal walking and transfers.",
  "m6983aa22f1": "Moderate walking for richer itineraries is acceptable when the route is sound.",
  "m1345d16985": "Soft preference: do not volunteer Louvre or Versailles; honour the user if they explicitly ask for one.",
  "m1f3b1cacd2": "Louvre and Versailles are fair game based on route and time.",
  "m7b5a1f810b": "No standalone Disney day today.",
  "mee31a150fd": "Plan meals flexibly per route and time.",
  "m296e0c9a1b": "the destination"
} as const
export const zhCN = {
  "mcd7467f666": "{p0}{p1}旅行规划师。根据旅客的日期、航班、酒店和已验证地点候选生成完整多日行程。",
  "m4bc04a8a66": "软偏好：除 Day 1 与迪士尼日外，普通游览日优先以 verifiedCandidates 中的 cafe 开始；路线或时间不合适时可不安排。",
  "md2ce2d3868": "不要求以咖啡馆开始。",
  "m566b63729b": "硬规则：倒数第二天（Day {p0}）必须为巴黎迪士尼全日：pace=乐园日，出游站只保留一个 \"attr-disney\" 与末站回酒店，不另列园内餐饮或其它景点；其它天禁止安排迪士尼。",
  "m6bcce49c37": "行程不足 3 天或未开启迪士尼偏好时，不安排独立迪士尼日。",
  "m975fff2af8": "软偏好：优先包含香榭丽舍大街（\"attr-champs\"）与凯旋门（\"attr-arc\"），适合时同日顺路安排。",
  "m6989a610a4": "不强制包含香榭丽舍大街与凯旋门。",
  "m314c318245": "软偏好：时间允许时优先安排午餐与晚餐两顿正餐（type=restaurant）；航班日、迪士尼日或节奏过紧时可减少。",
  "mcaf6738894": "餐饮站按当天路线与时间灵活安排，正餐不得用 cafe 类型代替。",
  "mefd4b93896": "软偏好：同日地点尽量同片区聚类，优先少步行、少换乘。",
  "m8f5450803c": "在路线合理的前提下可接受适量步行以丰富行程。",
  "mbd01ca4386": "软偏好：默认不主动安排卢浮宫或凡尔赛；用户明确要求时优先服从。",
  "m63cc2fb15d": "卢浮宫和凡尔赛可按路线与时间正常考虑。",
  "mcc1eb6756c": "只输出 JSON，不要 markdown，不要解释。文案用简体中文，可带一点俏皮但不油腻。",
  "m326725c072": "Day 1 餐饮：抵达办入住后若仍有空档，再安排午餐和/或晚餐；落地过晚可只安排晚餐。",
  "m97edffa19f": "硬规则：迪士尼全日已固定在 Day {p0}，今天禁止安排迪士尼。",
  "maaeef7238f": "今天不安排独立迪士尼日。",
  "m1cd39fe1a2": "软偏好：时间允许时优先安排午餐与晚餐两顿正餐（type=restaurant）。",
  "mb0d8375c00": "餐饮站按当天路线与时间灵活安排。",
  "m36cd58f391": "不强制安排香榭丽舍或凯旋门。",
  "m7e6249b075": "可接受适量步行以换取更丰富的行程。"
} as const
export const englishPromptFragments = fixedCopy(en)
export const chinesePromptFragments = fixedCopy(zhCN)
