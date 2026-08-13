import { describe, expect, it } from 'vitest'
import {
  pickRestaurantGalleryPhotos,
  shouldFetchWebsiteGalleryFallback,
} from '../features/place/services/placeGalleryFallback'

describe('place gallery website fallback', () => {
  it('fetches the official website only after Tripadvisor settles without photos', () => {
    expect(
      shouldFetchWebsiteGalleryFallback({
        usesTripadvisor: true,
        tripadvisorResolved: true,
        usableTripadvisorPhotoCount: 0,
        hasCachedWebsiteResult: false,
      }),
    ).toBe(true)
  })

  it('does not fetch the website while Tripadvisor is pending or has photos', () => {
    expect(
      shouldFetchWebsiteGalleryFallback({
        usesTripadvisor: true,
        tripadvisorResolved: false,
        usableTripadvisorPhotoCount: 0,
        hasCachedWebsiteResult: false,
      }),
    ).toBe(false)
    expect(
      shouldFetchWebsiteGalleryFallback({
        usesTripadvisor: true,
        tripadvisorResolved: true,
        usableTripadvisorPhotoCount: 1,
        hasCachedWebsiteResult: false,
      }),
    ).toBe(false)
  })

  it('prefers Tripadvisor and uses the website only after a confirmed miss', () => {
    const website = [
      'https://alsace.example/hero.jpg',
      'https://alsace.example/room.jpg',
    ]
    const tripadvisor = [
      'https://media-cdn.tripadvisor.com/alsace-1.jpg',
      'https://media-cdn.tripadvisor.com/alsace-2.jpg',
      'https://media-cdn.tripadvisor.com/alsace-3.jpg',
    ]
    expect(
      pickRestaurantGalleryPhotos({
        websitePhotos: website,
        tripadvisorPhotos: tripadvisor,
        tripadvisorResolved: true,
      }),
    ).toEqual(tripadvisor)
    expect(
      pickRestaurantGalleryPhotos({
        websitePhotos: website,
        tripadvisorPhotos: ['https://media-cdn.tripadvisor.com/cover.jpg'],
        tripadvisorResolved: true,
      }),
    ).toEqual(['https://media-cdn.tripadvisor.com/cover.jpg'])
    expect(
      pickRestaurantGalleryPhotos({
        websitePhotos: website,
        tripadvisorPhotos: [],
        tripadvisorResolved: false,
      }),
    ).toEqual([])
    expect(
      pickRestaurantGalleryPhotos({
        websitePhotos: website,
        tripadvisorPhotos: [],
        tripadvisorResolved: true,
      }),
    ).toEqual(website)
  })
})
