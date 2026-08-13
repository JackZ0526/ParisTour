import { beforeEach, describe, expect, it } from 'vitest'
import {
  TRIPADVISOR_MONTHLY_LIMIT,
  getTripadvisorRequestBudgetSnapshot,
  resetTripadvisorRequestBudgetForTests,
  tryConsumeTripadvisorRequest,
} from '../features/place/services/tripadvisorRequestBudget'

describe('Tripadvisor request budget', () => {
  beforeEach(() => {
    resetTripadvisorRequestBudgetForTests()
  })

  it('never allows controlled calls beyond the monthly limit', () => {
    const now = new Date(2026, 7, 12, 12)
    for (let index = 0; index < TRIPADVISOR_MONTHLY_LIMIT; index += 1) {
      expect(tryConsumeTripadvisorRequest('media-gallery', 1, now)).toBe(true)
    }

    expect(tryConsumeTripadvisorRequest('media-gallery', 1, now)).toBe(false)
    expect(getTripadvisorRequestBudgetSnapshot(now)).toMatchObject({
      used: TRIPADVISOR_MONTHLY_LIMIT,
      remaining: 0,
      month: '2026-08',
    })
  })

  it('starts a fresh budget on the next local month', () => {
    expect(
      tryConsumeTripadvisorRequest('media-gallery', 2, new Date(2026, 7, 31, 23)),
    ).toBe(true)
    expect(
      getTripadvisorRequestBudgetSnapshot(new Date(2026, 8, 1, 1)),
    ).toMatchObject({ used: 0, remaining: TRIPADVISOR_MONTHLY_LIMIT, month: '2026-09' })
  })
})
