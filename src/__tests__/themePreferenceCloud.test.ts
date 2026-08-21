import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getSupabaseMock } = vi.hoisted(() => ({
  getSupabaseMock: vi.fn(),
}))

vi.mock('../shared/lib/supabase', () => ({
  getSupabase: getSupabaseMock,
}))

import {
  loadProfileThemePreference,
  saveProfileThemePreference,
} from '../features/auth/services/themePreferenceCloud'

describe('account theme preference cloud storage', () => {
  beforeEach(() => {
    getSupabaseMock.mockReset()
  })

  it('loads a valid preference from the signed-in profile', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { theme_preference: 'dark' },
      error: null,
    })
    const eq = vi.fn(() => ({ maybeSingle }))
    const select = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ select }))
    getSupabaseMock.mockReturnValue({ from })

    await expect(loadProfileThemePreference('user-1')).resolves.toBe('dark')
    expect(from).toHaveBeenCalledWith('profiles')
    expect(select).toHaveBeenCalledWith('theme_preference')
    expect(eq).toHaveBeenCalledWith('id', 'user-1')
  })

  it('ignores an invalid cloud preference', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { theme_preference: 'sepia' },
      error: null,
    })
    const eq = vi.fn(() => ({ maybeSingle }))
    const select = vi.fn(() => ({ eq }))
    getSupabaseMock.mockReturnValue({ from: vi.fn(() => ({ select })) })

    await expect(loadProfileThemePreference('user-1')).resolves.toBeNull()
  })

  it('writes the selected preference to the signed-in profile', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null })
    const update = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ update }))
    getSupabaseMock.mockReturnValue({ from })

    await expect(
      saveProfileThemePreference('user-1', 'system'),
    ).resolves.toBeUndefined()
    expect(update).toHaveBeenCalledWith({ theme_preference: 'system' })
    expect(eq).toHaveBeenCalledWith('id', 'user-1')
  })
})
