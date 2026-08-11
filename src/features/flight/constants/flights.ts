import type { FlightLegTemplate } from '../../../types'

/**
 * Recommended autumn routing (mid-Sep to early Oct):
 * Air France nonstop AF375 YVR→CDG and return AF374 CDG→YVR (live API).
 */
export const recommendedFlights: FlightLegTemplate[] = [
  {
    id: 'outbound-af375',
    label: '去程（推荐）',
    direction: 'outbound',
    airline: 'Air France',
    flightNumber: 'AF375',
    from: { code: 'YVR', city: '温哥华' },
    to: { code: 'CDG', city: '巴黎' },
    departLocal: '加载中…',
    arriveLocal: '加载中…',
    duration: '约 9–10 小时',
    aircraft: 'Airbus A350',
    notes: '由大模型联网检索公开航班信息。',
  },
  {
    id: 'return-af374',
    label: '返程（推荐）',
    direction: 'return',
    airline: 'Air France',
    flightNumber: 'AF374',
    from: { code: 'CDG', city: '巴黎' },
    to: { code: 'YVR', city: '温哥华' },
    departLocal: '加载中…',
    arriveLocal: '加载中…',
    duration: '约 10 小时',
    aircraft: 'Airbus A350',
    notes: '返程主飞 AF374；由大模型联网检索。若你的机票不同可自行改航班号。',
  },
]
