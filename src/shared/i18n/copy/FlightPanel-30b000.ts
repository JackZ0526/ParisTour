// Localized copy extracted from src/features/flight/components/FlightPanel.tsx. Keep both dictionaries in sync.
import { createCopy } from '../copyFactory'

export const en = {
  "m5dee034255": "Queries scheduled times based on trip dates. If not found, please check the flight number and date; times may vary slightly from booking sites, please refer to your ticket.",
  "mc5c8b48d45": " Will query based on trip dates: Depart {p0} · Return {p1}{p2}."
} as const

export const zhCN: Record<keyof typeof en, string> = {
  "m5dee034255": "按行程日期查询计划起降时间。查不到时请核对航班号与日期；时刻可能与订票网站略有差异，请以机票为准。",
  "mc5c8b48d45": " 将按行程日期查询：出发 {p0} · 返程 {p1}{p2}。"
}

export const localizedCopy = createCopy(en, zhCN)
