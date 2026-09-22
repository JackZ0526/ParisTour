import type { Locale } from './types'
import { getLocale } from './i18nStore'

export function calendarMonth(year: number, month: number, locale: Locale = getLocale()) {
  return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month, 1)))
}
export function calendarYear(year: number, locale: Locale = getLocale()) {
  return new Intl.DateTimeFormat(locale, { year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, 0, 1)))
}
export function calendarWeekdays(locale: Locale = getLocale()) {
  const formatter = new Intl.DateTimeFormat(locale, { weekday: 'narrow', timeZone: 'UTC' })
  return Array.from({ length: 7 }, (_, i) => formatter.format(new Date(Date.UTC(2026, 0, 4 + i))))
}
export function calendarRange(start: string, end: string, locale: Locale = getLocale()) {
  const a = new Date(`${start}T12:00:00Z`), b = new Date(`${end}T12:00:00Z`)
  if (!Number.isFinite(a.getTime()) || !Number.isFinite(b.getTime())) return ''
  return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).formatRange(a, b)
}
