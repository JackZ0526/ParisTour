/** Official-site scrapes below this count still try Tripadvisor listing photos. */
export const MIN_OFFICIAL_PHOTOS_BEFORE_TRIPADVISOR = 5

export function websitePhotosNeedTripadvisorFallback(
  usableOfficialCount: number,
): boolean {
  return usableOfficialCount < MIN_OFFICIAL_PHOTOS_BEFORE_TRIPADVISOR
}

/**
 * Restaurants/cafes: official site first, Tripadvisor when the scrape is sparse.
 * Once Tripadvisor returns any listing photos, drop the official-site album.
 * If Tripadvisor fails, keep the official photos.
 */
export function pickRestaurantGalleryPhotos(input: {
  websitePhotos: string[]
  tripadvisorPhotos: string[]
  tripadvisorResolved: boolean
}): string[] {
  const website = input.websitePhotos.filter(Boolean)
  const tripadvisor = input.tripadvisorPhotos.filter(Boolean)
  if (!websitePhotosNeedTripadvisorFallback(website.length)) return website
  if (!input.tripadvisorResolved || tripadvisor.length === 0) return website
  return tripadvisor
}

export function shouldFetchTripadvisorGalleryFallback(input: {
  needsTripadvisorFallback: boolean
  websitePhotosResolved: boolean
  usableWebsitePhotoCount: number
  hasCachedTripadvisorAlbum: boolean
}): boolean {
  return (
    input.needsTripadvisorFallback &&
    input.websitePhotosResolved &&
    websitePhotosNeedTripadvisorFallback(input.usableWebsitePhotoCount) &&
    !input.hasCachedTripadvisorAlbum
  )
}
