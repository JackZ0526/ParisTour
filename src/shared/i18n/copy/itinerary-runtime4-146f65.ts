import { createCopy } from '../copyFactory'
export const en = {
  "m4af69d006b": "Arrival in Paris is expected on {p0}, local time. The itinerary starts on the departure date.",
  "m61cbf8ddcd": "The outbound flight arrives in Paris on {p0}, local time. The itinerary starts that day.",
  "mc54655d63b": "The full arrival date is unavailable. Based on the supplied flight times, the itinerary provisionally starts on {p0}."
} as const
export const zhCN: Record<keyof typeof en, string> = {
  "m4af69d006b": "去程预计巴黎当地 {p0} 抵达，行程从出发日当天起算。",
  "m61cbf8ddcd": "去程航班显示巴黎当地 {p0} 抵达，行程从该日起算。",
  "mc54655d63b": "航班未提供完整抵达日期；根据已有结构化时刻，行程暂从 {p0} 起算。"
}
export const runtimeCopy4 = createCopy(en, zhCN)
