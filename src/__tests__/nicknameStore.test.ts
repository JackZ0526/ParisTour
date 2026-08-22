import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearUserNickname,
  getUserNickname,
  setUserNickname,
} from '../features/auth/services/nicknameStore'

describe('nicknameStore', () => {
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
    clearUserNickname('other@paris.fr')
    clearUserNickname(null)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns empty string when no nickname is stored', () => {
    expect(getUserNickname('traveler@paris.fr')).toBe('')
  })

  it('sets and retrieves nickname scoped by email', () => {
    setUserNickname('卢浮宫漫步者', 'traveler@paris.fr')
    expect(getUserNickname('traveler@paris.fr')).toBe('卢浮宫漫步者')
    expect(getUserNickname('other@paris.fr')).toBe('')
  })

  it('normalizes email casing and trims input', () => {
    setUserNickname('  塞纳河畔  ', 'Traveler@Paris.FR')
    expect(getUserNickname('traveler@paris.fr')).toBe('塞纳河畔')
  })

  it('clears nickname correctly', () => {
    setUserNickname('蒙马特画家', 'traveler@paris.fr')
    clearUserNickname('traveler@paris.fr')
    expect(getUserNickname('traveler@paris.fr')).toBe('')
  })
})
