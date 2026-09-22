// Localized copy extracted from src/features/chat/components/ChatWorkStepList.tsx. Keep both dictionaries in sync.
import { createCopy } from '../copyFactory'

export const en = {
  "mdf37b27b19": "Search: ",
  "md47898f16f": "Analyzing question",
  "me32b064eb7": "Visual Recognition",
  "ma7dcfbd21e": "Recommend",
  "m6099d4c455": "Edit Plan",
  "m0a3fc2326a": "Info Query",
  "m69f5bf446b": "Analyze",
  "mca02849fd9": "Web Search",
  "m20e1509673": "No Web",
  "m36bf512180": "Reasoning: Off",
  "m3db2f459eb": "Reasoning: Low",
  "md8c22d7e8b": "Reasoning: Med",
  "m9bc92bf2cd": "Reasoning: High",
  "mdeba1736ad": "V4 Vision Proxy",
  "m14b6720798": "Multimodal Vision",
  "m5fb1f0aeb0": "Ref {p0} {p1}",
  "m0651c0084e": "Nearby places",
  "md7c1831c9b": "verified"
} as const

export const zhCN: Record<keyof typeof en, string> = {
  "mdf37b27b19": "搜索：",
  "md47898f16f": "分析问题",
  "me32b064eb7": "识图识别",
  "ma7dcfbd21e": "推荐",
  "m6099d4c455": "行程调整",
  "m0a3fc2326a": "信息查询",
  "m69f5bf446b": "理解问题",
  "mca02849fd9": "联网搜索",
  "m20e1509673": "无需联网",
  "m36bf512180": "推理: 关",
  "m3db2f459eb": "推理: 低",
  "md8c22d7e8b": "推理: 中",
  "m9bc92bf2cd": "推理: 高",
  "mdeba1736ad": "调用 V4 Vision",
  "m14b6720798": "多模态识图",
  "m5fb1f0aeb0": "参考了 {p0} 篇资料",
  "m0651c0084e": "周边候选",
  "md7c1831c9b": "已核实"
}

export const localizedCopy = createCopy(en, zhCN)
