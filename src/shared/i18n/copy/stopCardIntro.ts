import { createCopy } from '../copyFactory'

export const en = {
  missing: 'Short introduction pending. Open details for available information.',
  rules: '<stop_card_intro>Place descriptions and itinerary stop notes are compact card introductions: plain text, one or two sentences, at most 40 words and 220 characters in English or 80 characters in Chinese. Describe a supported distinctive feature and why to visit. Never copy a street address, postcode, phone number, website, opening hours, rating, price list, detailed review, or action/status message into the introduction. Do not repeat the name alone or invent facts. Use an empty string when reliable descriptive information is unavailable. Detailed narratives belong on the detail page.</stop_card_intro>',
} as const

export const zhCN: Record<keyof typeof en, string> = {
  missing: '简短介绍待补充，可在详情页查看已有资料。',
  rules: '<stop_card_intro>地点 description 和行程停点 note 是卡片短简介：纯文本、最多两句，中文最多80字，英文最多40词且220字符。只写有依据的地点特色和到访理由。禁止用街道门牌地址、邮编、电话、网址、营业时间、评分、价目表、长篇游记或操作状态话术充当简介；不得只重复名称，不得编造特色。缺少可靠描述信息时返回空字符串。长介绍留在详情页。</stop_card_intro>',
}

export const stopCardIntroCopy = createCopy(en, zhCN)
