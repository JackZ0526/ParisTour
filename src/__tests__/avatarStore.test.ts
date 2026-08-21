import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getUserAvatar,
  setUserAvatar,
  clearUserAvatar,
  subscribeUserAvatar,
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
    })
  })

  it('falls back to "P" when email is empty', () => {
    const avatar = getUserAvatar('')
    expect(avatar.value).toBe('P')
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
      {
        type: 'image',
        value: 'data:image/webp;base64,UklGRkAAAABXRUJQVlA4IDQAAADwAQCdASoIAAgAAkA4JaQAA3AA/vv9gAA=',
      },
      'clara@paris.fr',
    )
    expect(getUserAvatar('clara@paris.fr').type).toBe('image')

    clearUserAvatar('clara@paris.fr')
    const reset = getUserAvatar('clara@paris.fr')
    expect(reset).toEqual({
      type: 'initial',
      value: 'C',
    })
  })

  it('notifies subscribers on avatar change', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeUserAvatar(listener)

    setUserAvatar(
      { type: 'image', value: 'data:image/webp;base64,123' },
      'user@test.com',
    )
    expect(listener).toHaveBeenCalledTimes(1)

    clearUserAvatar('user@test.com')
    expect(listener).toHaveBeenCalledTimes(2)

    unsubscribe()
    setUserAvatar(
      { type: 'image', value: 'data:image/webp;base64,456' },
      'user@test.com',
    )
    expect(listener).toHaveBeenCalledTimes(2)
  })
})
