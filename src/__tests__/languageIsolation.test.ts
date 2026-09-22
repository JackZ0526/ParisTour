import { localizeStoredUiCopy } from '../shared/i18n/storedUiCopy'
import { describe, expect, it, afterEach } from 'vitest'
import { setLocale, translate } from '../shared/i18n'
import { en } from '../shared/i18n/locales/en'
import { calendarMonth, calendarWeekdays } from '../shared/i18n/calendar'
import { getPlace } from '../features/place/constants/places'
import { ensureDayEndsAtHotel } from '../features/itinerary/utils/itineraryState'
import { recommendedFlights } from '../features/flight/constants/flights'
import { inferParisAreaLabel, PENDING_HOTEL } from '../features/hotel/constants/hotels'
import type { DayPlan } from '../types'
const dictionaries = import.meta.glob('../shared/i18n/copy/*.ts', { eager: true }) as Record<string, { en: Record<string, string>; zhCN: Record<string, string> }>
afterEach(() => setLocale('zh-CN', { persist: false }))
describe('Language isolation', () => {
  it('feature dictionaries have complete keys and English copy has no Chinese', () => {
    for (const [file, dict] of Object.entries(dictionaries)) {
      expect(Object.keys(dict.en).sort(), file).toEqual(Object.keys(dict.zhCN).sort())
      for (const [key, value] of Object.entries(dict.en)) {
        expect(value, `${file}:${key}`).not.toMatch(/\p{Script=Han}/u)
      }
    }
  })
  it('English prompt resources contain no Chinese instructions', () => {
    const prompts = import.meta.glob('../shared/i18n/prompts/*.ts', { eager: true }) as Record<string, { en: Record<string, string> }>
    for (const [file, dict] of Object.entries(prompts)) {
      for (const [key, value] of Object.entries(dict.en)) expect(value, `${file}:${key}`).not.toMatch(/\p{Script=Han}/u)
    }
  })
  it('does not fall back to Chinese for a missing English key', () => {
    const previous = en.common.close
    try {
      delete (en.common as Partial<typeof en.common>).close
      expect(translate('common.close', undefined, 'en')).toBe('common.close')
    } finally { en.common.close = previous }
  })
  it('changes catalog descriptions and calendar labels when switching languages', () => {
    setLocale('en', { persist: false })
    expect(getPlace('attr-arc').description).not.toMatch(/\p{Script=Han}/u)
    expect(calendarMonth(2026, 9)).toBe('October 2026')
    expect(calendarWeekdays()).toHaveLength(7)
    expect(JSON.stringify(recommendedFlights)).not.toMatch(/\p{Script=Han}/u)
    expect(inferParisAreaLabel('75004 Paris')).not.toMatch(/\p{Script=Han}/u)
    expect(PENDING_HOTEL.name).toBe('Choose a hotel')
    setLocale('zh-CN', { persist: false })
    expect(getPlace('attr-arc').description).toMatch(/\p{Script=Han}/u)
    expect(calendarMonth(2026, 9)).toContain('10月')
  })
  it('localizes saved UI labels without translating user-authored text', () => {
    expect(localizeStoredUiCopy('待定', 'en')).toBe('TBD')
    expect(localizeStoredUiCopy('TBD', 'zh-CN')).toBe('待定')
    expect(localizeStoredUiCopy('我的私人备注', 'en')).toBe('我的私人备注')
  })
  it('creates overnight copy in the active language', () => {
    setLocale('en', { persist: false })
    const days = [{day:1,stops:[{id:'s',placeId:'attr-arc'}]}, {day:2,stops:[]}] as unknown as DayPlan[]
    const stop = ensureDayEndsAtHotel(days)[0].stops.at(-1)!
    expect(stop.note).not.toMatch(/\p{Script=Han}/u)
    expect(stop.duration).toBe('Overnight')
  })
})
