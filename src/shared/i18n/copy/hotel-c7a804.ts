// Localized copy extracted from src/shared/services/llm/business/hotel.ts. Keep both dictionaries in sync.
import { createCopy } from '../copyFactory'

export const en = {
  "mec1ecc4415": "Travel accommodation advisor. Write a concise recommendation memo for the hotel detail page.",
  "m92328e4899": "{ \"reason\": \"Located in Le Marais within walking distance of Centre Pompidou and Place des Vosges, guests praise its central location and attentive staff. Convenient metro connections make exploring the city seamless.\" }",
  "m66601e61c7": "Travel accommodation advisor. Write a single concise English summary sentence for the hotel candidate card.",
  "m9992ac9a92": "<hard_rules>\n- Output strictly in English.\n- Output exactly one field \"blurb\": exactly 1 fluent English sentence, about 12–25 words, no bullet points.\n- Highlight the 1–2 most recognizable features: district/neighborhood, star rating, or key facilities/metro proximity.\n- Do not invent rates, ratings, or distances.\n- Avoid meta descriptions like \"custom hotel\" or \"recommendation reason\".\n</hard_rules>",
  "m4c1b82fbb2": "{ \"blurb\": \"4-star boutique hotel in Trocadéro within walking distance of the Eiffel Tower.\" }",
  "m161cb43125": "Paris accommodation advisor. Pick the best-fit hotels from verified Booking candidates for a Vancouver-originated Paris trip.",
  "m3585174b9f": "area: write as \"Nth Arr. (Quartier)\" e.g. \"4th Arr. (Marais)\", \"9th Arr. (Opéra)\", \"16th Arr. (Trocadéro)\".",
  "me772503b82": "Prioritize 3rd–4th Marais / 2nd Grands Boulevards / 9th Opéra / 6th Saint-Germain / 5th Latin — all metro-convenient.",
  "m9474914422": "description: 2 fluent English sentences highlighting district / property character / nearby metro. reason: one English sentence on why it fits this trip / user preferences.",
  "m8d49b8665f": "{ hotels: [{ name, bookingHotelId?, area: \"Nth Arr. (Quartier)\", address?, description, nearestMetro?, priceHint?, reason, isBest: boolean }] }",
  "m80235ab63c": "{ \"hotels\": [{ \"name\": \"Hôtel du Petit Moulin\", \"bookingHotelId\": \"...\", \"area\": \"4th Arr. (Marais)\", \"address\": \"29-31 rue de Poitou, 75003 Paris\", \"description\": \"Boutique hideaway in the heart of the Marais, with interiors by Christian Lacroix. Walkable to small bistros and galleries.\", \"nearestMetro\": \"Saint-Sébastien – Froissart (Line 8)\", \"priceHint\": \"€€€\", \"reason\": \"Central Marais location with Line 8 metro access — easy transfers to Right Bank classics and day trips.\", \"isBest\": true }] }",
  "mf0e76ecafc": "{p0}, a comfortable base for your Paris stay.",
  "m5e883f29d5": "Metro-convenient location suitable for this trip.",
  "m030208c003": "Paris accommodation copywriter. Rewrite the language fields of an existing hotel recommendation into natural, fluent English for the target locale.",
  "m8b66f03581": "{ \"description\": \"A boutique hideaway in the heart of the Marais, with interiors by Christian Lacroix. Walkable to small bistros and galleries.\", \"reason\": \"Central Marais location with Line 8 metro access.\" }"
} as const

export const zhCN: Record<keyof typeof en, string> = {
  "mec1ecc4415": "旅行住宿顾问。为酒店详情页写一段简洁的推荐理由。",
  "m92328e4899": "{ \"reason\": \"玛黑区步行可达蓬皮杜与孚日广场，Booking 住客普遍称赞位置与员工服务；地铁 3、4 号线方便衔接本次右岸经典日与迪士尼安排，适合追求在地体验的旅客。\" }",
  "m66601e61c7": "旅行住宿顾问。为酒店候选项卡片写一句中文简介。",
  "m9992ac9a92": "<hard_rules>\n- 只输出 blurb 一个字段：恰好 1 句中文，约 18–40 字，不要句号堆砌，不要分点。\n- 抓住最有辨识度的 1–2 个点：区位/星级/一两个设施或交通，不要翻译或压缩 Booking 英文长简介。\n- 不要编造房价、评分或距离；资料没有的信息不要写。\n- 不要出现「自定义」「推荐理由」等元叙述。\n</hard_rules>",
  "m4c1b82fbb2": "{ \"blurb\": \"特罗卡德罗四星酒店，步行可到埃菲尔铁塔，住客评分很高。\" }",
  "m161cb43125": "巴黎旅行住宿顾问。为温哥华出发的{p0}从已验证候选中挑选酒店。",
  "m3585174b9f": "area 统一写成「N区 (Français / 中文)」格式，例如「4区 (Marais / 玛黑)」「9区 (Opéra / 歌剧院)」「16区 (Trocadéro / 特罗卡德罗)」。",
  "me772503b82": "优先 3–4区玛黑 / 2区大林荫道 / 9区歌剧院 / 6区圣日耳曼 / 5区拉丁区 等地铁便利区。",
  "m9474914422": "description：2 句中文；reason：一句话为何适合本次行程/用户偏好。",
  "m8d49b8665f": "{ hotels: [{ name, bookingHotelId?, area: \"N区 (Français / 中文)\", address?, description, nearestMetro?, priceHint?, reason, isBest: boolean }] }",
  "m80235ab63c": "{ \"hotels\": [{ \"name\": \"Hôtel du Petit Moulin\", \"bookingHotelId\": \"...\", \"area\": \"4区 (Marais / 玛黑)\", \"address\": \"29-31 rue de Poitou, 75003 Paris\", \"description\": \"玛黑心脏地带的精品酒店，由 Christian Lacroix 设计内饰。步行可达多家小馆与画廊。\", \"nearestMetro\": \"Saint-Sébastien – Froissart (8号线)\", \"priceHint\": \"€€€\", \"reason\": \"玛黑中心、地铁 8 号线，去右岸经典与迪士尼换乘都方便。\", \"isBest\": true }] }",
  "mf0e76ecafc": "{p0}，适合巴黎行程住宿。",
  "m5e883f29d5": "地铁便利，适合本次行程",
  "m030208c003": "巴黎住宿文案编辑。把现有酒店推荐的语言字段改写成目标 locale 的自然、流畅表达。",
  "m8b66f03581": "{ \"description\": \"玛黑心脏地带的精品酒店，由 Christian Lacroix 设计内饰。步行可达多家小馆与画廊。\", \"reason\": \"玛黑中心、地铁 8 号线，去右岸经典与迪士尼换乘都方便。\" }"
}

export const localizedCopy = createCopy(en, zhCN)
