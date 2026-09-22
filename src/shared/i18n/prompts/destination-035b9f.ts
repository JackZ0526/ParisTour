// Fixed-language prompt resources. Call-site locale selection remains explicit.
import { fixedCopy } from '../copyFactory'
export const en = {
  "md563184aac": "<hard_rules>\n- Suggest exactly {p0} popular travel destinations (cities primarily; regions are okay in moderation).\n- \"name\" must be the commonly-used form in the active locale (e.g. \"Paris\", \"Tokyo\", or \"Barcelona\").\n- \"subtitle\" must be the local official or widely-used English name (e.g. \"Paris\", \"Tokyo\").\n- Cover diverse regions (Europe / Asia / Americas) — avoid all destinations being in the same country.\n- Do not invent places that do not exist.\n- Never suggest cities already present in avoidAlso or currentDestination (match either locale variant).\n- When batch>1, produce a clearly different set; do not recycle the previous batch.\n</hard_rules>"
} as const
export const zhCN = {
  "me50291af82": "<hard_rules>\n- 恰好推荐 {p0} 个热门旅游目的地（城市为主，可含个别地区）。\n- name 用用户当前语言中常见称呼（中文模式：巴黎、东京、巴塞罗那；英文模式：Paris、Tokyo、Barcelona）。\n- subtitle 用当地官方或英文常用名（如 Paris、Tokyo）。\n- 覆盖欧亚美等不同区域，避免全是同一国家。\n- 不要编造不存在的地名。\n- 严禁推荐 avoidAlso 与 currentDestination 中已出现的城市（含中英文名）。\n- batch>1 时必须给出明显不同的新名单，不要复用上一批。\n</hard_rules>"
} as const
export const englishPrompt = fixedCopy(en)
export const chinesePrompt = fixedCopy(zhCN)
