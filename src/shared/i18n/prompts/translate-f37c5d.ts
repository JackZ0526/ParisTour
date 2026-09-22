// Fixed-language prompt resources. Call-site locale selection remains explicit.
import { fixedCopy } from '../copyFactory'
export const en = {} as const
export const zhCN = {
  "m1c94ce909a": "{ \"translations\": [\"这家咖啡馆的拿铁口感非常顺滑，店员也很热情。\", \"位置便利，出门就是地铁站。\"] }",
  "m7f9602e43d": "<output_format>数组顺序与输入 texts 一致，长度必须相同。不要解释。为便于流式展示：尽快开始输出 translations 数组。</output_format>",
  "m56d7226650": "酒店简介翻译与排版助手。把 Booking 酒店位置、客房与设施描述译成简体中文，并优化可读排版。",
  "mc2e60fc7bf": "{ \"translations\": [\"位于巴黎玛黑区中心，步行约 350 米可达蓬皮杜中心；朗布托地铁站约 3 分钟路程，可直达共和国广场与市政厅。\\n\\n客房配备空调、平板电视、笔记本电脑保险箱与迷你吧；私人浴室含吹风机与免费洗浴用品。\\n\\n• 餐厅每日供应早餐\\n• 24 小时前台与礼宾服务\\n• 行李寄存、免费 Wi-Fi、洗衣服务\"] }",
  "m5ec7849aa9": "<output_format>\n- 数组顺序与输入 texts 一致，长度必须相同。\n- 译意准确，不编造设施、距离或政策；保留数字与站名/地名。\n- 第一段写区位与交通（1–2 句）；客房亮点单独一段（若有）。\n- 餐饮、设施、服务用「• 」开头的列表，每项一行。\n- 段与段之间用空一行（\\n\\n）分隔；不要标题、不要 markdown、不要编号。\n- 语气简洁通顺，适合酒店详情页快速扫读。\n- 为便于流式展示：尽快开始输出 translations 数组。\n</output_format>",
  "m278480dfe6": "<output_format>\n- 专有品牌可音译或意译；不要解释；不要保留整句英文。\n- 若无法翻译则 zh 原样返回。\n- 为便于流式展示：尽快开始输出 zh 字段。\n</output_format>"
} as const
export const englishPrompt = fixedCopy(en)
export const chinesePrompt = fixedCopy(zhCN)
