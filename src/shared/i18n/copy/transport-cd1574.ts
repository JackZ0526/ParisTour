// Localized copy extracted from src/shared/services/llm/transport.ts. Keep both dictionaries in sync.
import { createCopy } from '../copyFactory'

export const en = {
  "md773dda0fa": "Unsupported image format. Please upload JPG, PNG, WebP, or GIF images."
} as const

export const zhCN: Record<keyof typeof en, string> = {
  "md773dda0fa": "图片格式不支持，请上传 JPG、PNG、WebP 或 GIF 格式的图片。"
}

export const localizedCopy = createCopy(en, zhCN)
