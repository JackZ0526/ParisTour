import { createCopy } from '../copyFactory'
export const en = {
  oneBest: "When count is 1, isBest must be true.",
  oneTopPick: "Exactly one hotel has isBest=true; all others must be false.",
  "med9a674c28": "<hard_rules>\n- {p0}\n- Recommend exactly {p1} real hotels (mid-range primary, may include 1 upscale).\n- {p2}\n- {p3}\n- If userPreferences is provided, prioritize it (district, budget, vibe, quiet/convenient, etc.).\n- name must use the official Booking name; include postal-code address when possible (e.g. 75004 Paris).\n- Only pick from verifiedCandidates; copy name, bookingHotelId, address verbatim — do not invent hotels or ratings.\n- {p4}\n- batch>1: produce a clearly different list, avoiding avoidAlso.\n- {p5}\n</hard_rules>",
  "m76bc82cf2e": "<hard_rules>\n- {p0}\n- Do NOT change the hotel's identity (name, address, nearestMetro, area, isBest) — copy them verbatim.\n- Output exactly two fields: \"description\" (1–2 sentences) and \"reason\" (1 short sentence on fit).\n- Base the rewrite on the existing description / reason; do not invent amenities or facts.\n- If a field is empty in the source, write a short, neutral, factual fallback in the target language.\n</hard_rules>",
  "mc500d45b04": "<hard_rules>\n- {p0}\n- Output only reason, as 3–5 connected sentences without headings.\n- Combine hotel information and featuredReviews: location, rating breakdown, amenities and review highlights or complaints.\n- Briefly connect the hotel to the trip and userPreferences within the same paragraph.\n- Do not invent room prices or make proximity to the Louvre/Versailles the only selling point.\n- If there are no featured reviews, rely only on the supplied hotel information.\n</hard_rules>"
} as const
export const zhCN: Record<keyof typeof en, string> = {
  oneBest: "仅推荐一家时，isBest 必须为 true。",
  oneTopPick: "恰好一家首选酒店的 isBest 为 true，其余为 false。",
  "mc500d45b04": "<hard_rules>\n- {p0}\n- 只输出 reason 一个字段，3–5 句连贯文案，不要分标题或小标题。\n- 综合 hotel 资料与 featuredReviews：区位、评分细项、设施亮点、住客好评/差评要点。\n- 可轻点与 trip / userPreferences 的匹配，但不要写成单独的段落。\n- 不要编造房价；不要把卢浮宫/凡尔赛周边当唯一卖点。\n- 若无精选评论，仅依据酒店资料写推荐理由。\n</hard_rules>",
  "med9a674c28": "<hard_rules>\n- {p0}\n- 推荐恰好 {p1} 家真实酒店，以中档为主，可包含一家高档酒店。\n- {p2}\n- {p3}\n- 优先满足 userPreferences 中的区域、预算、风格、安静和交通需求。\n- name 使用 Booking 官方名称，尽可能提供含邮编的地址。\n- 只从 verifiedCandidates 中选择，原样复制 name、bookingHotelId、address，禁止编造酒店或评分。\n- {p4}\n- batch>1 时明显更换推荐，避开 avoidAlso。\n- {p5}\n</hard_rules>",
  "m76bc82cf2e": "<hard_rules>\n- {p0}\n- 不要更改酒店身份信息：name、address、nearestMetro、area、isBest 均原样保留。\n- 恰好输出 description（1–2句）和 reason（1句简短的适配理由）。\n- 根据原有介绍与理由改写，不编造设施或事实。\n- 原字段为空时，以目标语言提供简短、中立、客观的说明。\n</hard_rules>"
}
export const hotelInstruction = createCopy(en, zhCN)
