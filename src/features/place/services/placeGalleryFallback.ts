const MAX_GALLERY_PHOTOS = 15

/**
 * Tripadvisor owns the primary gallery. Do not reveal official-site photos
 * until the Tripadvisor photo lookup has settled without a usable image.
 */
export function pickRestaurantGalleryPhotos(input: {
  websitePhotos: string[]
  tripadvisorPhotos: string[]
  tripadvisorResolved: boolean
}): string[] {
  const website = input.websitePhotos.filter(Boolean)
  const tripadvisor = input.tripadvisorPhotos.filter(Boolean)
  if (tripadvisor.length) return tripadvisor.slice(0, MAX_GALLERY_PHOTOS)
  if (!input.tripadvisorResolved) return []
  return website.slice(0, MAX_GALLERY_PHOTOS)
}

export function shouldFetchWebsiteGalleryFallback(input: {
  usesTripadvisor: boolean
  tripadvisorResolved: boolean
  usableTripadvisorPhotoCount: number
  hasCachedWebsiteResult: boolean
}): boolean {
  return (
    input.usesTripadvisor &&
    input.tripadvisorResolved &&
    input.usableTripadvisorPhotoCount === 0 &&
    !input.hasCachedWebsiteResult
  )
}
