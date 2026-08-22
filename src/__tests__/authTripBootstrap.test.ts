import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getSupabaseMock } = vi.hoisted(() => ({
  getSupabaseMock: vi.fn(),
}))

vi.mock('../shared/lib/supabase', () => ({
  getSupabase: getSupabaseMock,
  isCloudSyncEnabled: vi.fn(() => true),
}))

import { ensurePrimaryTrip } from '../features/cloud-sync/services/tripCloud'

describe('primary trip auth guard', () => {
  beforeEach(() => {
    getSupabaseMock.mockReset()
  })

  it('does not insert an empty trip when the active auth user is not verified', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    const primaryEq = vi.fn(() => ({ maybeSingle }))
    const ownerEq = vi.fn(() => ({ eq: primaryEq }))
    const select = vi.fn(() => ({ eq: ownerEq }))
    const insert = vi.fn()
    const from = vi.fn(() => ({ select, insert }))
    const getUser = vi.fn().mockResolvedValue({
      data: { user: { id: 'different-user' } },
      error: null,
    })
    getSupabaseMock.mockReturnValue({ from, auth: { getUser } })

    await expect(ensurePrimaryTrip('expected-user')).rejects.toThrow(
      '登录会话尚未完成云端验证',
    )

    expect(getUser).toHaveBeenCalledOnce()
    expect(insert).not.toHaveBeenCalled()
  })
})
