import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  fetchTripadvisorPlaceGallery,
  galleryKindForPlaceType,
  fetchPlaceWebsitePhotosWithFallback,
  fetchRapidApiGooglePhotoFallbackById,
  fetchWikimediaPlacePhoto,
} = vi.hoisted(() => ({
  fetchTripadvisorPlaceGallery: vi.fn(),
  galleryKindForPlaceType: vi.fn(),
  fetchPlaceWebsitePhotosWithFallback: vi.fn(),
  fetchRapidApiGooglePhotoFallbackById: vi.fn(),
  fetchWikimediaPlacePhoto: vi.fn(),
}))

vi.mock('../features/place/services/tripadvisorPlacePhotos', () => ({
  fetchTripadvisorPlaceGallery,
  galleryKindForPlaceType,
}))

vi.mock('../features/place/services/placeWebsitePhotos', () => ({
  fetchPlaceWebsitePhotosWithFallback,
}))

vi.mock('../features/map/services/googlePlaceDetails', () => ({
  fetchRapidApiGooglePhotoFallbackById,
}))

vi.mock('../features/map/services/wikimediaPlacePhotos', () => ({
  fetchWikimediaPlacePhoto,
}))

import { resolvePlaceDisplayPhotos } from '../features/place/services/placeDisplayPhotos'

const ARC = {
  name: 'Arc de Triomphe',
  nameLocal: '凯旋门',
  type: 'attraction' as const,
  website: 'https://www.paris-arc-de-triomphe.fr/',
  address: 'Pl. Charles de Gaulle, 75008 Paris',
  googlePlaceId: 'ChIJD3uTd9hx5kcR1IQvGfr8dbk',
  location: { lat: 48.8738, lng: 2.295 },
  googlePhotoCandidates: [
    'places/ChIJD3uTd9hx5kcR1IQvGfr8dbk/photos/AUdRd8oAbc',
    'https://places.googleapis.com/v1/places/ChIJ/photos/abc/media',
  ],
}

describe('resolvePlaceDisplayPhotos', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    galleryKindForPlaceType.mockReturnValue('attraction')
    fetchTripadvisorPlaceGallery.mockResolvedValue({ photos: [] })
    fetchPlaceWebsitePhotosWithFallback.mockResolvedValue({ photos: [] })
    fetchRapidApiGooglePhotoFallbackById.mockResolvedValue(null)
    fetchWikimediaPlacePhoto.mockResolvedValue(null)
  })

  it('uses official-site photos and skips Google even when candidates exist', async () => {
    fetchPlaceWebsitePhotosWithFallback.mockResolvedValue({
      photos: ['https://arcdetriomphe.example/hero.jpg'],
    })
    fetchTripadvisorPlaceGallery.mockResolvedValue({
      photos: ['https://media-cdn.tripadvisor.com/arc.jpg'],
    })

    await expect(resolvePlaceDisplayPhotos(ARC)).resolves.toEqual({
      photos: ['https://arcdetriomphe.example/hero.jpg'],
      source: 'website',
      wikimedia: null,
    })
    expect(fetchRapidApiGooglePhotoFallbackById).not.toHaveBeenCalled()
    expect(fetchWikimediaPlacePhoto).not.toHaveBeenCalled()
  })

  it('uses Tripadvisor when the official site has no photos', async () => {
    fetchTripadvisorPlaceGallery.mockResolvedValue({
      photos: [
        'https://media-cdn.tripadvisor.com/arc-1.jpg',
        'https://media-cdn.tripadvisor.com/arc-2.jpg',
      ],
    })

    await expect(resolvePlaceDisplayPhotos(ARC)).resolves.toEqual({
      photos: [
        'https://media-cdn.tripadvisor.com/arc-1.jpg',
        'https://media-cdn.tripadvisor.com/arc-2.jpg',
      ],
      source: 'tripadvisor',
      wikimedia: null,
    })
    expect(fetchRapidApiGooglePhotoFallbackById).not.toHaveBeenCalled()
  })

  it('falls back to a single Google photo after website and Tripadvisor miss', async () => {
    fetchRapidApiGooglePhotoFallbackById.mockResolvedValue(
      'https://lh3.googleusercontent.com/arc-fallback.jpg',
    )

    await expect(resolvePlaceDisplayPhotos(ARC)).resolves.toEqual({
      photos: ['https://lh3.googleusercontent.com/arc-fallback.jpg'],
      source: 'google',
      wikimedia: null,
    })
    expect(fetchRapidApiGooglePhotoFallbackById).toHaveBeenCalledWith(
      ARC.googlePlaceId,
    )
    expect(fetchRapidApiGooglePhotoFallbackById).toHaveBeenCalledTimes(1)
  })

  it('does not dump Google resource names into the gallery', async () => {
    await expect(resolvePlaceDisplayPhotos(ARC)).resolves.toEqual({
      photos: [],
      source: null,
      wikimedia: null,
    })
    expect(fetchRapidApiGooglePhotoFallbackById).toHaveBeenCalledTimes(1)
  })

  it('uses one already-resolved Google photo without a second Places request', async () => {
    await expect(
      resolvePlaceDisplayPhotos({
        ...ARC,
        googlePhotoCandidates: [
          'places/ChIJD3uTd9hx5kcR1IQvGfr8dbk/photos/AUdRd8oAbc',
          'https://lh3.googleusercontent.com/arc-one.jpg',
          'https://lh3.googleusercontent.com/arc-two.jpg',
        ],
      }),
    ).resolves.toEqual({
      photos: ['https://lh3.googleusercontent.com/arc-one.jpg'],
      source: 'google',
      wikimedia: null,
    })
    expect(fetchRapidApiGooglePhotoFallbackById).not.toHaveBeenCalled()
  })
})
