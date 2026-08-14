import { describe, expect, it } from 'vitest'
import {
  nextGalleryPhotoIndex,
  pickPlaceGalleryPhotos,
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
})
