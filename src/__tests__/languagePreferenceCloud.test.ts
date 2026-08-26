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
  hydrateAccountLanguagePreference,
  isHydratingLanguagePreference,
  loadProfileLanguagePreference,
  saveProfileLanguagePreference,
  _resetLanguageHydrationStateForTests,
} from '../features/auth/services/languagePreferenceCloud'
import { getLocale, setLocale, _resetI18nStoreForTests } from '../shared/i18n'

describe('account language preference cloud storage & hydration', () => {
  const store = new Map<string, string>()

  beforeEach(() => {
    _resetI18nStoreForTests()
    _resetLanguageHydrationStateForTests()
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
    await expect(loadProfileLanguagePreference('user-1')).resolves.toBeNull()
    expect(getSupabaseMock).not.toHaveBeenCalled()
  })

  it('loads a valid language preference from profiles table', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { language_preference: 'en' },
      error: null,
    })
    const eq = vi.fn(() => ({ maybeSingle }))
    const select = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ select }))
    getSupabaseMock.mockReturnValue({ from })

    await expect(loadProfileLanguagePreference('user-1')).resolves.toBe('en')
    expect(from).toHaveBeenCalledWith('profiles')
    expect(select).toHaveBeenCalledWith('language_preference')
    expect(eq).toHaveBeenCalledWith('id', 'user-1')
  })

  it('falls back to auth user metadata if profiles table has no language_preference', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { language_preference: null },
      error: null,
    })
    const eq = vi.fn(() => ({ maybeSingle }))
    const select = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ select }))
    const getUser = vi.fn().mockResolvedValue({
      data: { user: { user_metadata: { language_preference: 'zh-CN' } } },
    })
    getSupabaseMock.mockReturnValue({ from, auth: { getUser } })

    await expect(loadProfileLanguagePreference('user-1')).resolves.toBe('zh-CN')
  })

  it('ignores invalid language preference values in cloud', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { language_preference: 'fr-FR' },
      error: null,
    })
    const eq = vi.fn(() => ({ maybeSingle }))
    const select = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ select }))
    const getUser = vi.fn().mockResolvedValue({
      data: { user: { user_metadata: { language_preference: 'invalid' } } },
    })
    getSupabaseMock.mockReturnValue({ from, auth: { getUser } })

    await expect(loadProfileLanguagePreference('user-1')).resolves.toBeNull()
  })

  it('persists selected language to profiles table and auth metadata', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null })
    const update = vi.fn(() => ({ eq }))
    const upsert = vi.fn().mockResolvedValue({ error: null })
    const from = vi.fn(() => ({ update, upsert }))
    const getUser = vi.fn().mockResolvedValue({
      data: { user: { email: 'traveler@paris.fr' } },
    })
    const updateUser = vi.fn().mockResolvedValue({ error: null })
    getSupabaseMock.mockReturnValue({ from, auth: { getUser, updateUser } })

    await saveProfileLanguagePreference('user-1', 'en')

    expect(from).toHaveBeenCalledWith('profiles')
    expect(upsert).toHaveBeenCalledWith(
      {
        id: 'user-1',
        email: 'traveler@paris.fr',
        language_preference: 'en',
      },
      { onConflict: 'id' },
    )
    expect(updateUser).toHaveBeenCalledWith({
      data: { language_preference: 'en', locale: 'en' },
    })
  })

  describe('hydration flow across devices', () => {
    it('prioritizes account cloud language setting regardless of local device language', async () => {
      // Local device starts with zh-CN
      setLocale('zh-CN')
      expect(getLocale()).toBe('zh-CN')

      // Cloud account has 'en'
      const maybeSingle = vi.fn().mockResolvedValue({
        data: { language_preference: 'en' },
        error: null,
      })
      const eq = vi.fn(() => ({ maybeSingle }))
      const select = vi.fn(() => ({ eq }))
      const from = vi.fn(() => ({ select }))
      getSupabaseMock.mockReturnValue({ from })

      await hydrateAccountLanguagePreference('user-1')

      // Account language overrides device
      expect(getLocale()).toBe('en')
      expect(isHydratingLanguagePreference()).toBe(false)
    })

    it('falls back to Chinese when account never set language and system language is Chinese', async () => {
      setLocale('en') // Local currently English
      vi.stubGlobal('navigator', { language: 'zh-CN', languages: ['zh-CN', 'zh'] })

      // Cloud account has never set language (null)
      const maybeSingle = vi.fn().mockResolvedValue({
        data: { language_preference: null },
        error: null,
      })
      const eq = vi.fn(() => ({ maybeSingle }))
      const select = vi.fn(() => ({ eq }))
      const from = vi.fn(() => ({ select }))
      const getUser = vi.fn().mockResolvedValue({ data: { user: null } })
      getSupabaseMock.mockReturnValue({ from, auth: { getUser } })

      await hydrateAccountLanguagePreference('user-1')

      expect(getLocale()).toBe('zh-CN')
    })

    it('falls back to English when account never set language and system language is French / non-Chinese', async () => {
      setLocale('zh-CN') // Local currently Chinese
      vi.stubGlobal('navigator', { language: 'fr-FR', languages: ['fr-FR', 'fr', 'en'] })

      // Cloud account has never set language (null)
      const maybeSingle = vi.fn().mockResolvedValue({
        data: { language_preference: null },
        error: null,
      })
      const eq = vi.fn(() => ({ maybeSingle }))
      const select = vi.fn(() => ({ eq }))
      const from = vi.fn(() => ({ select }))
      const getUser = vi.fn().mockResolvedValue({ data: { user: null } })
      getSupabaseMock.mockReturnValue({ from, auth: { getUser } })

      await hydrateAccountLanguagePreference('user-1')

      // Non-Chinese must fall back to English
      expect(getLocale()).toBe('en')
    })

    it('falls back to English when account never set language and system language is Japanese / non-Chinese', async () => {
      setLocale('zh-CN')
      vi.stubGlobal('navigator', { language: 'ja-JP', languages: ['ja-JP'] })

      const maybeSingle = vi.fn().mockResolvedValue({
        data: { language_preference: null },
        error: null,
      })
      const eq = vi.fn(() => ({ maybeSingle }))
      const select = vi.fn(() => ({ eq }))
      const from = vi.fn(() => ({ select }))
      const getUser = vi.fn().mockResolvedValue({ data: { user: null } })
      getSupabaseMock.mockReturnValue({ from, auth: { getUser } })

      await hydrateAccountLanguagePreference('user-1')

      expect(getLocale()).toBe('en')
    })
  })
})
