import { describe, expect, it } from 'vitest'
import {
  isUsableGalleryPhotoUrl,
  isNearlyUniformRgba,
  nextGalleryPhotoIndex,
  pickPlaceGalleryPhotos,
  pickPreferredPlacePhotos,
} from '../features/place/services/placeGalleryPhotos'

describe('place gallery photos', () => {
  it('uses Booking photos directly for a Booking gallery', () => {
    expect(
      pickPlaceGalleryPhotos({
        galleryVariant: 'booking',
        bookingPhotos: [
          'https://cf.bstatic.com/photo-1.jpg',
          'https://cf.bstatic.com/photo-2.jpg',
          'https://cf.bstatic.com/photo-2.jpg',
        ],
        websitePhotos: ['https://hotel.example/ignored.jpg'],
        tripadvisorPhotos: ['https://tripadvisor.example/ignored.jpg'],
        tripadvisorResolved: true,
      }),
    ).toEqual([
      'https://cf.bstatic.com/photo-1.jpg',
      'https://cf.bstatic.com/photo-2.jpg',
    ])
  })

  it('keeps the existing Tripadvisor and website policy for other galleries', () => {
    expect(
      pickPlaceGalleryPhotos({
        galleryVariant: 'carousel',
        bookingPhotos: ['https://cf.bstatic.com/ignored.jpg'],
        websitePhotos: ['https://restaurant.example/photo.jpg'],
        tripadvisorPhotos: ['https://tripadvisor.example/photo.jpg'],
        tripadvisorResolved: true,
      }),
    ).toEqual(['https://tripadvisor.example/photo.jpg'])
  })

  it('advances relative to the preview photo after the full album is loaded', () => {
    expect(
      nextGalleryPhotoIndex({
        photos: ['new-first.jpg', 'preview.jpg', 'new-next.jpg'],
        currentPhoto: 'preview.jpg',
      }),
    ).toBe(2)
  })

  it('starts at the first full-album photo when the preview is not present', () => {
    expect(
      nextGalleryPhotoIndex({
        photos: ['new-first.jpg', 'new-second.jpg'],
        currentPhoto: 'preview.jpg',
      }),
    ).toBe(0)
  })

  it('rejects Google Place Photo resource names and media URLs', () => {
    expect(isUsableGalleryPhotoUrl('https://arc.example/hero.jpg')).toBe(true)
    expect(
      isUsableGalleryPhotoUrl(
        'places/ChIJD3uTd9hx5kcR1IQvGfr8dbk/photos/AUdRd8oAbc',
      ),
    ).toBe(false)
    expect(
      isUsableGalleryPhotoUrl(
        'https://places.googleapis.com/v1/places/ChIJ/photos/abc/media',
      ),
    ).toBe(false)
    expect(
      isUsableGalleryPhotoUrl(
        'https://maps.googleapis.com/maps/api/place/photo?photoreference=abc',
      ),
    ).toBe(false)
  })

  it('prefers official-site photos, then Tripadvisor, then a single Google fallback', () => {
    const website = [
      'https://arcdetriomphe.example/hero.jpg',
      'https://arcdetriomphe.example/sunset.jpg',
    ]
    const tripadvisor = [
      'https://media-cdn.tripadvisor.com/arc-1.jpg',
      'https://media-cdn.tripadvisor.com/arc-2.jpg',
    ]
    const googleFallback = 'https://lh3.googleusercontent.com/arc-fallback.jpg'

    expect(
      pickPreferredPlacePhotos({
        websitePhotos: website,
        tripadvisorPhotos: tripadvisor,
        googleFallbackUrl: googleFallback,
      }),
    ).toEqual({ photos: website, source: 'website' })

    expect(
      pickPreferredPlacePhotos({
        websitePhotos: [],
        tripadvisorPhotos: tripadvisor,
        googleFallbackUrl: googleFallback,
      }),
    ).toEqual({ photos: tripadvisor, source: 'tripadvisor' })

    expect(
      pickPreferredPlacePhotos({
        websitePhotos: [
          'places/ChIJD3uTd9hx5kcR1IQvGfr8dbk/photos/AUdRd8oAbc',
          'https://places.googleapis.com/v1/places/ChIJ/photos/abc/media',
        ],
        tripadvisorPhotos: [],
        googleFallbackUrl: googleFallback,
      }),
    ).toEqual({ photos: [googleFallback], source: 'google' })

    expect(
      pickPreferredPlacePhotos({
        websitePhotos: [],
        tripadvisorPhotos: [],
        googleFallbackUrl:
          'places/ChIJD3uTd9hx5kcR1IQvGfr8dbk/photos/AUdRd8oAbc',
      }),
    ).toEqual({ photos: [], source: null })
  })

  it('falls through to Tripadvisor when cached website photos fail to load', () => {
    const website = [
      'https://arcdetriomphe.example/dead-1.jpg',
      'https://arcdetriomphe.example/poster.jpg',
      'https://arcdetriomphe.example/dead-2.jpg',
    ]
    const tripadvisor = [
      'https://media-cdn.tripadvisor.com/arc-1.jpg',
      'https://media-cdn.tripadvisor.com/arc-2.jpg',
    ]

    expect(
      pickPreferredPlacePhotos({
        websitePhotos: website,
        tripadvisorPhotos: tripadvisor,
        failedUrls: [
          'https://arcdetriomphe.example/dead-1.jpg',
          'https://arcdetriomphe.example/dead-2.jpg',
        ],
      }),
    ).toEqual({
      photos: ['https://arcdetriomphe.example/poster.jpg'],
      source: 'website',
    })

    expect(
      pickPreferredPlacePhotos({
        websitePhotos: website,
        tripadvisorPhotos: tripadvisor,
        failedUrls: website,
      }),
    ).toEqual({ photos: tripadvisor, source: 'tripadvisor' })
  })

  it('treats a solid-color RGBA buffer as gallery junk', () => {
    const solid = new Uint8ClampedArray(16 * 16 * 4)
    for (let i = 0; i < solid.length; i += 4) {
      solid[i] = 232
      solid[i + 1] = 176
      solid[i + 2] = 184
      solid[i + 3] = 255
    }
    expect(isNearlyUniformRgba(solid)).toBe(true)

    const photo = new Uint8ClampedArray(16 * 16 * 4)
    for (let i = 0; i < photo.length; i += 4) {
      photo[i] = (i * 13) % 256
      photo[i + 1] = (i * 29) % 256
      photo[i + 2] = (i * 47) % 256
      photo[i + 3] = 255
    }
    expect(isNearlyUniformRgba(photo)).toBe(false)
  })
})
