import { beforeEach, describe, expect, it } from 'vitest'
import {
  getGoogleRequestBudgetSnapshot,
  resetGoogleRequestBudgetForTests,
  tryConsumeGoogleRequest,
} from '../features/map/services/googleRequestBudget'

describe('Google request budget', () => {
  beforeEach(() => {
    resetGoogleRequestBudgetForTests()
  })

  it('counts every controlled request without capping', () => {
    const now = new Date(2026, 7, 11, 12)
    for (let index = 0; index < 200; index += 1) {
      expect(tryConsumeGoogleRequest('place-search', 1, now)).toBe(true)
    }
    expect(tryConsumeGoogleRequest('place-details', 1, now)).toBe(true)

    const snapshot = getGoogleRequestBudgetSnapshot(now)
    expect(snapshot.used).toBe(201)
    expect(snapshot.byKind).toEqual({
      'place-search': 200,
      'place-details': 1,
    })
    expect('limit' in snapshot).toBe(false)
    expect('remaining' in snapshot).toBe(false)
  })

  it('starts a fresh budget on the next local calendar day', () => {
    expect(
      tryConsumeGoogleRequest('place-details', 2, new Date(2026, 7, 11, 23)),
    ).toBe(true)
    expect(
      getGoogleRequestBudgetSnapshot(new Date(2026, 7, 12, 1)),
    ).toMatchObject({ used: 0, byKind: {} })
  })
})
