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
  batchLoadProfileNicknames,
  hydrateAccountNickname,
  loadProfileNickname,
  saveProfileNickname,
} from '../features/auth/services/nicknamePreferenceCloud'
import {
  clearUserNickname,
  getUserNickname,
} from '../features/auth/services/nicknameStore'

describe('account nickname cloud storage', () => {
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
    clearUserNickname('traveler@paris.fr')
    clearUserNickname('alice@paris.fr')
    clearUserNickname('bob@paris.fr')
    getSupabaseMock.mockReset()
    isCloudSyncEnabledMock.mockReturnValue(true)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns null when cloud sync is disabled', async () => {
    isCloudSyncEnabledMock.mockReturnValue(false)
    await expect(loadProfileNickname('user-1')).resolves.toBeNull()
    expect(getSupabaseMock).not.toHaveBeenCalled()
  })

  it('loads a valid nickname from profiles table', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { display_name: '巴黎探险家' },
      error: null,
    })
    const eq = vi.fn(() => ({ maybeSingle }))
    const select = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ select }))
    getSupabaseMock.mockReturnValue({ from })

    const nickname = await loadProfileNickname('user-1')
    expect(nickname).toBe('巴黎探险家')
    expect(from).toHaveBeenCalledWith('profiles')
    expect(select).toHaveBeenCalledWith('display_name')
    expect(eq).toHaveBeenCalledWith('id', 'user-1')
  })

  it('falls back to auth user metadata if profiles query fails or is empty', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: null,
      error: new Error('table missing'),
    })
    const eq = vi.fn(() => ({ maybeSingle }))
    const select = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ select }))
    const getUser = vi.fn().mockResolvedValue({
      data: {
        user: {
          user_metadata: { display_name: '元数据昵称' },
        },
      },
    })
    getSupabaseMock.mockReturnValue({ from, auth: { getUser } })

    const nickname = await loadProfileNickname('user-1')
    expect(nickname).toBe('元数据昵称')
  })

  it('writes nickname to both profiles and auth metadata', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null })
    const update = vi.fn(() => ({ eq }))
    const upsert = vi.fn().mockResolvedValue({ error: null })
    const from = vi.fn(() => ({ update, upsert }))
    const updateUser = vi.fn().mockResolvedValue({ data: {}, error: null })
    const getUser = vi.fn().mockResolvedValue({
      data: { user: { email: 'traveler@paris.fr' } },
    })
    getSupabaseMock.mockReturnValue({ from, auth: { updateUser, getUser } })

    await saveProfileNickname('user-1', '左岸漫步者')

    expect(from).toHaveBeenCalledWith('profiles')
    expect(upsert).toHaveBeenCalledWith(
      {
        id: 'user-1',
        email: 'traveler@paris.fr',
        display_name: '左岸漫步者',
      },
      { onConflict: 'id' },
    )
    expect(updateUser).toHaveBeenCalledWith({
      data: { display_name: '左岸漫步者', name: '左岸漫步者' },
    })
  })

  it('hydrates cloud nickname to local storage if cloud has nickname', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { display_name: '云端昵称' },
      error: null,
    })
    const eq = vi.fn(() => ({ maybeSingle }))
    const select = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ select }))
    getSupabaseMock.mockReturnValue({ from })

    await hydrateAccountNickname('user-1', 'traveler@paris.fr')
    const local = getUserNickname('traveler@paris.fr')
    expect(local).toBe('云端昵称')
  })

  it('batch loads companion nicknames for multiple emails', async () => {
    const inMock = vi.fn().mockResolvedValue({
      data: [
        { email: 'alice@paris.fr', display_name: '爱丽丝' },
        { email: 'bob@paris.fr', display_name: '鲍勃' },
      ],
      error: null,
    })
    const select = vi.fn(() => ({ in: inMock }))
    const from = vi.fn(() => ({ select }))
    getSupabaseMock.mockReturnValue({ from })

    const result = await batchLoadProfileNicknames(['alice@paris.fr', 'bob@paris.fr'])
    expect(result['alice@paris.fr']).toBe('爱丽丝')
    expect(result['bob@paris.fr']).toBe('鲍勃')
  })
})
