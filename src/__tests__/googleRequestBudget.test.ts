import { beforeEach, describe, expect, it } from 'vitest'
import {
  GOOGLE_CONTROLLED_DAILY_LIMIT,
  getGoogleRequestBudgetSnapshot,
  resetGoogleRequestBudgetForTests,
  tryConsumeGoogleRequest,
} from '../features/map/services/googleRequestBudget'

describe('Google request budget', () => {
  beforeEach(() => {
    resetGoogleRequestBudgetForTests()
  })

  it('never allows controlled calls beyond the daily limit', () => {
    const now = new Date(2026, 7, 11, 12)
    for (let index = 0; index < GOOGLE_CONTROLLED_DAILY_LIMIT; index += 1) {
      expect(tryConsumeGoogleRequest('place-search', 1, now)).toBe(true)
    }

    expect(tryConsumeGoogleRequest('place-details', 1, now)).toBe(false)
    expect(getGoogleRequestBudgetSnapshot(now)).toMatchObject({
      used: GOOGLE_CONTROLLED_DAILY_LIMIT,
      remaining: 0,
      byKind: { 'place-search': GOOGLE_CONTROLLED_DAILY_LIMIT },
    })
  })

  it('starts a fresh budget on the next local calendar day', () => {
    expect(
      tryConsumeGoogleRequest('place-details', 2, new Date(2026, 7, 11, 23)),
    ).toBe(true)
    expect(
      getGoogleRequestBudgetSnapshot(new Date(2026, 7, 12, 1)),
    ).toMatchObject({ used: 0, remaining: GOOGLE_CONTROLLED_DAILY_LIMIT })
  })
})
