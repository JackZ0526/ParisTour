import { createCopy } from '../copyFactory'
export const en = {
  "m5c5836f85d": "Replacement for “{p1}” on day {p0}",
  "md4440fa5a4": "Planned addition to day {p0}",
  "ma7e5deeeba": "Café",
  "m8eafe03b67": "Restaurant",
  "m5cf9828b5c": "Attraction",
  "m7a42b7b1e9": "Your itinerary is unchanged. Confirm in the details to replace “{p1}” with {p0}.",
  "me1d5f69ab6": "Your itinerary is unchanged. Confirm in the details to add {p0}.",
  "m33314b696d": "I do not want the suggested “{p0}”.",
  "m682d30329c": "Recommend a different place to replace “{p1}” on day {p0}.",
  "m3b0ae048c6": "Do not recommend these again: {p0}.",
  "me67f4e1945": "Return replace_place directly, keeping fromPlaceName as “{p0}” and source as \"recommend\".",
  "m98529f1fbc": "Add to the end of the day",
  "mdf2b817b21": "Insert in route order",
  "md4034d8050": "I do not like the suggested “{p0}”.",
  "m21bb8843ed": "Recommend a different {p0} for day {p1} ({p2}).",
  "m8e63935a38": "Return add_place directly with source set to \"recommend\"."
} as const
export const zhCN: Record<keyof typeof en, string> = {
  "m5c5836f85d": "用于替换第 {p0} 天的「{p1}」",
  "md4440fa5a4": "计划加入第 {p0} 天行程",
  "ma7e5deeeba": "咖啡馆",
  "m8eafe03b67": "餐厅",
  "m5cf9828b5c": "景点",
  "m7a42b7b1e9": "行程尚未改动——请在详情页确认是否用{p0}替换「{p1}」。",
  "me1d5f69ab6": "行程尚未改动——请在详情页确认是否将{p0}加入行程。",
  "m33314b696d": "刚才推荐的「{p0}」我不想用。",
  "m682d30329c": "请再推荐另一个不同的地点，用来替换第 {p0} 天的「{p1}」。",
  "m3b0ae048c6": "绝对不要再推荐：{p0}。",
  "me67f4e1945": "请直接输出 replace_place（fromPlaceName 仍为「{p0}」，source 必须为 \"recommend\"）。",
  "m98529f1fbc": "加到当天末尾",
  "mdf2b817b21": "按最顺路插入",
  "md4034d8050": "刚才推荐的「{p0}」我不喜欢。",
  "m21bb8843ed": "请再推荐另一家{p0}加入第 {p1} 天（{p2}）。",
  "m8e63935a38": "请直接输出 add_place（source 必须为 \"recommend\"）。"
}
export const runtimeCopy = createCopy(en, zhCN)
