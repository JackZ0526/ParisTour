import { describe, expect, it } from 'vitest'
import {
  MIN_OFFICIAL_PHOTOS_BEFORE_TRIPADVISOR,
  pickRestaurantGalleryPhotos,
  shouldFetchTripadvisorGalleryFallback,
  websitePhotosNeedTripadvisorFallback,
} from '../features/place/services/placeGalleryFallback'

describe('place gallery Tripadvisor fallback', () => {
  it('uses a threshold of 5 official photos before skipping Tripadvisor', () => {
    expect(MIN_OFFICIAL_PHOTOS_BEFORE_TRIPADVISOR).toBe(5)
    expect(websitePhotosNeedTripadvisorFallback(0)).toBe(true)
    expect(websitePhotosNeedTripadvisorFallback(2)).toBe(true)
    expect(websitePhotosNeedTripadvisorFallback(4)).toBe(true)
    expect(websitePhotosNeedTripadvisorFallback(5)).toBe(false)
    expect(websitePhotosNeedTripadvisorFallback(6)).toBe(false)
  })

  it('still fetches Tripadvisor when two official-site photos are already on screen', () => {
    expect(
      shouldFetchTripadvisorGalleryFallback({
        needsTripadvisorFallback: true,
        websitePhotosResolved: true,
        usableWebsitePhotoCount: 2,
        hasCachedTripadvisorAlbum: false,
      }),
    ).toBe(true)
  })

  it('does not fetch Tripadvisor after a rich official gallery or a cached listing album', () => {
    expect(
      shouldFetchTripadvisorGalleryFallback({
        needsTripadvisorFallback: true,
        websitePhotosResolved: true,
        usableWebsitePhotoCount: 5,
        hasCachedTripadvisorAlbum: false,
      }),
    ).toBe(false)
    expect(
      shouldFetchTripadvisorGalleryFallback({
        needsTripadvisorFallback: true,
        websitePhotosResolved: true,
        usableWebsitePhotoCount: 2,
        hasCachedTripadvisorAlbum: true,
      }),
    ).toBe(false)
  })

  it('replaces the official album entirely once Tripadvisor returns photos', () => {
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
        tripadvisorPhotos: tripadvisor,
        tripadvisorResolved: false,
      }),
    ).toEqual(website)
    expect(
      pickRestaurantGalleryPhotos({
        websitePhotos: website,
        tripadvisorPhotos: [],
        tripadvisorResolved: true,
      }),
    ).toEqual(website)
  })
})
