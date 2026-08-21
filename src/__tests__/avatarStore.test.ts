import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getUserAvatar,
  setUserAvatar,
  clearUserAvatar,
  subscribeUserAvatar,
  AVATAR_GRADIENTS,
  PARIS_EMOJI_PRESETS,
  type UserAvatar,
} from '../features/auth/services/avatarStore'

describe('avatarStore', () => {
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
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns default initial letter when no avatar is stored', () => {
    const avatar = getUserAvatar('tester@example.com')
    expect(avatar).toEqual({
      type: 'initial',
      value: 'T',
      gradientIndex: 0,
    })
  })

  it('falls back to "P" when email is empty', () => {
    const avatar = getUserAvatar('')
    expect(avatar.value).toBe('P')
  })

  it('persists and retrieves custom emoji avatar', () => {
    const custom: UserAvatar = {
      type: 'emoji',
      value: '🗼',
      gradientIndex: 2,
    }
    setUserAvatar(custom, 'alice@paris.fr')

    const loaded = getUserAvatar('alice@paris.fr')
    expect(loaded).toEqual(custom)
  })

  it('persists and retrieves custom uploaded image dataUrl', () => {
    const imageAvatar: UserAvatar = {
      type: 'image',
      value: 'data:image/webp;base64,UklGRkAAAABXRUJQVlA4IDQAAADwAQCdASoIAAgAAkA4JaQAA3AA/vv9gAA=',
    }
    setUserAvatar(imageAvatar, 'bob@paris.fr')

    const loaded = getUserAvatar('bob@paris.fr')
    expect(loaded).toEqual(imageAvatar)
  })

  it('clears avatar back to default initial on reset', () => {
    setUserAvatar(
      { type: 'monogram', value: 'AB', gradientIndex: 1 },
      'clara@paris.fr',
    )
    expect(getUserAvatar('clara@paris.fr').type).toBe('monogram')

    clearUserAvatar('clara@paris.fr')
    const reset = getUserAvatar('clara@paris.fr')
    expect(reset).toEqual({
      type: 'initial',
      value: 'C',
      gradientIndex: 0,
    })
  })

  it('notifies subscribers on avatar change', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeUserAvatar(listener)

    setUserAvatar({ type: 'emoji', value: '🥐' }, 'user@test.com')
    expect(listener).toHaveBeenCalledTimes(1)

    clearUserAvatar('user@test.com')
    expect(listener).toHaveBeenCalledTimes(2)

    unsubscribe()
    setUserAvatar({ type: 'emoji', value: '☕' }, 'user@test.com')
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('provides rich French gradient options and emoji presets', () => {
    expect(AVATAR_GRADIENTS.length).toBeGreaterThanOrEqual(6)
    expect(PARIS_EMOJI_PRESETS).toContain('🗼')
    expect(PARIS_EMOJI_PRESETS).toContain('🥐')
    expect(PARIS_EMOJI_PRESETS).toContain('🍷')
  })
})
