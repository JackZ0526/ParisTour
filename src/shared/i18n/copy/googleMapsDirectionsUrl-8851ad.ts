// Localized copy extracted from src/features/map/services/googleMapsDirectionsUrl.ts. Keep both dictionaries in sync.
import { createCopy } from '../copyFactory'

export const en = {
  "mc11731f120": "Walking",
  "me081344bb6": "Transit"
} as const

export const zhCN: Record<keyof typeof en, string> = {
  "mc11731f120": "步行",
  "me081344bb6": "公共交通"
}

export const localizedCopy = createCopy(en, zhCN)
