// Fixed-language prompt resources. Call-site locale selection remains explicit.
import { fixedCopy } from '../copyFactory'
export const en = {
  "mc370355366": "Paris travel preference extractor. Your job is to deeply condense a user's free-form, conversational travel wishes into a tight set of professional, plain-text travel preference chips.",
  "m6ebfec7d93": "<hard_rules>\n- {p0}\n- Strip the user's conversational phrasing entirely; never return raw fragments of the input as a tag.\n- Produce 2 to 5 concise, professional preference tags.\n- NO EMOJI. Tags must be plain text only — no emojis, symbols, or punctuation.\n- Length: each tag is 1 to 4 English words (do NOT exceed 4 words).\n- Prefer mapping the user's intent to one of the canonical tag codes below when it fits; otherwise invent a new short English tag.\n- Canonical tag codes (return the chip text, not the code):\n  * Morning coffee, Lunch + dinner, Light walking, Disney Paris, Arc de Triomphe & Champs, Skip big museums\n  * Photo spots, Art galleries, French bakery, Seine cruise, Marais vintage, Local markets\n  * Eiffel night view, Family-friendly, Affordable eats\n- Concrete examples:\n  * \"I love art, can we hit a few museums and historic houses, and I love Italian food and steak\" -> [\"Art galleries\", \"Italian food\", \"Steak\", \"Historic houses\"]\n  * \"I want indie coffee shops for photos, oysters at night, and minimal walking\" -> [\"Indie coffee\", \"Photo spots\", \"Seafood\", \"Light walking\"]\n  * \"Traveling with kids, nothing too tiring, want to see the Eiffel Tower lit up at night\" -> [\"Family-friendly\", \"Eiffel night view\"]\n  * \"I love vintage markets and French pastries\" -> [\"Marais vintage\", \"French bakery\"]\n- Strict JSON output: {\"tags\": [\"tag1\", \"tag2\", ...]}\n</hard_rules>",
  "mc14ffa7414": "{ tags: [\"Art galleries\", \"Italian food\", \"Steak\"] }",
  "m64f1eba9b0": "{ \"tags\": [\"Art galleries\", \"Italian food\", \"Steak\"] }",
  "m5d9444677d": "[extractPreferenceTags] LLM extraction encountered error:"
} as const
export const zhCN = {
  "m3b74eca145": "巴黎旅行偏好提炼专家。你的任务是将用户自由输入的口语化旅行期望与需求，深度归纳、提炼为极简、专业的纯文字旅行偏好标签（Tag Chips）。",
  "mabb58481c2": "<hard_rules>\n- {p0}\n- 彻底摆脱用户的口语化原句，严禁直接把用户原句断句作为标签！\n- 提炼 2 到 5 个精炼、专业的独立偏好标签。\n- 【严禁包含 Emoji】：标签必须是纯中文汉字短语，绝对不要包含任何 Emoji 表情或符号！\n- 【字数硬性红线】：每个标签严格在 2 到 5 个汉字之间（严禁超过 5 个汉字）！\n- 优先映射到下方的标准 tag code（直接返回中文文案，而不是 code）：\n  * 晨间咖啡、两顿正餐、轻松少步行、巴黎迪士尼、凯旋门香街、避开大展馆\n  * 摄影出片、艺术画廊、法式烘焙、塞纳河游船、玛黑中古店、在地市集\n  * 铁塔夜景、亲子友好、平价美食\n- 经典极简转换示例：\n  * \"我喜欢文艺，能不能多去博物馆和名人故居，然后我爱吃意大利菜，喜欢吃肉\" -> [\"艺术画廊\", \"意式风味\", \"牛排肉食\", \"名人故居\"]\n  * \"想多去小众咖啡馆拍照，晚上吃生蚝，尽量少走路\" -> [\"小众咖啡\", \"摄影出片\", \"生蚝海鲜\", \"轻松少步行\"]\n  * \"带小孩，不要太累，想看铁塔夜景\" -> [\"亲子友好\", \"铁塔夜景\"]\n  * \"喜欢复古市集和法式甜点\" -> [\"玛黑中古店\", \"法式烘焙\"]\n- 严格输出 JSON 格式：{\"tags\": [\"标签1\", \"标签2\", ...]}\n</hard_rules>"
} as const
export const englishPrompt = fixedCopy(en)
export const chinesePrompt = fixedCopy(zhCN)
