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
 * Square crop region expressed in source-image pixel coordinates.
 * The avatar pipeline reads pixels from (sx, sy) of size `size × size`.
 */
export interface AvatarCrop {
  /** Source-image X of the crop's top-left corner (px). */
  sx: number
  /** Source-image Y of the crop's top-left corner (px). */
  sy: number
  /** Square crop side length in source-image pixels. */
  size: number
}

/**
 * Decodes an image source (dataUrl or blob URL) into an HTMLImageElement.
 * Used by the crop preview to display the original at full fidelity.
 */
export function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('解析图片失败'))
    img.src = src
  })
}

const AVATAR_OUTPUT_SIZE = 256
const AVATAR_WEBP_QUALITY = 0.88

function clampCropToImage(crop: AvatarCrop, imgWidth: number, imgHeight: number): AvatarCrop {
  const maxSize = Math.max(1, Math.min(imgWidth, imgHeight))
  const size = Math.min(Math.max(1, crop.size), maxSize)
  const sx = Math.min(Math.max(0, crop.sx), imgWidth - size)
  const sy = Math.min(Math.max(0, crop.sy), imgHeight - size)
  return { sx, sy, size }
}

function defaultCenterCrop(imgWidth: number, imgHeight: number): AvatarCrop {
  const size = Math.min(imgWidth, imgHeight)
  return {
    sx: (imgWidth - size) / 2,
    sy: (imgHeight - size) / 2,
    size,
  }
}

function encodeCanvas(canvas: HTMLCanvasElement): string {
  try {
    const webp = canvas.toDataURL('image/webp', AVATAR_WEBP_QUALITY)
    if (webp.startsWith('data:image/webp')) return webp
  } catch {
    /* fall through to JPEG */
  }
  return canvas.toDataURL('image/jpeg', AVATAR_WEBP_QUALITY)
}

/**
 * Crops a loaded image to the given region and encodes it as a lightweight
 * WebP/JPEG dataUrl (~15-30KB). Synchronous; the caller owns the img element.
 */
export function encodeAvatarCrop(img: HTMLImageElement, crop: AvatarCrop): string {
  const w = img.naturalWidth || img.width
  const h = img.naturalHeight || img.height
  const c = clampCropToImage(crop, w, h)
  const canvas = document.createElement('canvas')
  canvas.width = AVATAR_OUTPUT_SIZE
  canvas.height = AVATAR_OUTPUT_SIZE

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('无法创建图像画布上下文')
  }
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, c.sx, c.sy, c.size, c.size, 0, 0, AVATAR_OUTPUT_SIZE, AVATAR_OUTPUT_SIZE)

  return encodeCanvas(canvas)
}

/**
 * Crops a selected image file to a square, scales down to 256x256, and
 * encodes it as a lightweight WebP/JPEG dataUrl (~15-30KB).
 *
 * If `crop` is omitted, defaults to a center-square crop — preserving the
 * historical behavior for callers that don't need user-driven positioning.
 */
export function processAvatarImage(file: File, crop?: AvatarCrop): Promise<string> {
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
        const w = img.naturalWidth || img.width
        const h = img.naturalHeight || img.height
        const finalCrop = crop ? clampCropToImage(crop, w, h) : defaultCenterCrop(w, h)

        const canvas = document.createElement('canvas')
        canvas.width = AVATAR_OUTPUT_SIZE
        canvas.height = AVATAR_OUTPUT_SIZE

        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('无法创建图像画布上下文'))
          return
        }

        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(img, finalCrop.sx, finalCrop.sy, finalCrop.size, finalCrop.size, 0, 0, AVATAR_OUTPUT_SIZE, AVATAR_OUTPUT_SIZE)

        resolve(encodeCanvas(canvas))
      }
      img.src = src
    }

    reader.readAsDataURL(file)
  })
}
