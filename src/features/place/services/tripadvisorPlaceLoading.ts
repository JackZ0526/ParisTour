/** Per-slice Tripadvisor detail skeletons after a cover photo is already on screen. */
export function tripadvisorPlaceLoadingSlices(input: {
  detailsResolved: boolean
  photoCount: number
  hasRating: boolean
  hasPrice: boolean
  hasCuisine: boolean
  hasAddress: boolean
  reviewCount: number
}): {
  morePhotos: boolean
  rating: boolean
  price: boolean
  cuisine: boolean
  address: boolean
  reviews: boolean
} {
  if (input.detailsResolved) {
    return {
      morePhotos: false,
      rating: false,
      price: false,
      cuisine: false,
      address: false,
      reviews: false,
    }
  }
  return {
    morePhotos: input.photoCount <= 1,
    rating: !input.hasRating,
    price: !input.hasPrice,
    cuisine: !input.hasCuisine,
    address: !input.hasAddress,
    reviews: input.reviewCount <= 0,
  }
}
