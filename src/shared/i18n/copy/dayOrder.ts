import { createCopy } from '../copyFactory'

export const en = {
  rail: 'Itinerary days',
  dragHint: 'Drag days to reorder · On touch, hold first',
  hint: 'Drag a day to move its itinerary. On touch, hold first. Alt + Left/Right also moves a focused day.',
  moved: 'Moved D{p0} to D{p1}. Intervening days shifted; dates, hotel and airport anchors stayed in place.',
  swapped: 'Swapped the itineraries of D{p0} and D{p1}. Dates, hotel and airport anchors stayed in place.',
  busy: 'Wait for itinerary generation to finish before moving days.',
  readOnly: 'This itinerary is read-only.',
  invalid: 'The requested days do not exist or the day order is invalid.',
  changed: 'The itinerary changed. Start the drag again.',
  tool: '<day_order_tools>To swap two whole day itineraries use {"type":"swap_days","fromDay":4,"toDay":2}. To insert a day at another position, shifting intervening days, use {"type":"move_day","fromDay":4,"toDay":2}. These are executable operations, not switch_day. Move the title, theme, pace, summary and ordered activity stops together. Calendar slots, flights, hotel check-in/overnight and airport anchors remain at their dates. Never simulate day moves using remove/add place actions. Ask when swap versus insertion is unclear. Only act on the user\'s requested days; do not promise completion before execution.</day_order_tools>',
} as const

export const zhCN: Record<keyof typeof en, string> = {
  rail: '行程日期',
  dragHint: '拖动日期卡调整顺序 · 触屏请先长按',
  hint: '拖拽日期卡可移动整天行程；触屏请先长按。聚焦日期卡后，也可按 Alt + 左右方向键移动。',
  moved: '已将 D{p0} 的行程移到 D{p1}，中间日期依次顺延；日期、酒店和机场节点保留在原日期。',
  swapped: '已互换 D{p0} 和 D{p1} 的整天行程；日期、酒店和机场节点保留在原日期。',
  busy: '请等待行程生成完成后再移动日期。',
  readOnly: '此行程为只读，无法调整顺序。',
  invalid: '目标日期不存在，或日期顺序无效。',
  changed: '行程已更新，请重新拖拽。',
  tool: '<day_order_tools>互换整天行程使用 {"type":"swap_days","fromDay":4,"toDay":2}；将某天插入另一位置、中间日期依次顺延使用 {"type":"move_day","fromDay":4,"toDay":2}。这是可执行操作，不是 switch_day。标题、主题、节奏、简介和活动停点顺序一起移动；日历日期、航班、酒店入住/过夜和机场节点留在各自日期。禁止用逐个删除/添加地点模拟整天移动。分不清互换还是插入时询问用户。只操作用户要求的日期，执行前不能声称已完成。</day_order_tools>',
}

export const dayOrderCopy = createCopy(en, zhCN)
