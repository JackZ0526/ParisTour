import { describe, expect, it } from 'vitest'
import { openingAvailability as check, visitDurationMinutes, type OpeningSchedule } from '../features/place/services/openingAvailability'
const weekly: OpeningSchedule = { regular: { periods: [
  { open: { day: 1, hour: 9 }, close: { day: 1, hour: 17 } },
  { open: { day: 3, hour: 10 }, close: { day: 3, hour: 12 } },
  { open: { day: 3, hour: 14 }, close: { day: 3, hour: 18 } },
  { open: { day: 6, hour: 22 }, close: { day: 0, hour: 2 } },
] } }
describe('date-aware opening availability (no venue-specific rules)', () => {
  it('excludes any closed weekday, independent of browser timezone', () => {
    expect(check(weekly, '2026-10-12')).toBe('open')
    expect(check(weekly, '2026-10-13')).toBe('closed')
  })
  it('validates the entire visit, not just the arrival minute', () => {
    expect(check(weekly, '2026-10-12', '16:00', 60)).toBe('open')
    expect(check(weekly, '2026-10-12', '16:00', 61)).toBe('closed')
    expect(check(weekly, '2026-10-14', '11:30', 90)).toBe('closed')
    expect(check(weekly, '2026-10-14', '14:00', 90)).toBe('open')
  })
  it('handles overnight hours across the week boundary', () => {
    expect(check(weekly, '2026-10-18', '01:00', 60)).toBe('open')
    expect(check(weekly, '2026-10-18', '02:00')).toBe('closed')
    expect(check(weekly, '2026-10-17', '23:30', 90)).toBe('open')
  })
  it('handles always-open and explicit no periods separately from missing data', () => {
    expect(check({ regular: { periods: [{ open: { day: 0, hour: 0, minute: 0 } }] } }, '2026-10-13')).toBe('open')
    expect(check({ regular: { periods: [] } }, '2026-10-13')).toBe('closed')
    expect(check({ regular: {} }, '2026-10-13')).toBe('unknown')
    expect(check(undefined, '2026-10-13')).toBe('unknown')
    expect(check(weekly, '2026-02-30')).toBe('unknown')
    expect(check(weekly, '2026-10-12', '25:00')).toBe('unknown')
  })
  it('uses dated holiday exceptions only inside their actual seven-day window', () => {
    const special = { ...weekly, observedAt: '2026-10-11T23:30:00Z', utcOffsetMinutes: 120,
      current: { periods: [] } }
    expect(check(special, '2026-10-12')).toBe('closed')
    expect(check(special, '2026-10-19')).toBe('open')
    const reopened = { ...special, current: { periods: [{ open: { date: { year: 2026, month: 10, day: 13 }, hour: 11 }, close: { date: { year: 2026, month: 10, day: 13 }, hour: 15 } }] } }
    expect(check(reopened, '2026-10-13', '12:00', 60)).toBe('open')
  })
  it('does not interpret incomplete or localized descriptions as verified hours', () => {
    expect(check({ regular: { weekdayDescriptions: ['mardi: fermé'] } }, '2026-10-13')).toBe('unknown')
    expect(check({ regular: { periods: [{ open: { day: 1, hour: 9 } }] } }, '2026-10-12')).toBe('unknown')
  })
  it('excludes temporarily/permanently closed businesses', () => {
    for (const businessStatus of ['CLOSED_TEMPORARILY', 'CLOSED_PERMANENTLY']) expect(check({ ...weekly, businessStatus }, '2026-10-12')).toBe('closed')
  })
  it('parses both supported languages without inventing missing durations', () => {
    expect(visitDurationMinutes('2h 30m')).toBe(150)
    expect(visitDurationMinutes('2 小时 30 分钟')).toBe(150)
    expect(visitDurationMinutes('45 minutes')).toBe(45)
    expect(visitDurationMinutes()).toBeUndefined()
  })
})

it('gives the planner precise date-specific windows instead of localized prose', async () => {
  const { openingWindows } = await import('../features/place/services/openingAvailability')
  expect(openingWindows(weekly, '2026-10-14')).toEqual(['10:00–12:00', '14:00–18:00'])
  expect(openingWindows(weekly, '2026-10-13')).toEqual([])
  expect(openingWindows(weekly, '2026-10-18')).toEqual(['00:00–02:00'])
  expect(openingWindows(undefined, '2026-10-13')).toBeNull()
})
