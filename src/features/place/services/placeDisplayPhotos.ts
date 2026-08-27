import type { Coordinates, PlaceType } from '../../../types'
import { fetchRapidApiGooglePhotoFallbackById } from '../../map/services/googlePlaceDetails'
import {
  fetchWikimediaPlacePhoto,
  type WikimediaPlacePhoto,
} from '../../map/services/wikimediaPlacePhotos'
import {
  isUsableGalleryPhotoUrl,
  pickPreferredPlacePhotos,
} from './placeGalleryPhotos'
import type { PlaceInfoSource } from './placeSource'
import { fetchPlaceWebsitePhotosWithFallback } from './placeWebsitePhotos'
import {
  fetchTripadvisorPlaceGallery,
  galleryKindForPlaceType,
} from './tripadvisorPlacePhotos'

export async function resolvePlaceDisplayPhotos(input: {
  name: string
  nameLocal?: string
  type: PlaceType
  website?: string
  address?: string
  googlePlaceId?: string
  location?: Coordinates
  googlePhotoCandidates?: string[]
}): Promise<{
  photos: string[]
  source: PlaceInfoSource | null
  wikimedia: WikimediaPlacePhoto | null
}> {
  const [tripadvisorGallery, websiteResult] = await Promise.all([
    galleryKindForPlaceType(input.type)
      ? fetchTripadvisorPlaceGallery({
          name: input.name,
          nameLocal: input.nameLocal,
          type: input.type,
          address: input.address,
        }).catch(() => null)
      : Promise.resolve(null),
    fetchPlaceWebsitePhotosWithFallback({
      website: input.website,
      name: input.name,
      nameLocal: input.nameLocal,
      address: input.address,
    }).catch(() => ({ photos: [] as string[] })),
  ])

  const preferred = pickPreferredPlacePhotos({
    websitePhotos: websiteResult.photos,
    tripadvisorPhotos: tripadvisorGallery?.photos || [],
  })
  if (preferred.photos.length) {
    return { photos: preferred.photos, source: preferred.source, wikimedia: null }
  }

  const cachedGoogle = input.googlePhotoCandidates?.find(isUsableGalleryPhotoUrl) || null
  const googleFallback =
    cachedGoogle ||
    (input.googlePlaceId
      ? await fetchRapidApiGooglePhotoFallbackById(input.googlePlaceId).catch(() => null)
      : null)
  const withGoogle = pickPreferredPlacePhotos({
    websitePhotos: [],
    tripadvisorPhotos: [],
    googleFallbackUrl: googleFallback,
  })
  if (withGoogle.photos.length) {
    return { photos: withGoogle.photos, source: withGoogle.source, wikimedia: null }
  }

  if (input.type === 'attraction' && input.location) {
    const wikimedia = await fetchWikimediaPlacePhoto(input.name, input.location)
    if (wikimedia?.url) {
      return { photos: [wikimedia.url], source: 'wikimedia', wikimedia }
    }
  }

  return { photos: [], source: null, wikimedia: null }
}
