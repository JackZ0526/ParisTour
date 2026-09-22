import { createCopy } from '../copyFactory'
export const en = {
  "m0013ebef00": "Find the business's own official website using retrieved public results only. Never invent domains.",
  "m4ae5d03e0f": "<hard_rules>\n- Return the business's own website on its own domain.\n- Exclude Google Maps, Tripadvisor, Yelp, TheFork, Booking, Instagram, Facebook and Wikipedia.\n- If Google's URL is a social page, missing or a 404, look for the actual official website.\n- Return null when uncertain.\n</hard_rules>",
  "m6906ecd787": "Place: {p0}",
  "meb155f3d9f": "Local name: {p0}",
  "ma2b5dae902": "Address: {p0}",
  "me95967f264": "Return JSON: {\"website\":\"https://...\"} or {\"website\":null}",
  "me7c5e673d6": "Find this restaurant's Tripadvisor detail page using retrieved public results only. Never invent results.",
  "m6d4c334321": "<hard_rules>\n- Return only a tripadvisor.com or tripadvisor.fr Restaurant_Review URL containing a numeric -d identifier, such as -d5943832-.\n- Exclude hotel, attraction, city and search-result pages.\n- Match the name and address; return {\"url\":null} when uncertain.\n- Never invent URLs or return only a numeric contentId or locationId.\n</hard_rules>",
  "ma8de5b267b": "City: {p0}",
  "m0c6af123cd": "Return JSON: {\"url\":\"https://www.tripadvisor.com/Restaurant_Review-...\",\"name\":\"...\"} or {\"url\":null}",
  "mbc90cf09b9": "Resolve the traveler's Paris attraction name to its common official name on Tripadvisor.",
  "m3b4bd6d4e8": "<hard_rules>\n- Handle only real attractions, museums, streets and parks in metropolitan Paris.\n- nameEn must be the common Latin-script English name used in Tripadvisor listings, such as \"Champs-Elysees\", \"Pont Neuf\" or \"Eiffel Tower\".\n- Return {\"nameEn\":null} if uncertain, not an attraction, or no matching place is found.\n- Never invent attractions.\n</hard_rules>",
  "m283af41da7": "City: Paris",
  "m984b5e7dd5": "Type: {p0}",
  "m594f56e51a": "Reference information: {p0}",
  "m769e7f4d11": "Return a brief description of the highlights without a heading.",
  "mdf0d7fdbeb": "The model returned no content. Please try again.",
  "mefb0668812": "The recommendations are incomplete, possibly truncated. Try another batch.",
  "m2d37ad6434": "The response could not be read as a list of places. Try another batch."
} as const
export const zhCN: Record<keyof typeof en, string> = {
  "m0013ebef00": "查找商家自己的官方网站。只根据检索到的公开结果作答，禁止编造域名。",
  "m4ae5d03e0f": "<hard_rules>\n- 只要该店自己的官网（他们自己的域名）。\n- 不要 Google Maps、Tripadvisor、Yelp、TheFork、Booking、Instagram、Facebook、Wikipedia。\n- 若 Google 给的网址是社交主页、404 或不存在，改找真正的官网。\n- 不确定就返回 null。\n</hard_rules>",
  "m6906ecd787": "地点：{p0}",
  "meb155f3d9f": "当地名称：{p0}",
  "ma2b5dae902": "地址：{p0}",
  "me95967f264": "输出 JSON：{\"website\":\"https://...\"} 或 {\"website\":null}",
  "me7c5e673d6": "查找这家餐厅在 Tripadvisor 上的餐厅详情页。只根据检索到的公开结果作答，禁止编造。",
  "m6d4c334321": "<hard_rules>\n- 只要 tripadvisor.com / tripadvisor.fr 的 Restaurant_Review 链接，且 URL 里必须带 -d 数字 id（例如 -d5943832-）。\n- 不要酒店、景点、城市页，也不要搜索结果页。\n- 店名和地址必须能对上；不确定就返回 {\"url\":null}。\n- 禁止编造 URL，也禁止只输出 contentId / locationId 数字。\n</hard_rules>",
  "ma8de5b267b": "城市：{p0}",
  "m0c6af123cd": "输出 JSON：{\"url\":\"https://www.tripadvisor.com/Restaurant_Review-...\",\"name\":\"...\"} 或 {\"url\":null}",
  "mbc90cf09b9": "把旅行者口中的巴黎景点名称解析成 Tripadvisor 上常用的正式名称。",
  "m3b4bd6d4e8": "<hard_rules>\n- 只处理巴黎都会区的真实景点、博物馆、街道、公园。\n- nameEn 必须是拉丁字母的常用英文名（Tripadvisor 列表里会出现的那种，例如 \"Champs-Elysees\"、\"Pont Neuf\"、\"Eiffel Tower\"）。\n- 不确定、不是景点、或找不到对应地点时返回 {\"nameEn\":null}。\n- 禁止编造不存在的景点。\n</hard_rules>",
  "m283af41da7": "城市：Paris",
  "m984b5e7dd5": "类型：{p0}",
  "m594f56e51a": "参考信息：{p0}",
  "m769e7f4d11": "请直接输出简短亮点正文，不要标题。",
  "mdf0d7fdbeb": "大模型没有返回内容，请再试一次。",
  "mefb0668812": "推荐结果不完整（可能被截断），请再点「换一批」。",
  "m2d37ad6434": "大模型返回了内容，但无法解析成地点列表，请再点「换一批」。"
}
export const runtimeCopy3 = createCopy(en, zhCN)
