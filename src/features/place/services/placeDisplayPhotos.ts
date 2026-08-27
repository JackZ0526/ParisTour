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

export interface PlaceDisplayPhotoSet {
  photos: string[]
  source: PlaceInfoSource | null
  wikimedia: WikimediaPlacePhoto | null
  websitePhotos: string[]
  tripadvisorPhotos: string[]
  googleFallbackUrl: string | null
}

export async function resolvePlaceDisplayPhotos(input: {
  name: string
  nameLocal?: string
  type: PlaceType
  website?: string
  address?: string
  googlePlaceId?: string
  location?: Coordinates
  googlePhotoCandidates?: string[]
}): Promise<PlaceDisplayPhotoSet> {
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

  const websitePhotos = (websiteResult.photos || []).filter(isUsableGalleryPhotoUrl)
  const tripadvisorPhotos = (tripadvisorGallery?.photos || []).filter(
    isUsableGalleryPhotoUrl,
  )
  const cachedGoogle =
    input.googlePhotoCandidates?.find(isUsableGalleryPhotoUrl) || null

  const preferred = pickPreferredPlacePhotos({
    websitePhotos,
    tripadvisorPhotos,
    googleFallbackUrl: cachedGoogle,
  })
  if (preferred.photos.length) {
    return {
      photos: preferred.photos,
      source: preferred.source,
      wikimedia: null,
      websitePhotos,
      tripadvisorPhotos,
      googleFallbackUrl: cachedGoogle,
    }
  }

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
    return {
      photos: withGoogle.photos,
      source: withGoogle.source,
      wikimedia: null,
      websitePhotos,
      tripadvisorPhotos,
      googleFallbackUrl: googleFallback,
    }
  }

  if (input.type === 'attraction' && input.location) {
    const wikimedia = await fetchWikimediaPlacePhoto(input.name, input.location)
    if (wikimedia?.url) {
      return {
        photos: [wikimedia.url],
        source: 'wikimedia',
        wikimedia,
        websitePhotos,
        tripadvisorPhotos,
        googleFallbackUrl: null,
      }
    }
  }

  return {
    photos: [],
    source: null,
    wikimedia: null,
    websitePhotos,
    tripadvisorPhotos,
    googleFallbackUrl: null,
  }
}
