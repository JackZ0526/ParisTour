import { createCopy } from '../copyFactory'
export const en = {
  "m9ddd7a3e28": "Operated by {p0}{p1}",
  "m8f7598e3e4": "Scheduled flight {p0}",
  "m8f65989f6d": "{p0} (ticket: {p1})",
  "mb2635d52c0": "Scheduled times are indicative and may differ from booking sites.",
  "m2522c5ddca": "Refer to your ticket.",
  "m7882432a80": "Timetable lookup failed ({p0}){p1}",
  "m7b63156362": "No timetable result for {p0} ({p1}, route {p2})",
  "mb9ce73a099": "AeroDataBox lookup failed ({p0}){p1}"
} as const
export const zhCN: Record<keyof typeof en, string> = {
  "m9ddd7a3e28": "实际承运 {p0}{p1}",
  "m8f7598e3e4": "时刻表班次 {p0}",
  "m8f65989f6d": "{p0}（票面 {p1}）",
  "mb2635d52c0": "计划时刻仅供参考，可能与订票网站略有差异",
  "m2522c5ddca": "请以机票为准",
  "m7882432a80": "TimeTable 查询失败 ({p0}){p1}",
  "m7b63156362": "未在 TimeTable 找到 {p0}（{p1}，航线 {p2}）",
  "mb9ce73a099": "AeroDataBox 查询失败 ({p0}){p1}"
}
export const runtimeCopy = createCopy(en, zhCN)
