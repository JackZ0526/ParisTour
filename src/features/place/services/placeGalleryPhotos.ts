import { pickRestaurantGalleryPhotos } from './placeGalleryFallback'

const MAX_BOOKING_GALLERY_PHOTOS = 24

function uniquePhotoUrls(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))]
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
