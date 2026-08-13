/** Per-slice Tripadvisor detail skeletons after a cover photo is already on screen. */
export function tripadvisorPlaceLoadingSlices(input: {
  detailsResolved: boolean
  photoCount: number
  hasRating: boolean
  hasPrice: boolean
  hasCuisine: boolean
  hasAddress: boolean
  reviewCount: number
  /** Attraction pages never show restaurant price / cuisine chips. */
  expectPrice?: boolean
  expectCuisine?: boolean
}): {
  morePhotos: boolean
  rating: boolean
  price: boolean
  cuisine: boolean
  address: boolean
  reviews: boolean
} {
  const expectPrice = input.expectPrice !== false
  const expectCuisine = input.expectCuisine !== false
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
    price: expectPrice && !input.hasPrice,
    cuisine: expectCuisine && !input.hasCuisine,
    address: !input.hasAddress,
    reviews: input.reviewCount <= 0,
  }
}

export function tripadvisorChipLoadingText(input: {
  rating: boolean
  price: boolean
  cuisine: boolean
}): string {
  const labels = [
    input.rating ? '评分' : '',
    input.price ? '价格' : '',
    input.cuisine ? '菜系' : '',
  ].filter(Boolean)
  if (!labels.length) return ''
  if (labels.length === 1) return `正在加载${labels[0]}…`
  if (labels.length === 2) return `正在加载${labels[0]}与${labels[1]}…`
  return `正在加载${labels[0]}、${labels[1]}与${labels[2]}…`
}
