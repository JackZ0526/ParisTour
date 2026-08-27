import { describe, expect, it } from 'vitest'
import {
  isUsableGalleryPhotoUrl,
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
})
