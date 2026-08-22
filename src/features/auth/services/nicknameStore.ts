import { useSyncExternalStore } from 'react'

const NICKNAME_STORAGE_PREFIX = 'paris-tour-user-nickname-v1:'
const NICKNAME_CHANGE_EVENT = 'paris-tour:nickname-changed'

const nicknameMemoryCache = new Map<string, string>()

function getStorageKey(email?: string | null): string {
  const norm = (email || '').trim().toLowerCase()
  return norm ? `${NICKNAME_STORAGE_PREFIX}${norm}` : `${NICKNAME_STORAGE_PREFIX}default`
}

export function getUserNickname(email?: string | null): string {
  const norm = (email || '').trim().toLowerCase()
  if (norm && nicknameMemoryCache.has(norm)) {
    return nicknameMemoryCache.get(norm) || ''
  }

  try {
    const key = getStorageKey(email)
    const stored = localStorage.getItem(key)
    if (stored !== null) {
      const clean = stored.trim()
      if (norm) nicknameMemoryCache.set(norm, clean)
      return clean
    }
  } catch {
    /* ignore */
  }

  return ''
}

export function setUserNickname(nickname: string, email?: string | null): void {
  const clean = nickname.trim()
  const norm = (email || '').trim().toLowerCase()
  const key = getStorageKey(email)

  if (norm) {
    if (clean) {
      nicknameMemoryCache.set(norm, clean)
    } else {
      nicknameMemoryCache.delete(norm)
    }
  }

  try {
    if (clean) {
      localStorage.setItem(key, clean)
    } else {
      localStorage.removeItem(key)
    }
  } catch (err) {
    console.warn('[nicknameStore] failed to write localStorage:', err)
  }

  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(
      new CustomEvent(NICKNAME_CHANGE_EVENT, {
        detail: { email: norm, nickname: clean },
      }),
    )
  }
}

export function clearUserNickname(email?: string | null): void {
  setUserNickname('', email)
}

function subscribe(callback: () => void) {
  const handleCustom = () => callback()
  const handleStorage = (e: StorageEvent) => {
    if (e.key && e.key.startsWith(NICKNAME_STORAGE_PREFIX)) {
      callback()
    }
  }

  window.addEventListener(NICKNAME_CHANGE_EVENT, handleCustom)
  window.addEventListener('storage', handleStorage)

  return () => {
    window.removeEventListener(NICKNAME_CHANGE_EVENT, handleCustom)
    window.removeEventListener('storage', handleStorage)
  }
}

export function useUserNickname(email?: string | null) {
  const nickname = useSyncExternalStore(
    subscribe,
    () => getUserNickname(email),
    () => getUserNickname(email),
  )

  return {
    nickname,
    setNickname: (next: string) => setUserNickname(next, email),
    clearNickname: () => clearUserNickname(email),
  }
}
