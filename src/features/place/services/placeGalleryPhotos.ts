import type { PlaceInfoSource } from './placeSource'
import { pickRestaurantGalleryPhotos } from './placeGalleryFallback'

const MAX_BOOKING_GALLERY_PHOTOS = 24
const MAX_PREFERRED_GALLERY_PHOTOS = 15

function uniquePhotoUrls(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))]
}

/** Google Place Photo resource names and media URLs cannot be used as <img src>. */
export function isUsableGalleryPhotoUrl(url: string): boolean {
  return (
    /^https?:\/\//i.test(url) &&
    !url.includes('places.googleapis.com') &&
    !url.includes('maps.googleapis.com/maps/api/place/photo')
  )
}

const MIN_NATURAL_EDGE = 64
const UNIFORM_CHANNEL_RANGE = 22

/** True when a downsampled RGBA buffer is a near-solid color (or empty). */
export function isNearlyUniformRgba(
  data: Uint8ClampedArray,
  maxRange = UNIFORM_CHANNEL_RANGE,
): boolean {
  if (data.length < 16) return false
  let rMin = 255
  let rMax = 0
  let gMin = 255
  let gMax = 0
  let bMin = 255
  let bMax = 0
  let opaque = 0
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] < 16) continue
    opaque += 1
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    if (r < rMin) rMin = r
    if (r > rMax) rMax = r
    if (g < gMin) gMin = g
    if (g > gMax) gMax = g
    if (b < bMin) bMin = b
    if (b > bMax) bMax = b
  }
  if (opaque < 8) return true
  return rMax - rMin <= maxRange && gMax - gMin <= maxRange && bMax - bMin <= maxRange
}

/** Tiny stretched pixels or CORS-readable solid fills should not stay in the album. */
export function imageLooksLikeGalleryJunk(img: HTMLImageElement | null): boolean {
  if (!img) return false
  if (img.naturalWidth < MIN_NATURAL_EDGE || img.naturalHeight < MIN_NATURAL_EDGE) {
    return true
  }
  if (typeof document === 'undefined') return false
  try {
    const size = 16
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return false
    ctx.drawImage(img, 0, 0, size, size)
    return isNearlyUniformRgba(ctx.getImageData(0, 0, size, size).data)
  } catch {
    return false
  }
}

/**
 * Official site first, then Tripadvisor. Google is a last-resort single photo
 * and is ignored whenever either preferred source has a usable image.
 * `failedUrls` are runtime <img> failures — they must not keep a broken album
 * from winning over Tripadvisor / Google.
 */
export function pickPreferredPlacePhotos(input: {
  websitePhotos: string[]
  tripadvisorPhotos: string[]
  googleFallbackUrl?: string | null
  failedUrls?: Iterable<string>
}): { photos: string[]; source: PlaceInfoSource | null } {
  const failed = new Set(input.failedUrls || [])
  const stillLoads = (url: string) => isUsableGalleryPhotoUrl(url) && !failed.has(url)

  const website = uniquePhotoUrls(input.websitePhotos.filter(stillLoads)).slice(
    0,
    MAX_PREFERRED_GALLERY_PHOTOS,
  )
  if (website.length) return { photos: website, source: 'website' }

  const tripadvisor = uniquePhotoUrls(
    input.tripadvisorPhotos.filter(stillLoads),
  ).slice(0, MAX_PREFERRED_GALLERY_PHOTOS)
  if (tripadvisor.length) return { photos: tripadvisor, source: 'tripadvisor' }

  const google = input.googleFallbackUrl?.trim() || ''
  if (google && stillLoads(google)) {
    return { photos: [google], source: 'google' }
  }
  return { photos: [], source: null }
}

export function pickPlaceGalleryPhotos(input: {
  galleryVariant: 'carousel' | 'booking'
  bookingPhotos: string[]
  websitePhotos: string[]
  tripadvisorPhotos: string[]
  tripadvisorResolved: boolean
}): string[] {
  if (input.galleryVariant === 'booking') {
    return uniquePhotoUrls(input.bookingPhotos).slice(0, MAX_BOOKING_GALLERY_PHOTOS)
  }

  return pickRestaurantGalleryPhotos({
    websitePhotos: input.websitePhotos,
    tripadvisorPhotos: input.tripadvisorPhotos,
    tripadvisorResolved: input.tripadvisorResolved,
  })
}

export function nextGalleryPhotoIndex(input: {
  photos: string[]
  currentPhoto: string
}): number {
  if (!input.photos.length) return 0
  const currentIndex = input.photos.indexOf(input.currentPhoto)
  if (currentIndex < 0) return 0
  return (currentIndex + 1) % input.photos.length
}
