import { useCallback, useSyncExternalStore } from 'react'

export type AvatarType = 'initial' | 'image'

export interface UserAvatar {
  type: AvatarType
  value: string
}

const STORAGE_PREFIX = 'paris-tour-avatar'
const listeners = new Set<() => void>()
const avatarMemoryCache = new Map<string, { raw: string | null; snapshot: UserAvatar }>()

function getStorageKey(email?: string): string {
  const normalized = (email || '').trim().toLowerCase()
  return normalized ? `${STORAGE_PREFIX}-${normalized}` : `${STORAGE_PREFIX}-default`
}

function notifyChange() {
  listeners.forEach((l) => l())
}

export function subscribeUserAvatar(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getUserAvatar(email?: string): UserAvatar {
  const key = getStorageKey(email)
  const defaultLetter = email ? email.charAt(0).toUpperCase() : 'P'

  let raw: string | null = null
  try {
    raw = localStorage.getItem(key)
  } catch {
    raw = null
  }

  const cached = avatarMemoryCache.get(key)
  if (cached && cached.raw === raw) {
    return cached.snapshot
  }

  let snapshot: UserAvatar
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as UserAvatar
      if (parsed && parsed.type === 'image' && typeof parsed.value === 'string' && parsed.value) {
        snapshot = parsed
      } else {
        snapshot = { type: 'initial', value: defaultLetter }
      }
    } catch {
      snapshot = { type: 'initial', value: defaultLetter }
    }
  } else {
    snapshot = { type: 'initial', value: defaultLetter }
  }

  avatarMemoryCache.set(key, { raw, snapshot })
  return snapshot
}

export function setUserAvatar(avatar: UserAvatar, email?: string): void {
  const key = getStorageKey(email)
  const raw = JSON.stringify(avatar)
  try {
    localStorage.setItem(key, raw)
  } catch (err) {
    console.warn('[avatarStore] Failed to save avatar in localStorage:', err)
  }
  avatarMemoryCache.set(key, { raw, snapshot: avatar })
  notifyChange()
}

export function clearUserAvatar(email?: string): void {
  const key = getStorageKey(email)
  try {
    localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
  const defaultLetter = email ? email.charAt(0).toUpperCase() : 'P'
  const defaultAvatar: UserAvatar = {
    type: 'initial',
    value: defaultLetter,
  }
  avatarMemoryCache.set(key, { raw: null, snapshot: defaultAvatar })
  notifyChange()
}

export function useUserAvatar(email?: string): {
  avatar: UserAvatar
  setAvatar: (avatar: UserAvatar) => void
  resetAvatar: () => void
} {
  const subscribe = useCallback((onStoreChange: () => void) => {
    return subscribeUserAvatar(onStoreChange)
  }, [])

  const getSnapshot = useCallback(() => {
    return getUserAvatar(email)
  }, [email])

  const avatar = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  const setAvatar = useCallback(
    (next: UserAvatar) => {
      setUserAvatar(next, email)
    },
    [email],
  )

  const resetAvatar = useCallback(() => {
    clearUserAvatar(email)
  }, [email])

  return { avatar, setAvatar, resetAvatar }
}

/**
 * Crops a selected image file to square, scales down to max 256x256,
 * and encodes it as a lightweight WebP/JPEG dataUrl (~15-30KB).
 */
export function processAvatarImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('请选择有效的图片文件 (JPG / PNG / WebP)'))
      return
    }

    const reader = new FileReader()
    reader.onerror = () => reject(new Error('读取图片文件失败'))
    reader.onload = (e) => {
      const src = e.target?.result as string
      if (!src) {
        reject(new Error('图片数据为空'))
        return
      }

      const img = new Image()
      img.onerror = () => reject(new Error('解析图片失败'))
      img.onload = () => {
        const size = Math.min(img.width, img.height)
        const sx = (img.width - size) / 2
        const sy = (img.height - size) / 2

        const targetSize = Math.min(size, 256)
        const canvas = document.createElement('canvas')
        canvas.width = targetSize
        canvas.height = targetSize

        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('无法创建图像画布上下文'))
          return
        }

        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(img, sx, sy, size, size, 0, 0, targetSize, targetSize)

        // Prefer WebP with fallback to JPEG
        let dataUrl = ''
        try {
          dataUrl = canvas.toDataURL('image/webp', 0.88)
          if (!dataUrl.startsWith('data:image/webp')) {
            dataUrl = canvas.toDataURL('image/jpeg', 0.88)
          }
        } catch {
          dataUrl = canvas.toDataURL('image/jpeg', 0.88)
        }

        resolve(dataUrl)
      }
      img.src = src
    }

    reader.readAsDataURL(file)
  })
}
