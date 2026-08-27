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

/**
 * Official site first, then Tripadvisor. Google is a last-resort single photo
 * and is ignored whenever either preferred source has a usable image.
 */
export function pickPreferredPlacePhotos(input: {
  websitePhotos: string[]
  tripadvisorPhotos: string[]
  googleFallbackUrl?: string | null
}): { photos: string[]; source: PlaceInfoSource | null } {
  const website = uniquePhotoUrls(
    input.websitePhotos.filter(isUsableGalleryPhotoUrl),
  ).slice(0, MAX_PREFERRED_GALLERY_PHOTOS)
  if (website.length) return { photos: website, source: 'website' }

  const tripadvisor = uniquePhotoUrls(
    input.tripadvisorPhotos.filter(isUsableGalleryPhotoUrl),
  ).slice(0, MAX_PREFERRED_GALLERY_PHOTOS)
  if (tripadvisor.length) return { photos: tripadvisor, source: 'tripadvisor' }

  const google = input.googleFallbackUrl?.trim() || ''
  if (google && isUsableGalleryPhotoUrl(google)) {
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
