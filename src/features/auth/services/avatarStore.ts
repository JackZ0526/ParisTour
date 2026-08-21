import { useSyncExternalStore } from 'react'

export type AvatarType = 'initial' | 'emoji' | 'image' | 'monogram'

export interface UserAvatar {
  type: AvatarType
  value: string
  gradientIndex?: number
}

export interface AvatarGradient {
  id: string
  name: string
  className: string
  textClass: string
}

export const AVATAR_GRADIENTS: AvatarGradient[] = [
  {
    id: 'copper',
    name: '法式琥珀铜',
    className: 'bg-gradient-to-br from-[#f8f1eb] via-white to-[#f4e6dc] border-[#e8cebc]/80 text-[var(--copper)]',
    textClass: 'text-[var(--copper)]',
  },
  {
    id: 'sage',
    name: '塞纳鼠尾草',
    className: 'bg-gradient-to-br from-[#f2f7f4] via-white to-[#e5eee8] border-[#c7dcd0]/80 text-[var(--sage)]',
    textClass: 'text-[var(--sage)]',
  },
  {
    id: 'gold',
    name: '凡尔赛香槟金',
    className: 'bg-gradient-to-br from-[#faf6ee] via-white to-[#f4ecd8] border-[#ead9b7]/80 text-[#9c783e]',
    textClass: 'text-[#9c783e]',
  },
  {
    id: 'obsidian',
    name: '巴黎黑曜石',
    className: 'bg-gradient-to-br from-[#2c3530] via-[#1c2420] to-[#121715] border-white/20 text-white shadow-[inset_0_1px_1.5px_rgba(255,255,255,0.25)]',
    textClass: 'text-white',
  },
  {
    id: 'rose',
    name: '蒙马特玫瑰',
    className: 'bg-gradient-to-br from-[#fdf2f4] via-white to-[#fce4e8] border-[#f5c6d0]/80 text-[#c24367]',
    textClass: 'text-[#c24367]',
  },
  {
    id: 'azure',
    name: '皇家蔚蓝',
    className: 'bg-gradient-to-br from-[#eff5ff] via-white to-[#dbe8fd] border-[#bed3fc]/80 text-[#2554eb]',
    textClass: 'text-[#2554eb]',
  },
  {
    id: 'lavender',
    name: '普罗旺斯薰衣草',
    className: 'bg-gradient-to-br from-[#f6f2fd] via-white to-[#ebe0fc] border-[#d8c5fa]/80 text-[#7c3aed]',
    textClass: 'text-[#7c3aed]',
  },
  {
    id: 'terracotta',
    name: '左岸陶土',
    className: 'bg-gradient-to-br from-[#fdf4ed] via-white to-[#fae2d0] border-[#f2c4a2]/80 text-[#b94f1f]',
    textClass: 'text-[#b94f1f]',
  },
]

export const PARIS_EMOJI_PRESETS: string[] = [
  '🗼', '🥐', '☕', '🍷', '🎨', '🥖',
  '👒', '🚲', '🏰', '🌸', '🌿', '✈️',
  '🐱', '🐶', '🦊', '🦁', '👑', '💎',
  '🌟', '🕊️', '🦔', '🍇', '🧀', '⛵',
]

const STORAGE_PREFIX = 'paris-tour-avatar'
const listeners = new Set<() => void>()

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
  try {
    const raw = localStorage.getItem(key)
    if (raw) {
      const parsed = JSON.parse(raw) as UserAvatar
      if (parsed && typeof parsed.type === 'string' && typeof parsed.value === 'string') {
        return parsed
      }
    }
  } catch {
    /* ignore fallback */
  }
  return {
    type: 'initial',
    value: defaultLetter,
    gradientIndex: 0,
  }
}

export function setUserAvatar(avatar: UserAvatar, email?: string): void {
  const key = getStorageKey(email)
  try {
    localStorage.setItem(key, JSON.stringify(avatar))
  } catch (err) {
    console.warn('[avatarStore] Failed to save avatar in localStorage:', err)
  }
  notifyChange()
}

export function clearUserAvatar(email?: string): void {
  const key = getStorageKey(email)
  try {
    localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
  notifyChange()
}

export function useUserAvatar(email?: string): {
  avatar: UserAvatar
  setAvatar: (avatar: UserAvatar) => void
  resetAvatar: () => void
} {
  const avatar = useSyncExternalStore(
    subscribeUserAvatar,
    () => getUserAvatar(email),
    () => getUserAvatar(email),
  )

  const setAvatar = (next: UserAvatar) => {
    setUserAvatar(next, email)
  }

  const resetAvatar = () => {
    clearUserAvatar(email)
  }

  return { avatar, setAvatar, resetAvatar }
}

/**
 * Crops a selected image file to square, scales down to max 256x256,
 * and encodes it as a lightweight WebP/JPEG dataUrl (~15-30KB).
 */
export function processAvatarImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('请选择有效的图片文件'))
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
