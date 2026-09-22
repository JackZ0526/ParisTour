// Fixed-language prompt resources. Call-site locale selection remains explicit.
import { fixedCopy } from '../copyFactory'
export const en = {
  "med9a674c28": "<hard_rules>\n- {p0}\n- Recommend exactly {p1} real hotels (mid-range primary, may include 1 upscale).\n- {p2}\n- {p3}\n- If userPreferences is provided, prioritize it (district, budget, vibe, quiet/convenient, etc.).\n- name must use the official Booking name; include postal-code address when possible (e.g. 75004 Paris).\n- Only pick from verifiedCandidates; copy name, bookingHotelId, address verbatim — do not invent hotels or ratings.\n- {p4}\n- batch>1: produce a clearly different list, avoiding avoidAlso.\n- {p5}\n</hard_rules>",
  "m76bc82cf2e": "<hard_rules>\n- {p0}\n- Do NOT change the hotel's identity (name, address, nearestMetro, area, isBest) — copy them verbatim.\n- Output exactly two fields: \"description\" (1–2 sentences) and \"reason\" (1 short sentence on fit).\n- Base the rewrite on the existing description / reason; do not invent amenities or facts.\n- If a field is empty in the source, write a short, neutral, factual fallback in the target language.\n</hard_rules>"
} as const
export const zhCN = {
  "mc500d45b04": "<hard_rules>\n- {p0}\n- 只输出 reason 一个字段，3–5 句连贯文案，不要分标题或小标题。\n- 综合 hotel 资料与 featuredReviews：区位、评分细项、设施亮点、住客好评/差评要点。\n- 可轻点与 trip / userPreferences 的匹配，但不要写成单独的段落。\n- 不要编造房价；不要把卢浮宫/凡尔赛周边当唯一卖点。\n- 若无精选评论，仅依据酒店资料写推荐理由。\n</hard_rules>"
} as const
export const englishPrompt = fixedCopy(en)
export const chinesePrompt = fixedCopy(zhCN)
