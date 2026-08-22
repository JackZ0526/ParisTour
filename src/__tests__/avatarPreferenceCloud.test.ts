import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { getSupabaseMock, isCloudSyncEnabledMock } = vi.hoisted(() => ({
  getSupabaseMock: vi.fn(),
  isCloudSyncEnabledMock: vi.fn(() => true),
}))

vi.mock('../shared/lib/supabase', () => ({
  getSupabase: getSupabaseMock,
  isCloudSyncEnabled: isCloudSyncEnabledMock,
}))

import {
  batchLoadProfileAvatars,
  hydrateAccountAvatar,
  loadProfileAvatar,
  saveProfileAvatar,
} from '../features/auth/services/avatarPreferenceCloud'
import {
  getUserAvatar,
} from '../features/auth/services/avatarStore'

describe('account avatar cloud storage', () => {
  const store = new Map<string, string>()

  beforeEach(() => {
    store.clear()
    const storageMock = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, val: string) => {
        store.set(key, val)
      },
      removeItem: (key: string) => {
        store.delete(key)
      },
      clear: () => store.clear(),
      length: 0,
      key: () => null,
    }
    vi.stubGlobal('localStorage', storageMock)
    getSupabaseMock.mockReset()
    isCloudSyncEnabledMock.mockReturnValue(true)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns null when cloud sync is disabled', async () => {
    isCloudSyncEnabledMock.mockReturnValue(false)
    await expect(loadProfileAvatar('user-1')).resolves.toBeNull()
    expect(getSupabaseMock).not.toHaveBeenCalled()
  })

  it('loads a valid avatar from profiles table', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { avatar_url: 'data:image/webp;base64,sample' },
      error: null,
    })
    const eq = vi.fn(() => ({ maybeSingle }))
    const select = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ select }))
    getSupabaseMock.mockReturnValue({ from })

    const avatar = await loadProfileAvatar('user-1')
    expect(avatar).toEqual({ type: 'image', value: 'data:image/webp;base64,sample' })
    expect(from).toHaveBeenCalledWith('profiles')
    expect(select).toHaveBeenCalledWith('avatar_url')
    expect(eq).toHaveBeenCalledWith('id', 'user-1')
  })

  it('writes avatar to profiles table and does not write to auth metadata', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null })
    const update = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ update }))
    const getUser = vi.fn().mockResolvedValue({ data: { user: null } })
    getSupabaseMock.mockReturnValue({ from, auth: { getUser } })

    await saveProfileAvatar('user-1', {
      type: 'image',
      value: 'data:image/webp;base64,new-avatar',
    })

    expect(from).toHaveBeenCalledWith('profiles')
    expect(update).toHaveBeenCalledWith({ avatar_url: 'data:image/webp;base64,new-avatar' })
  })

  it('hydrates cloud avatar to local storage if cloud has custom avatar', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { avatar_url: 'data:image/webp;base64,cloud-synced' },
      error: null,
    })
    const eq = vi.fn(() => ({ maybeSingle }))
    const select = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ select }))
    const getUser = vi.fn().mockResolvedValue({ data: { user: null } })
    getSupabaseMock.mockReturnValue({ from, auth: { getUser } })

    await hydrateAccountAvatar('user-1', 'traveler@paris.fr')
    const local = getUserAvatar('traveler@paris.fr')
    expect(local).toEqual({ type: 'image', value: 'data:image/webp;base64,cloud-synced' })
  })

  it('batch loads companion avatars for multiple emails', async () => {
    const inMock = vi.fn().mockResolvedValue({
      data: [
        { email: 'alice@paris.fr', avatar_url: 'data:image/webp;base64,alice-avatar' },
        { email: 'bob@paris.fr', avatar_url: 'data:image/webp;base64,bob-avatar' },
      ],
      error: null,
    })
    const select = vi.fn(() => ({ in: inMock }))
    const from = vi.fn(() => ({ select }))
    getSupabaseMock.mockReturnValue({ from })

    const result = await batchLoadProfileAvatars(['alice@paris.fr', 'bob@paris.fr'])
    expect(result['alice@paris.fr']).toEqual({
      type: 'image',
      value: 'data:image/webp;base64,alice-avatar',
    })
    expect(result['bob@paris.fr']).toEqual({
      type: 'image',
      value: 'data:image/webp;base64,bob-avatar',
    })
  })
})
