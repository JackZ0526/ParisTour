import { describe, expect, it } from 'vitest'
import { tripadvisorPlaceLoadingSlices } from '../features/place/services/tripadvisorPlaceLoading'

describe('tripadvisorPlaceLoadingSlices', () => {
  const pending = {
    detailsResolved: false,
    photoCount: 1,
    hasRating: false,
    hasPrice: false,
    hasCuisine: false,
    hasAddress: false,
    reviewCount: 0,
  }

  it('shows restaurant skeletons while Tripadvisor details are in flight after a cover', () => {
    expect(tripadvisorPlaceLoadingSlices(pending)).toEqual({
      morePhotos: true,
      rating: true,
      price: true,
      cuisine: true,
      address: true,
      reviews: true,
    })
  })

  it('omits price and cuisine skeletons for attractions', () => {
    expect(
      tripadvisorPlaceLoadingSlices({
        ...pending,
        expectPrice: false,
        expectCuisine: false,
      }),
    ).toEqual({
      morePhotos: true,
      rating: true,
      price: false,
      cuisine: false,
      address: true,
      reviews: true,
    })
  })

  it('hides each skeleton as that slice arrives', () => {
    expect(
      tripadvisorPlaceLoadingSlices({
        ...pending,
        photoCount: 3,
        hasRating: true,
        hasAddress: true,
      }),
    ).toEqual({
      morePhotos: false,
      rating: false,
      price: true,
      cuisine: true,
      address: false,
      reviews: true,
    })
  })

  it('hides remaining skeletons when details settle even if a slice is empty', () => {
    expect(
      tripadvisorPlaceLoadingSlices({
        ...pending,
        detailsResolved: true,
      }),
    ).toEqual({
      morePhotos: false,
      rating: false,
      price: false,
      cuisine: false,
      address: false,
      reviews: false,
    })
  })
})
