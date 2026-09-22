import { createCopy } from '../copyFactory'
export const en = {
  rule: 'Each candidate has openingWindows for the itinerary date in local time. Schedule the entire visit within ONE window, including its full duration. Empty windows mean closed: do not use that venue, even if preferences mention it. Null means hours are unverified, not 24-hour opening. Opening hours override preferred times and venue preferences. Use only eligible supplied candidate IDs for sightseeing and meals.',
  unknown: 'Opening hours need confirmation for this date.',
  adjusted: 'Visit time adjusted to opening hours.',
  repairRule: 'The previous draft failed availability validation. openingRepair lists the rejected visits and their actual windows. Rebuild the day from the remaining candidates; do not repeat those incompatible time slots. Allow the entire visit and travel between stops. Reduce optional stops if needed rather than overfilling the day. Preserve flight and hotel constraints.',
  conflict: 'Could not create a route within the published opening hours. Please try again or choose other places.',
  noCandidates: 'No available places were found for this date. Try another date or area.',
}
export const zhCN: Record<keyof typeof en, string> = {
  rule: '候选地点的 openingWindows 是行程当天的当地营业时段。到达时间及完整停留时长必须落在同一个时段内。空数组表示当天不营业，即使偏好提及也不可安排。null 表示未核实，不表示全天营业。营业时间优先于偏好时间和指定地点，景点与餐饮仅使用可用候选 ID。',
  unknown: '当天营业时间待确认。',
  adjusted: '已按营业时间调整到访时间。',
  repairRule: '上次草稿未通过营业校验。openingRepair 列出了冲突到访时间及实际营业窗口。请从剩余候选重新编排行程，不要重复不合适的时间安排。完整停留及地点间交通都必须留足时间，必要时减少可选地点，不要把行程塞满。保留航班和酒店约束。',
  conflict: '未能生成符合已公布营业时间的路线，请重试或选择其他地点。',
  noCandidates: '当天没有找到可用地点，请调整日期或区域。',
}
export const openingCopy = createCopy(en, zhCN)
