/**
 * Tests for the locale detector used by the auto-translate flow.
 *
 * The detector must work bidirectionally: a Chinese trip should be
 * detected as `zh-CN` and an English trip as `en`, even when individual
 * fields contain stray characters in the other script.
 */
import { describe, it, expect } from 'vitest'
import { detectLocaleFromDays } from '../shared/services/llm/business/itinerary'
import type { DayPlan } from '../types'

const baseDay: DayPlan = {
  day: 1,
  title: 'Arrival in Paris',
  theme: 'Settle in & jet lag',
  pace: 'relaxed',
  summary: 'After landing at CDG, head straight to the hotel to check in.',
  metroHintFromArea: { custom: 'Pick a route that fits real-time conditions.' },
  stops: [
    {
      id: 'd1-hotel',
      time: '15:30',
      placeId: 'hotel-selected',
      note: 'Check in and rest briefly.',
      transport: 'transit',
      walkLevel: 'minimal',
      duration: '30–45 min',
    },
  ],
}

describe('detectLocaleFromDays', () => {
  it('detects English trip as en', () => {
    expect(detectLocaleFromDays([baseDay])).toBe('en')
  })

  it('detects Chinese trip as zh-CN', () => {
    const zhDay: DayPlan = {
      ...baseDay,
      title: '抵达巴黎',
      theme: '落地 · 安顿',
      summary: '抵达 CDG 后直奔酒店办理入住。',
      stops: [
        {
          ...baseDay.stops[0],
          note: '办理入住，稍作休息。',
          duration: '30–45 分钟',
        },
      ],
    }
    expect(detectLocaleFromDays([zhDay])).toBe('zh-CN')
  })

  it('treats an English trip with a single stray Chinese char as en', () => {
    // A single Chinese hotel name in an otherwise English trip should
    // NOT trigger zh-CN detection.
    const mostlyEn: DayPlan = {
      ...baseDay,
      stops: [
        {
          ...baseDay.stops[0],
          note: 'Meet at the Café de Paris for an early dinner.',
          duration: '60 min',
        },
      ],
      summary: 'Day at the 巴黎 — short walk from the hotel.',
    }
    expect(detectLocaleFromDays([mostlyEn])).toBe('en')
  })

  it('treats a Chinese trip with a stray English word as zh-CN', () => {
    const mostlyZh: DayPlan = {
      ...baseDay,
      title: '抵达巴黎',
      theme: '落地 · 安顿',
      summary: '抵达 CDG 后直奔酒店办理入住，下午就近闲逛。',
      stops: [
        {
          ...baseDay.stops[0],
          note: '办理入住，稍作休息。',
          duration: '30–45 分钟',
        },
      ],
    }
    expect(detectLocaleFromDays([mostlyZh])).toBe('zh-CN')
  })

  it('handles empty days gracefully', () => {
    expect(detectLocaleFromDays([])).toBe('en')
  })
})
