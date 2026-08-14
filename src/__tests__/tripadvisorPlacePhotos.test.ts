import { beforeEach, describe, expect, it, vi } from 'vitest'

type AttractionCanonicalMockResult = {
  nameEn: string
  nameFr?: string
  aliases: string[]
} | null

type TripadvisorRestaurantListingMockResult = {
  url?: string
  contentId?: string
  name?: string
} | null

const { authFetch, resolveAttractionCanonicalName, resolveTripadvisorRestaurantListing } =
  vi.hoisted(() => ({
    authFetch: vi.fn(),
    resolveAttractionCanonicalName: vi.fn(
      async (): Promise<AttractionCanonicalMockResult> => null,
    ),
    resolveTripadvisorRestaurantListing: vi.fn(
      async (): Promise<TripadvisorRestaurantListingMockResult> => null,
    ),
  }))

vi.mock('../features/auth/services/authFetch', () => ({ authFetch }))
vi.mock('../shared/services/llm/llm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../shared/services/llm/llm')>()
  return {
    ...actual,
    resolveAttractionCanonicalName,
    resolveTripadvisorRestaurantListing,
  }
})

import {
  fetchTripadvisorAttractionInfo,
  fetchTripadvisorPlaceGallery,
  fetchTripadvisorRestaurantInfo,
  listSeededTripadvisorAttractions,
  listSeededTripadvisorRestaurants,
  matchTripadvisorCatalogItem,
  normalizeTripadvisorAttractionDetails,
  normalizeTripadvisorAutocomplete,
  normalizeTripadvisorCatalog,
  normalizeTripadvisorGallery,
  normalizeTripadvisorReviews,
  peekTripadvisorRestaurantInfo,
  hasCachedTripadvisorGallery,
  hasCachedTripadvisorRestaurantDetails,
  hasSettledTripadvisorRestaurantDetails,
  invalidateTripadvisorPlaceCache,
  pickTripadvisorPhotoUrl,
  resetTripadvisorPlacePhotosForTests,
  selectBestTripadvisorGalleryPhotos,
  tripadvisorAutocompleteQuery,
  tripadvisorContentIdFromCandidate,
  tripadvisorContentIdFromUrl,
  tripadvisorPhotoUrl,
  type TripadvisorAttractionInfo,
} from '../features/place/services/tripadvisorPlacePhotos'
import {
  TRIPADVISOR_MONTHLY_LIMIT,
  resetTripadvisorRequestBudgetForTests,
  tryConsumeTripadvisorRequest,
} from '../features/place/services/tripadvisorRequestBudget'
import {
  resetLlmArtifactStoreForTests,
  saveLlmArtifacts,
  setLlmArtifact,
} from '../shared/services/llm/llmArtifactStore'
import { placeIdentitySimilarity, PLACE_NAME_MATCH_MIN, placeSearchQuery } from '../shared/utils/placeTitle'
import { formatPriceLevelLabel } from '../shared/utils/priceLevel'

const SPHERE_LISTING_URL =
  'https://www.tripadvisor.ca/Restaurant_Review-g187147-d25158864-Reviews-Sphere-Paris_Ile_de_France.html'
const ALSACE_LISTING_URL =
  'https://www.tripadvisor.com/Restaurant_Review-g187147-d5943832-Reviews-Brasserie_L_Alsace-Paris_Ile_de_France.html'
const SOGNO_LISTING_URL =
  'https://www.tripadvisor.com/Restaurant_Review-g187147-d24052281-Reviews-Sogno_Paris-Paris_Ile_de_France.html'

function restaurantListingUrl(locationId: number | string, name: string): string {
  const slug = name.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '')
  return `https://www.tripadvisor.com/Restaurant_Review-g187147-d${locationId}-Reviews-${slug}-Paris_Ile_de_France.html`
}

function attractionListingUrl(locationId: number | string, name: string): string {
  const slug = name.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '')
  return `https://www.tripadvisor.com/Attraction_Review-g187147-d${locationId}-Reviews-${slug}-Paris_Ile_de_France.html`
}

function expectRestaurantDetailsQuery(href: string, listingUrl: string) {
  expect(href).toContain('rest=api%2Fv1%2Frestaurants%2Fdetail')
  expect(href).toContain(`url=${encodeURIComponent(listingUrl)}`)
  expect(href).toContain('locale=en_US')
  expect(href).toContain('currency=USD')
  expect(href).not.toContain('locationId=')
  expect(href).not.toMatch(/Restaurant_Review-d\d+-Reviews\.html/)
}

function expectAttractionDetailsQuery(href: string, listingUrl: string) {
  const locationId = listingUrl.match(/-d(\d{5,})-/)?.[1]
  expect(locationId).toBeTruthy()
  expect(href).toContain('rest=api%2Fv1%2Fthings-to-do%2Fdetail')
  expect(href).toContain(`url=${encodeURIComponent(listingUrl)}`)
  expect(href).toContain(`locationId=${locationId}`)
  expect(href).toContain('locale=en_US')
  expect(href).toContain('currency=USD')
}

function expectAttractionLocationIdQuery(href: string, locationId: string) {
  expect(href).toContain('rest=api%2Fv1%2Fthings-to-do%2Fdetail')
  expect(href).toContain(`locationId=${locationId}`)
  expect(href).toContain('locale=en_US')
  expect(href).toContain('currency=USD')
  expect(href).not.toContain('url=')
}

function expectRestaurantReviewsQuery(href: string, locationId: string, listingUrl?: string) {
  expect(href).toContain('rest=api%2Fv1%2Frestaurants%2Freviews')
  expect(href).toContain(`locationId=${locationId}`)
  expect(href).toContain('language=en')
  if (listingUrl) {
    expect(href).toContain(`url=${encodeURIComponent(listingUrl)}`)
  } else {
    expect(href).not.toContain('url=')
  }
}

function tripadvisor34DetailResponse(input: {
  id?: string
  name?: string
  photos?: string[]
  address?: string | Record<string, string>
  website?: string
  phone?: string
  rating?: number
  reviewCount?: number
  reviews?: unknown[]
  category?: string
  cuisine?: unknown
  cuisines?: unknown
  priceLevel?: string
  priceRange?: string
}) {
  const photos = input.photos || []
  return new Response(
    JSON.stringify({
      success: true,
      id: input.id || '0',
      name: input.name || 'Listing',
      category: input.category || 'RESTAURANT',
      image: photos[0],
      images: photos.map((url) => ({ url })),
      address: input.address,
      website: input.website,
      phone: input.phone,
      rating: input.rating,
      reviewCount: input.reviewCount,
      reviews: input.reviews,
      cuisine: input.cuisine,
      cuisines: input.cuisines,
      priceLevel: input.priceLevel,
      priceRange: input.priceRange,
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}

function restaurantMediaGalleryResponse(...urls: string[]) {
  return tripadvisor34DetailResponse({ photos: urls })
}

function tripadvisor34ReviewsResponse(reviews: unknown[]) {
  return new Response(
    JSON.stringify({
      success: true,
      reviews,
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}

function tripadvisor34RestaurantReviewsResponse(reviews: unknown[]) {
  return new Response(
    JSON.stringify({
      success: true,
      data: { reviews },
      returnedCount: reviews.length,
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}

function tripadvisor34AutocompleteResponse(
  items: Array<{
    locationId: number | string
    name: string
    type: string
    image?: string
    description?: string
    url?: string
  }>,
) {
  return new Response(
    JSON.stringify({
      success: true,
      data: {
        items: items.map((item) => ({
          id: `loc;${item.locationId}`,
          locationId: item.locationId,
          name: item.name,
          type: item.type,
          description: item.description ?? 'Paris, Ile-de-France, France',
          image: item.image,
          url:
            item.url ||
            (/restaurant|eatery|cafe/i.test(item.type)
              ? restaurantListingUrl(item.locationId, item.name)
              : /attraction|activity|poi|landmark|museum/i.test(item.type)
                ? attractionListingUrl(item.locationId, item.name)
                : undefined),
        })),
      },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}

function tripadvisorMissingResponse() {
  return new Response(
    JSON.stringify({ success: false, message: 'Location not found' }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}

describe('Tripadvisor place photos', () => {
  beforeEach(() => {
    const storage = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) || null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
    })
    resolveAttractionCanonicalName.mockReset()
    resolveAttractionCanonicalName.mockResolvedValue(null)
    resolveTripadvisorRestaurantListing.mockReset()
    resolveTripadvisorRestaurantListing.mockResolvedValue(null)
  })
  it('fills dynamic CDN templates to a display size', () => {
    expect(
      tripadvisorPhotoUrl(
        'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/1a/9e.jpg?w={width}&h={height}&s=1',
      ),
    ).toBe(
      'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/1a/9e.jpg?w=1200&h=900&s=1',
    )
  })

  it('rewrites Tripadvisor CDN heights of -1 so the browser can load the image', () => {
    expect(
      tripadvisorPhotoUrl(
        'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/2a/82/2c/00/salle.jpg?w=800&h=-1&s=1',
      ),
    ).toBe(
      'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/2a/82/2c/00/salle.jpg?w=800&h=900&s=1',
    )
  })

  it('maps Tripadvisor dollar and euro price marks onto the same chips as Google', () => {
    expect(formatPriceLevelLabel('PRICE_LEVEL_EXPENSIVE')).toBe('€€€ · 约会烧钱档')
    expect(formatPriceLevelLabel('$$$$')).toBe('€€€€ · 存款消失术')
    expect(formatPriceLevelLabel('€€')).toBe('€€ · 钱包暂安')
    expect(formatPriceLevelLabel('$ - $$')).toBe('€€ · 钱包暂安')
  })

  it('picks a large gallery size from one media-gallery payload', () => {
    const gallery = normalizeTripadvisorGallery(
      {
        data: {
          sections: [
            {
              mediaList: [
                {
                  item: {
                    data: {
                      sizes: [
                        { width: 150, url: 'https://media-cdn.tripadvisor.com/small.jpg' },
                        { width: 1024, url: 'https://media-cdn.tripadvisor.com/wide.jpg' },
                        { width: 1280, url: 'https://media-cdn.tripadvisor.com/xl.jpg' },
                      ],
                    },
                  },
                },
                {
                  item: {
                    data: {
                      sizes: [
                        { width: 550, url: 'https://media-cdn.tripadvisor.com/second.jpg' },
                      ],
                    },
                  },
                },
              ],
            },
          ],
        },
      },
      'attraction',
      '188151',
      'Eiffel Tower',
    )
    expect(gallery.photos).toEqual([
      'https://media-cdn.tripadvisor.com/wide.jpg',
      'https://media-cdn.tripadvisor.com/second.jpg',
    ])
  })

  it('reads restaurant media-gallery photoSizeDynamic templates', () => {
    const gallery = normalizeTripadvisorGallery(
      {
        data: {
          sections: [
            {
              mediaList: [
                {
                  item: {
                    data: {
                      mediaType: 'PHOTO',
                      photoSizeDynamic: {
                        maxWidth: 1500,
                        maxHeight: 1125,
                        urlTemplate:
                          'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/24/67/76/e3/penne-all-arrabbiata.jpg?w={width}&h={height}&s=1',
                      },
                    },
                  },
                },
                {
                  item: {
                    data: {
                      photoSizeDynamic: {
                        maxWidth: 578,
                        urlTemplate:
                          'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/26/5b/77/eb/dessert.jpg?w={width}&h={height}&s=1',
                      },
                    },
                  },
                },
              ],
            },
          ],
        },
      },
      'restaurant',
      '24052281',
      'Sogno Paris',
    )
    expect(gallery.photos).toEqual([
      'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/24/67/76/e3/penne-all-arrabbiata.jpg?w=1200&h=900&s=1',
      'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/26/5b/77/eb/dessert.jpg?w=1200&h=900&s=1',
    ])
  })

  it('keeps the sharpest still photos and drops tiny or video items', () => {
    const ranked = selectBestTripadvisorGalleryPhotos([
      {
        url: 'https://media-cdn.tripadvisor.com/icon.jpg',
        maxWidth: 150,
        maxHeight: 150,
        identity: '/media/photo/icon.jpg',
      },
      {
        url: 'https://media-cdn.tripadvisor.com/hero.jpg',
        maxWidth: 1600,
        maxHeight: 1200,
        identity: '/media/photo/hero.jpg',
      },
      {
        url: 'https://media-cdn.tripadvisor.com/mid.jpg',
        maxWidth: 1024,
        maxHeight: 768,
        identity: '/media/photo/mid.jpg',
      },
      {
        url: 'https://media-cdn.tripadvisor.com/hero-small.jpg',
        maxWidth: 800,
        maxHeight: 600,
        identity: '/media/photo/hero.jpg',
      },
    ])
    expect(ranked).toEqual([
      'https://media-cdn.tripadvisor.com/hero.jpg',
      'https://media-cdn.tripadvisor.com/mid.jpg',
    ])

    const gallery = normalizeTripadvisorGallery(
      {
        data: {
          sections: [
            {
              mediaList: [
                {
                  item: {
                    data: {
                      mediaType: 'VIDEO',
                      sizes: [{ width: 1920, url: 'https://media-cdn.tripadvisor.com/clip.mp4' }],
                    },
                  },
                },
                ...Array.from({ length: 18 }, (_, index) => ({
                  item: {
                    data: {
                      sizes: [
                        {
                          width: 400 + index * 80,
                          height: 300,
                          url: `https://media-cdn.tripadvisor.com/p${index}.jpg`,
                        },
                      ],
                    },
                  },
                })),
              ],
            },
          ],
        },
      },
      'attraction',
      '188709',
      'Arc de Triomphe',
    )
    expect(gallery.photos).toHaveLength(15)
    expect(gallery.photos[0]).toBe('https://media-cdn.tripadvisor.com/p17.jpg')
    expect(gallery.photos[14]).toBe('https://media-cdn.tripadvisor.com/p3.jpg')
    expect(gallery.photos).not.toContain('https://media-cdn.tripadvisor.com/p0.jpg')
    expect(gallery.photos).not.toContain('https://media-cdn.tripadvisor.com/clip.mp4')
  })

  it('prefers landscape photos over portrait, then fills with portrait', () => {
    const ranked = selectBestTripadvisorGalleryPhotos([
      {
        url: 'https://media-cdn.tripadvisor.com/portrait-xl.jpg',
        maxWidth: 1600,
        maxHeight: 2400,
        identity: '/media/photo/portrait-xl.jpg',
      },
      {
        url: 'https://media-cdn.tripadvisor.com/landscape.jpg',
        maxWidth: 1024,
        maxHeight: 768,
        identity: '/media/photo/landscape.jpg',
      },
      {
        url: 'https://media-cdn.tripadvisor.com/square.jpg',
        maxWidth: 1200,
        maxHeight: 1200,
        identity: '/media/photo/square.jpg',
      },
      {
        url: 'https://media-cdn.tripadvisor.com/portrait.jpg',
        maxWidth: 800,
        maxHeight: 1200,
        identity: '/media/photo/portrait.jpg',
      },
    ])
    expect(ranked).toEqual([
      'https://media-cdn.tripadvisor.com/square.jpg',
      'https://media-cdn.tripadvisor.com/landscape.jpg',
      'https://media-cdn.tripadvisor.com/portrait-xl.jpg',
      'https://media-cdn.tripadvisor.com/portrait.jpg',
    ])

    const onlyPortrait = selectBestTripadvisorGalleryPhotos([
      {
        url: 'https://media-cdn.tripadvisor.com/tall.jpg',
        maxWidth: 900,
        maxHeight: 1600,
        identity: '/media/photo/tall.jpg',
      },
    ])
    expect(onlyPortrait).toEqual(['https://media-cdn.tripadvisor.com/tall.jpg'])
  })

  it('keeps at most 15 photos, landscape first then portrait fill', () => {
    const ranked = selectBestTripadvisorGalleryPhotos(
      Array.from({ length: 20 }, (_, index) => ({
        url: `https://media-cdn.tripadvisor.com/${index < 12 ? 'wide' : 'tall'}-${index}.jpg`,
        maxWidth: index < 12 ? 1600 : 900,
        maxHeight: index < 12 ? 900 : 1600,
        identity: `/media/photo/${index < 12 ? 'wide' : 'tall'}-${index}.jpg`,
      })),
    )
    expect(ranked).toHaveLength(15)
    expect(ranked.slice(0, 12).every((url) => url.includes('/wide-'))).toBe(true)
    expect(ranked.slice(12).every((url) => url.includes('/tall-'))).toBe(true)
  })

  it('matches a ranked catalog title to the itinerary name', () => {
    const items = normalizeTripadvisorCatalog(
      {
        data: {
          attractions: [
            {
              cardTitle: { htmlString: '<b>1. Eiffel Tower</b>' },
              cardLink: { route: { typedParams: { contentId: '188151' }, params: { contentId: '188151' } } },
              cardPhoto: {
                sizes: {
                  urlTemplate:
                    'https://dynamic-media-cdn.tripadvisor.com/eiffel.jpg?w={width}&h={height}&s=1',
                },
              },
            },
            {
              cardTitle: { htmlString: '2. Louvre Museum' },
              cardLink: { route: { params: { contentId: '188757' } } },
            },
          ],
        },
      },
      'attraction',
    )
    expect(items[0]).toMatchObject({
      contentId: '188151',
      name: 'Eiffel Tower',
      coverUrl:
        'https://dynamic-media-cdn.tripadvisor.com/eiffel.jpg?w=1200&h=900&s=1',
    })
    expect(matchTripadvisorCatalogItem(items, 'Tour Eiffel', '埃菲尔铁塔')?.contentId).toBe(
      '188151',
    )
  })

  it('matches Champs-Élysées even when the app title differs from Tripadvisor', () => {
    const items = listSeededTripadvisorAttractions()
    expect(
      matchTripadvisorCatalogItem(
        items,
        '香榭丽舍大街（中段）',
        'Avenue des Champs-Élysées',
      )?.contentId,
    ).toBe('209760')
    expect(matchTripadvisorCatalogItem(items, '香榭丽舍大街（中段）')?.contentId).toBe(
      '209760',
    )
    expect(matchTripadvisorCatalogItem(items, 'Champs-Elysees')?.contentId).toBe('209760')
  })

  it('does not treat Grand Palais as Palais Garnier just because both are palaces', () => {
    const items = listSeededTripadvisorAttractions()
    expect(matchTripadvisorCatalogItem(items, 'Grand Palais')?.contentId).toBe('590230')
    expect(matchTripadvisorCatalogItem(items, '大皇宫')?.contentId).toBe('590230')
    expect(matchTripadvisorCatalogItem(items, 'Palais Garnier')?.contentId).toBe('190204')
    expect(matchTripadvisorCatalogItem(items, '巴黎歌剧院')?.contentId).toBe('190204')
    expect(placeIdentitySimilarity('Grand Palais', 'Palais Garnier')).toBeLessThan(
      PLACE_NAME_MATCH_MIN,
    )
    expect(placeIdentitySimilarity('Palais de Tokyo', 'Grand Palais')).toBeLessThan(
      PLACE_NAME_MATCH_MIN,
    )
    expect(placeIdentitySimilarity('Palais de Tokyo', 'Palais Garnier')).toBeLessThan(
      PLACE_NAME_MATCH_MIN,
    )
    expect(placeIdentitySimilarity('Musée Rodin', "Musée d'Orsay")).toBeLessThan(
      PLACE_NAME_MATCH_MIN,
    )
  })

  it('pins the Tripadvisor listing hero ahead of gallery traveler photos', () => {
    const gallery = normalizeTripadvisorGallery(
      {
        data: {
          sections: [
            {
              mediaList: [
                {
                  item: {
                    data: {
                      sizes: [
                        { width: 1600, height: 1200, url: 'https://media-cdn.tripadvisor.com/caption.jpg' },
                      ],
                    },
                  },
                },
              ],
            },
          ],
        },
      },
      'attraction',
      '209760',
      'Champs-Elysees',
      'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/0d/64/ec/ff/champs-elysees-from-the.jpg?w={width}&h={height}&s=1',
    )
    expect(gallery.photos[0]).toBe(
      'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/0d/64/ec/ff/champs-elysees-from-the.jpg?w=1200&h=900&s=1',
    )
    expect(gallery.photos[1]).toBe('https://media-cdn.tripadvisor.com/caption.jpg')
  })

  it('matches shortened or qualified names without a hardcoded alias', () => {
    const items = [
      { contentId: '1', name: 'Pont Neuf', kind: 'attraction' as const },
      { contentId: '2', name: 'Ile de la Cite', kind: 'attraction' as const },
    ]
    expect(matchTripadvisorCatalogItem(items, '新桥（西端）', 'Pont Neuf')?.contentId).toBe('1')
    expect(matchTripadvisorCatalogItem(items, '西堤岛（核心）', 'Île de la Cité')?.contentId).toBe(
      '2',
    )
    expect(placeSearchQuery('香榭丽舍大街（中段）', 'Avenue des Champs-Élysées')).toBe(
      'champs elysees',
    )
    expect(placeSearchQuery('西堤岛（核心）', 'Île de la Cité')).toBe('ile cite')
  })

  it('matches Musée d’Art Moderne even when the English wording differs', () => {
    const items = listSeededTripadvisorAttractions()
    expect(
      matchTripadvisorCatalogItem(
        items,
        '巴黎现代艺术博物馆',
        "Musée d'Art Moderne de Paris",
      )?.contentId,
    ).toBe('188486')
    expect(
      matchTripadvisorCatalogItem(items, '巴黎现代艺术博物馆')?.contentId,
    ).toBe('188486')
    expect(
      matchTripadvisorCatalogItem(items, 'Museum of Modern Art of the City of Paris')
        ?.contentId,
    ).toBe('188486')
  })

  it('matches Palais de Tokyo from the seeded listing', () => {
    const items = listSeededTripadvisorAttractions()
    expect(matchTripadvisorCatalogItem(items, '东京宫', 'Palais de Tokyo')?.contentId).toBe(
      '246664',
    )
    expect(matchTripadvisorCatalogItem(items, '东京宫')?.contentId).toBe('246664')
    expect(matchTripadvisorCatalogItem(items, 'Palais de Tokyo')?.contentId).toBe('246664')
  })

  it('prefers a size at least 800px wide', () => {
    expect(
      pickTripadvisorPhotoUrl([
        { width: 150, url: 'https://example.test/s.jpg' },
        { width: 550, url: 'https://example.test/m.jpg' },
        { width: 1024, url: 'https://example.test/l.jpg' },
      ]),
    ).toBe('https://example.test/l.jpg')
  })

  it('maps attraction details into description, geo, and photos without reviews', () => {
    const info = normalizeTripadvisorAttractionDetails(
      {
        data: {
          name: 'Arc de Triomphe',
          about: {
            htmlString:
              '<p>The Arc de Triomphe honours those who fought and died for France.</p>',
          },
          rating: 4.7,
          numberOfReviews: 140232,
          geoPoint: { latitude: 48.8738, longitude: 2.295 },
          address: 'Place Charles de Gaulle, 75008 Paris',
          photo: {
            sizes: [
              { width: 150, url: 'https://media-cdn.tripadvisor.com/arc-s.jpg' },
              { width: 1024, url: 'https://media-cdn.tripadvisor.com/arc.jpg' },
            ],
          },
        },
      },
      '188709',
    )
    expect(info).toMatchObject({
      contentId: '188709',
      name: 'Arc de Triomphe',
      description:
        'The Arc de Triomphe honours those who fought and died for France.',
      rating: 4.7,
      userRatingCount: 140232,
      location: { lat: 48.8738, lng: 2.295 },
      address: 'Place Charles de Gaulle, 75008 Paris',
    })
    expect(info.photos).toEqual(['https://media-cdn.tripadvisor.com/arc.jpg'])
  })

  it('reads restaurant website, phone, and Tripadvisor reviews', () => {
    const info = normalizeTripadvisorAttractionDetails(
      {
        data: {
          sections: [
            {
              __typename: 'AppPresentation_PoiOverview',
              name: "Brasserie L'Alsace",
              rating: 3.3,
              numberReviews: 2439,
              contactLinks: [
                {
                  linkType: 'WEBSITE',
                  link: {
                    externalUrl: 'https://www.restaurantalsace.com/?y_source=1',
                    trackingContext: 'server_website',
                  },
                },
                {
                  linkType: 'PHONE',
                  link: { externalUrl: 'tel:%2B33%201%2053%2093%2097%2000' },
                },
              ],
            },
            {
              __typename: 'AppPresentation_PoiLocation',
              address: {
                address: '39 Avenue Des Champs-élysées, 75008 Paris France',
                geoPoint: { latitude: 48.86998, longitude: 2.305772 },
              },
            },
          ],
        },
      },
      '5943832',
    )
    expect(info).toMatchObject({
      contentId: '5943832',
      name: "Brasserie L'Alsace",
      rating: 3.3,
      userRatingCount: 2439,
      address: '39 Avenue Des Champs-élysées, 75008 Paris France',
      website: 'https://www.restaurantalsace.com/?y_source=1',
      phone: '+33 1 53 93 97 00',
    })
    expect(info.reviews).toEqual([])

    expect(
      normalizeTripadvisorReviews({
        data: {
          reviews: [
            {
              __typename: 'Review',
              title: 'Classic Alsatian',
              htmlString:
                '<p>Sauerkraut and pork knuckle just like in Strasbourg, busy but friendly room.</p>',
              rating: 5,
              username: 'MarieB',
              publishedDate: '2026-07-02',
            },
            {
              __typename: 'Review',
              text: 'Great location near the Arc, choucroute for two was plenty.',
              bubbleRating: { rating: 4 },
              user: { displayName: 'Tom' },
            },
            {
              __typename: 'AppPresentation_UserReviewSection',
              htmlTitle: { htmlString: 'Paris' },
              htmlText: {
                htmlString:
                  'The bad service <br />Poorly polite <br />We wanted to eat a meat, house specialty.',
              },
              bubbleRating: { rating: 1 },
              publishedDate: { string: '1 week ago' },
              userProfile: { displayName: 'Daydream26671292796' },
            },
          ],
        },
      }),
    ).toEqual([
      {
        text: 'Classic Alsatian\nSauerkraut and pork knuckle just like in Strasbourg, busy but friendly room.',
        rating: 5,
        author: 'MarieB',
        relativeTime: '2026-07-02',
      },
      {
        text: 'Great location near the Arc, choucroute for two was plenty.',
        rating: 4,
        author: 'Tom',
        relativeTime: undefined,
      },
      {
        text: 'The bad service Poorly polite We wanted to eat a meat, house specialty.',
        rating: 1,
        author: 'Daydream26671292796',
        relativeTime: '1 week ago',
      },
    ])
  })

  it('reads restaurant photos from details urlTemplate fields', () => {
    const info = normalizeTripadvisorAttractionDetails(
      {
        data: {
          localizedName: 'SOGNO PARIS',
          photoSizeDynamic: {
            maxWidth: 1600,
            urlTemplate:
              'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/sogno.jpg?w={width}&h={height}&s=1',
          },
        },
      },
      '28091234',
    )
    expect(info.name).toBe('SOGNO PARIS')
    expect(info.photos).toEqual([
      'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/sogno.jpg?w=1200&h=900&s=1',
    ])
  })

  it('appends the trip city to restaurant queries and accepts another city', () => {
    expect(tripadvisorAutocompleteQuery('Sogno', undefined, 'restaurant')).toBe(
      'Sogno Paris',
    )
    expect(tripadvisorAutocompleteQuery('Sogno Paris', undefined, 'restaurant')).toBe(
      'Sogno Paris',
    )
    expect(
      tripadvisorAutocompleteQuery('索尼奥', 'Sogno Paris', 'restaurant'),
    ).toBe('Sogno Paris')
    expect(
      tripadvisorAutocompleteQuery('斯菲尔', 'Sphère', 'restaurant'),
    ).toBe('Sphère Paris')
    expect(
      tripadvisorAutocompleteQuery('斯菲尔 (Sphère)', undefined, 'restaurant'),
    ).toBe('Sphère Paris')
    expect(
      tripadvisorAutocompleteQuery("L'Alsace", undefined, 'restaurant', 'Lyon'),
    ).toBe("L'Alsace Lyon")
    expect(
      tripadvisorAutocompleteQuery('香榭丽舍大街', 'Avenue des Champs-Élysées', 'attraction'),
    ).toBe('Avenue des Champs-Élysées Paris')
    expect(tripadvisorAutocompleteQuery('斯菲尔', undefined, 'restaurant')).toBe('')
  })

  it('matches Brasserie L\'Alsace from the shorter Google/itinerary name', () => {
    const items = [
      { contentId: '188151', name: 'Eiffel Tower', kind: 'attraction' as const },
      {
        contentId: '5943832',
        name: "Brasserie L'Alsace",
        kind: 'restaurant' as const,
      },
    ]
    expect(matchTripadvisorCatalogItem(items, "L'Alsace")?.contentId).toBe('5943832')
    expect(matchTripadvisorCatalogItem(items, '阿尔萨斯', "L'Alsace")?.contentId).toBe(
      '5943832',
    )
    expect(
      matchTripadvisorCatalogItem(listSeededTripadvisorRestaurants(), "L'Alsace")
        ?.contentId,
    ).toBe('5943832')
    expect(
      matchTripadvisorCatalogItem(listSeededTripadvisorRestaurants(), '阿尔萨斯')
        ?.contentId,
    ).toBe('5943832')
  })

  it('matches Sphere from the Chinese itinerary name and accented local name', () => {
    const items = [
      {
        contentId: '25158864',
        name: 'Sphere',
        kind: 'restaurant' as const,
      },
    ]
    expect(matchTripadvisorCatalogItem(items, '斯菲尔', 'Sphère')?.contentId).toBe(
      '25158864',
    )
    expect(
      matchTripadvisorCatalogItem(items, '斯菲尔 (Sphère)')?.contentId,
    ).toBe('25158864')
    expect(
      listSeededTripadvisorRestaurants().find((item) => item.contentId === '25158864')
        ?.listingUrl,
    ).toBe(SPHERE_LISTING_URL)
  })

  it('loads Brasserie L\'Alsace details photos when the listing is seeded', async () => {
    authFetch.mockReset()
    resetTripadvisorRequestBudgetForTests()
    resetLlmArtifactStoreForTests()
    resetTripadvisorPlacePhotosForTests()
    authFetch.mockResolvedValueOnce(
      tripadvisor34DetailResponse({
        id: '5943832',
        name: "Brasserie L'Alsace",
        photos: [
          'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/23/5d/95/29/terrasse.jpg?w=1200&h=900&s=1',
          'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/alsace-2.jpg?w=1200&h=900&s=1',
        ],
      }),
    )

    const gallery = await fetchTripadvisorPlaceGallery({
      name: '阿尔萨斯',
      nameLocal: "L'Alsace",
      type: 'restaurant',
    })
    expect(gallery?.contentId).toBe('5943832')
    expect(gallery?.photos).toEqual([
      'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/23/5d/95/29/terrasse.jpg?w=1200&h=900&s=1',
      'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/alsace-2.jpg?w=1200&h=900&s=1',
    ])
    expect(authFetch).toHaveBeenCalledTimes(1)
    expectRestaurantDetailsQuery(String(authFetch.mock.calls[0]?.[0] || ''), ALSACE_LISTING_URL)
    expect(resolveTripadvisorRestaurantListing).not.toHaveBeenCalled()
  })

  it('reads an attraction contentId from auto-complete suggestions', () => {
    const items = normalizeTripadvisorAutocomplete({
      data: [
        {
          localizedName: 'Eiffel Tower',
          type: 'ATTRACTION',
          url: 'https://www.tripadvisor.com/Attraction_Review-g187147-d188151-Reviews-Eiffel_Tower-Paris_Ile_de_France.html',
          route: { params: { contentId: '188151' } },
        },
        {
          title: 'Hotel something',
          type: 'HOTEL',
          route: { params: { contentId: '999001' } },
        },
      ],
    })
    expect(items).toEqual([
      {
        contentId: '188151',
        name: 'Eiffel Tower',
        kind: 'attraction',
        listingUrl:
          'https://www.tripadvisor.com/Attraction_Review-g187147-d188151-Reviews-Eiffel_Tower-Paris_Ile_de_France.html',
      },
    ])
  })

  it('reads restaurant contentIds from auto-complete when looking up restaurants', () => {
    const items = normalizeTripadvisorAutocomplete(
      {
        data: [
          {
            localizedName: 'Le Comptoir du Relais',
            type: 'RESTAURANT',
            route: { params: { contentId: '712345' } },
          },
          {
            localizedName: 'Sogno Paris',
            type: 'RESTAURANT',
            locationId: '28091234',
          },
          {
            title: 'Hotel something',
            type: 'HOTEL',
            route: { params: { contentId: '999001' } },
          },
        ],
      },
      'restaurant',
    )
    expect(items).toEqual([
      { contentId: '712345', name: 'Le Comptoir du Relais', kind: 'restaurant' },
      { contentId: '28091234', name: 'Sogno Paris', kind: 'restaurant' },
    ])
  })

  it('parses ta- candidate ids used by itinerary drafts', () => {
    expect(tripadvisorContentIdFromCandidate('ta-188709')).toBe('188709')
    expect(tripadvisorContentIdFromCandidate('loc;188709')).toBe('188709')
    expect(tripadvisorContentIdFromCandidate('ChIJ-google')).toBeUndefined()
    expect(
      tripadvisorContentIdFromUrl(
        'https://www.tripadvisor.com/Restaurant_Review-g187147-d28091234-Reviews-SOGNO_PARIS-Paris_Ile_de_France.html',
      ),
    ).toBe('28091234')
  })

  it('reads restaurant eateries from Tripadvisor typeahead payloads', () => {
    const items = normalizeTripadvisorAutocomplete(
      {
        data: [
          {
            heading: { htmlString: '<b>La Conca del Sogno</b>' },
            secondaryTextLineOne: { string: 'Nerano, Campania, Italy' },
            trackingItems: {
              dataType: 'LOCATION',
              placeType: 'ACCOMMODATION',
              locationId: 1809050,
              text: 'La Conca del Sogno',
            },
          },
          {
            heading: { htmlString: '<b>SOGNO PARIS</b>' },
            secondaryTextLineOne: { string: '16th Arr. - Trocadero, Paris' },
            graphic: {
              image: {
                sizes: {
                  urlTemplate:
                    'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/sogno.jpg?w={width}&h={height}&s=1',
                },
              },
            },
            trackingItems: {
              dataType: 'LOCATION',
              placeType: 'EATERY',
              locationId: 28091234,
              text: 'SOGNO PARIS',
            },
          },
        ],
      },
      'restaurant',
    )
    expect(items).toEqual([
      {
        contentId: '28091234',
        name: 'SOGNO PARIS',
        kind: 'restaurant',
        coverUrl:
          'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/sogno.jpg?w=1200&h=900&s=1',
      },
    ])
  })

  it('reads tripadvisor34 autocomplete items and restaurant details', () => {
    expect(
      normalizeTripadvisorAutocomplete(
        {
          success: true,
          data: {
            items: [
              {
                id: 'loc;5943832',
                locationId: 5943832,
                name: "Brasserie L'Alsace",
                type: 'restaurant',
                description: 'Paris, Ile-de-France, France',
                image:
                  'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/23/5d/95/29/terrasse.jpg?w=500&h=-1&s=1',
                url: 'https://www.tripadvisor.com/Restaurant_Review-g187147-d5943832-Reviews-Brasserie_L_Alsace-Paris_Ile_de_France.html',
                latitude: 48.86998,
                longitude: 2.305772,
              },
              { id: 'RESCUE', kind: 'rescue', name: 'Add a place' },
              {
                id: 'loc;188151',
                locationId: 188151,
                name: 'Eiffel Tower',
                type: 'attraction',
              },
            ],
          },
        },
        'restaurant',
      ),
    ).toEqual([
      {
        contentId: '5943832',
        name: "Brasserie L'Alsace",
        kind: 'restaurant',
        coverUrl:
          'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/23/5d/95/29/terrasse.jpg?w=500&h=900&s=1',
        listingUrl:
          'https://www.tripadvisor.com/Restaurant_Review-g187147-d5943832-Reviews-Brasserie_L_Alsace-Paris_Ile_de_France.html',
        location: { lat: 48.86998, lng: 2.305772 },
      },
    ])

    const info = normalizeTripadvisorAttractionDetails(
      {
        success: true,
        id: '5943832',
        name: "Brasserie L'Alsace",
        category: 'RESTAURANT',
        image:
          'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/23/5d/95/29/terrasse.jpg?w=1200&h=-1&s=1',
        images: [
          {
            url: 'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/23/5d/95/29/terrasse.jpg?w=1200&h=-1&s=1',
          },
          {
            url: 'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/alsace-2.jpg?w=800&h=800&s=1',
          },
          { url: 'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/tiny.jpg?w=100&h=100' },
        ],
        phone: '+33 1 53 93 97 00',
        rating: 3.3,
        reviewCount: 844,
        address: {
          street: '39 Avenue Des Champs-élysées',
          city: 'Paris',
          postalCode: '75008',
          country: 'FR',
        },
        coordinates: { latitude: 48.86998, longitude: 2.305772 },
        priceRange: '€€€',
        cuisines: ['French', 'European', 'Alsatian'],
        reviews: [
          {
            rating: 2,
            title: 'Overpriced tourist trap',
            text: 'Food was average and the terrace was packed with tour groups all evening.',
            publishedDate: '2026-05-19',
            author: { name: 'JP T' },
          },
        ],
      },
      '5943832',
    )
    expect(info).toMatchObject({
      contentId: '5943832',
      name: "Brasserie L'Alsace",
      rating: 3.3,
      userRatingCount: 844,
      phone: '+33 1 53 93 97 00',
      address: '39 Avenue Des Champs-élysées, 75008 Paris, FR',
      location: { lat: 48.86998, lng: 2.305772 },
      priceLevel: '€€€',
      cuisine: 'French · European · Alsatian',
    })
    expect(info.photos[0]).toContain('terrasse.jpg')
    expect(info.photos).toContain(
      'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/alsace-2.jpg?w=800&h=800&s=1',
    )
    expect(info.photos.join(' ')).not.toContain('tiny.jpg')
    expect(info.reviews[0]).toMatchObject({
      rating: 2,
      author: 'JP T',
      relativeTime: '2026-05-19',
    })
  })

  it('calls Tripadvisor autocomplete once for an unmatched cafe and skips the gallery', async () => {
    authFetch.mockReset()
    resetTripadvisorRequestBudgetForTests()
    resetLlmArtifactStoreForTests()
    resetTripadvisorPlacePhotosForTests()
    authFetch.mockResolvedValueOnce(tripadvisor34AutocompleteResponse([]))

    const unmatched = await fetchTripadvisorPlaceGallery({
      name: 'Some Unknown Cafe',
      type: 'cafe',
    })
    expect(unmatched).toBeNull()
    expect(authFetch).toHaveBeenCalledTimes(1)
    expect(String(authFetch.mock.calls[0]?.[0] || '')).toContain(
      'rest=api%2Fv1%2Fautocomplete',
    )
    expect(String(authFetch.mock.calls[0]?.[0] || '')).toContain(
      'location=Some+Unknown+Cafe+Paris',
    )
    expect(String(authFetch.mock.calls[0]?.[0] || '')).not.toContain(
      'restaurants%2Fsearch',
    )
    expect(String(authFetch.mock.calls[0]?.[0] || '')).not.toContain('restaurants%2Fdetail')

    // Simulate cloud hydration replacing trip artifacts, followed by a page refresh.
    saveLlmArtifacts({}, { silent: true })
    resetTripadvisorPlacePhotosForTests()
    authFetch.mockClear()
    const again = await fetchTripadvisorPlaceGallery({
      name: 'Some Unknown Cafe',
      type: 'cafe',
    })
    expect(again).toBeNull()
    expect(authFetch).not.toHaveBeenCalled()
  })

  it('loads a restaurant gallery from one autocomplete match as a last resort', async () => {
    authFetch.mockReset()
    resetTripadvisorRequestBudgetForTests()
    resetLlmArtifactStoreForTests()
    resetTripadvisorPlacePhotosForTests()
    authFetch
      .mockResolvedValueOnce(
        tripadvisor34AutocompleteResponse([
          {
            locationId: 698123,
            name: 'Bouillon Chartier',
            type: 'restaurant',
          },
        ]),
      )
      .mockResolvedValueOnce(restaurantMediaGalleryResponse('https://media-cdn.tripadvisor.com/chartier.jpg'))

    const gallery = await fetchTripadvisorPlaceGallery({
      name: 'Bouillon Chartier',
      type: 'restaurant',
    })
    expect(gallery?.contentId).toBe('698123')
    expect(gallery?.kind).toBe('restaurant')
    expect(gallery?.photos).toEqual(['https://media-cdn.tripadvisor.com/chartier.jpg'])
    expect(authFetch).toHaveBeenCalledTimes(2)
    expect(String(authFetch.mock.calls[0]?.[0] || '')).toContain(
      'rest=api%2Fv1%2Fautocomplete',
    )
    expect(String(authFetch.mock.calls[0]?.[0] || '')).toContain(
      'location=Bouillon+Chartier+Paris',
    )
    expect(String(authFetch.mock.calls[1]?.[0] || '')).toContain(
      'rest=api%2Fv1%2Frestaurants%2Fdetail',
    )
    expectRestaurantDetailsQuery(
      String(authFetch.mock.calls[1]?.[0] || ''),
      restaurantListingUrl(698123, 'Bouillon Chartier'),
    )

    authFetch.mockClear()
    const cached = await fetchTripadvisorPlaceGallery({
      name: 'Bouillon Chartier',
      type: 'restaurant',
    })
    expect(cached?.photos).toEqual(['https://media-cdn.tripadvisor.com/chartier.jpg'])
    expect(authFetch).not.toHaveBeenCalled()

    const byChineseLabel = await fetchTripadvisorPlaceGallery({
      name: '夏蒂埃清汤',
      nameLocal: 'Bouillon Chartier',
      type: 'restaurant',
    })
    expect(byChineseLabel?.photos).toEqual([
      'https://media-cdn.tripadvisor.com/chartier.jpg',
    ])
    expect(authFetch).not.toHaveBeenCalled()
  })

  it('returns the seeded Sphere cover without waiting for restaurant details', async () => {
    authFetch.mockReset()
    resetTripadvisorRequestBudgetForTests()
    resetLlmArtifactStoreForTests()
    resetTripadvisorPlacePhotosForTests()
    let resolveDetails!: (value: Response) => void
    const detailsPromise = new Promise<Response>((resolve) => {
      resolveDetails = resolve
    })
    authFetch.mockImplementation(async (input) => {
      const href = String(input)
      if (href.includes('restaurants%2Fdetail')) return detailsPromise
      throw new Error(`unexpected Tripadvisor request ${href}`)
    })

    const previews: string[][] = []
    let detailsSettled = false
    const started = Date.now()
    const info = await fetchTripadvisorRestaurantInfo({
      name: '斯菲尔',
      nameLocal: 'Sphère',
      onPreview: (preview) => {
        previews.push(preview.photos)
      },
      onDetails: () => {
        detailsSettled = true
      },
    })
    expect(Date.now() - started).toBeLessThan(250)
    expect(info?.contentId).toBe('25158864')
    expect(info?.photos[0]).toContain('salle-du-restaurant-gastronomi.jpg')
    expect(previews[0]?.[0]).toContain('salle-du-restaurant-gastronomi.jpg')
    expect(detailsSettled).toBe(false)
    expect(authFetch).toHaveBeenCalledTimes(1)
    expectRestaurantDetailsQuery(String(authFetch.mock.calls[0]?.[0] || ''), SPHERE_LISTING_URL)
    expect(String(authFetch.mock.calls[0]?.[0] || '')).not.toContain('media-gallery')
    expect(String(authFetch.mock.calls[0]?.[0] || '')).not.toContain('restaurants%2Fsearch')
    expect(resolveTripadvisorRestaurantListing).not.toHaveBeenCalled()

    resolveDetails(new Response('upstream timeout', { status: 502 }))
    await Promise.resolve()
  })

  it('upgrades the Sphere cover with restaurant details photos and facts', async () => {
    authFetch.mockReset()
    resetTripadvisorRequestBudgetForTests()
    resetLlmArtifactStoreForTests()
    resetTripadvisorPlacePhotosForTests()
    let resolveDetails!: (value: Response) => void
    const detailsPromise = new Promise<Response>((resolve) => {
      resolveDetails = resolve
    })
    authFetch.mockImplementation(async (input) => {
      const href = String(input)
      if (href.includes('restaurants%2Fdetail')) return detailsPromise
      throw new Error(`unexpected Tripadvisor request ${href}`)
    })

    const previews: TripadvisorAttractionInfo[] = []
    let detailsInfo: TripadvisorAttractionInfo | null | undefined
    const started = Date.now()
    const info = await fetchTripadvisorRestaurantInfo({
      name: '斯菲尔',
      nameLocal: 'Sphère',
      onPreview: (preview) => {
        previews.push(preview)
      },
      onDetails: (result) => {
        detailsInfo = result
      },
    })
    expect(Date.now() - started).toBeLessThan(250)
    expect(info?.photos).toHaveLength(1)
    expect(previews[0]?.photos).toHaveLength(1)

    resolveDetails(
      tripadvisor34DetailResponse({
        id: '25158864',
        name: 'Sphere',
        photos: [
          'https://media-cdn.tripadvisor.com/sphere-1.jpg',
          'https://media-cdn.tripadvisor.com/sphere-2.jpg',
          'https://media-cdn.tripadvisor.com/sphere-3.jpg',
        ],
        address: '10 Rue de Moscou, 75008 Paris',
        rating: 4.6,
        reviewCount: 120,
        priceRange: '€€€€',
        cuisines: ['French', 'European'],
        reviews: [
          {
            text: 'A memorable tasting menu in a quiet dining room near Parc Monceau.',
            rating: 5,
            author: { name: 'Ada' },
            publishedDate: '2026-04-01',
          },
        ],
      }),
    )
    await vi.waitFor(() => {
      expect(detailsInfo?.photos.length).toBeGreaterThan(1)
    })
    expect(detailsInfo?.photos[0]).toContain('salle-du-restaurant-gastronomi.jpg')
    expect(detailsInfo?.photos).toEqual(
      expect.arrayContaining([
        'https://media-cdn.tripadvisor.com/sphere-1.jpg',
        'https://media-cdn.tripadvisor.com/sphere-2.jpg',
      ]),
    )
    expect(detailsInfo?.address).toBe('10 Rue de Moscou, 75008 Paris')
    expect(detailsInfo?.rating).toBe(4.6)
    expect(detailsInfo?.priceLevel).toBe('€€€€')
    expect(detailsInfo?.cuisine).toBe('French · European')
    expect(detailsInfo?.reviews[0]?.author).toBe('Ada')
    expect(previews.at(-1)?.photos.length).toBeGreaterThan(1)
  })

  it('maps tripadvisor34 Sphere detail keys into photos, rating, reviews, address, price, and cuisine', () => {
    const info = normalizeTripadvisorAttractionDetails(
      {
        success: true,
        id: '25158864',
        name: 'Sphere',
        category: 'RESTAURANT',
        image:
          'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/2a/82/2c/00/salle-du-restaurant-gastronomi.jpg?w=500&h=-1&s=1',
        images: [
          {
            url: 'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/28/b4/16/d3/caption.jpg?w=1100&h=600&',
          },
          {
            url: 'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/2d/b1/49/51/caption.jpg?w=1400&h=-1&',
          },
        ],
        cuisines: ['French'],
        phone: '+33 1 71 25 26 91',
        priceRange: '$$$$',
        rating: 3.7,
        reviewCount: 200,
        address: {
          street: '18 Rue La Boétie',
          city: 'Paris',
          postalCode: '75008',
          country: 'FR',
        },
        coordinates: { latitude: 48.874268, longitude: 2.31694 },
        reviews: [
          {
            rating: 3,
            title: 'Lack of soul, a sommelier, and a real wine list',
            text: 'We went there for dinner and the experience is mixed. The dishes are good but not extraordinary because there are too many condiments.',
            publishedDate: '2026-07-08',
            author: { name: 'Stephane L' },
          },
        ],
      },
      '25158864',
    )
    expect(info.name).toBe('Sphere')
    expect(info.rating).toBe(3.7)
    expect(info.userRatingCount).toBe(200)
    expect(info.cuisine).toBe('French')
    expect(info.priceLevel).toBe('$$$$')
    expect(formatPriceLevelLabel(info.priceLevel)).toContain('€€€€')
    expect(info.address).toContain('18 Rue La Boétie')
    expect(info.phone).toBe('+33 1 71 25 26 91')
    expect(info.photos.length).toBeGreaterThan(1)
    expect(info.reviews[0]?.author).toBe('Stephane L')
    expect(info.reviews[0]?.text).toContain('experience is mixed')
  })

  it('does not treat a seeded restaurant cover as settled Tripadvisor details', () => {
    resetTripadvisorRequestBudgetForTests()
    resetLlmArtifactStoreForTests()
    resetTripadvisorPlacePhotosForTests()
    const peeked = peekTripadvisorRestaurantInfo('斯菲尔', 'Sphère')
    expect(peeked?.contentId).toBe('25158864')
    expect(peeked?.photos).toHaveLength(1)
    expect(hasSettledTripadvisorRestaurantDetails(peeked)).toBe(false)
    expect(hasCachedTripadvisorRestaurantDetails(peeked?.contentId)).toBe(false)
    expect(hasCachedTripadvisorGallery(peeked?.contentId, 'restaurant')).toBe(false)
  })

  it('ignores stale v7/v9 mixed albums and refetches restaurant details', async () => {
    authFetch.mockReset()
    resetTripadvisorRequestBudgetForTests()
    resetLlmArtifactStoreForTests()
    resetTripadvisorPlacePhotosForTests()
    const mixedPhotos = [
      'https://media-cdn.tripadvisor.com/sphere-salle.jpg',
      'https://media-cdn.tripadvisor.com/sogno-pasta.jpg',
      'https://media-cdn.tripadvisor.com/king-cap-selfie.jpg',
    ]
    const staleDetails = {
      contentId: '25158864',
      name: 'Sphere',
      address: '18 Rue La Boétie, 75008 Paris',
      rating: 3.7,
      photos: mixedPhotos,
      reviews: [{ text: 'stale mixed album', rating: 3, author: 'Old' }],
    }
    setLlmArtifact('tripadvisor-gallery:v9:restaurant:25158864', {
      contentId: '25158864',
      kind: 'restaurant',
      name: 'Sphere',
      photos: mixedPhotos,
    })
    setLlmArtifact('tripadvisor-place-details:v7:25158864', staleDetails)
    setLlmArtifact('tripadvisor-gallery:v9:restaurant:24052281', {
      contentId: '24052281',
      kind: 'restaurant',
      name: 'Sogno Paris',
      photos: mixedPhotos,
    })
    setLlmArtifact('tripadvisor-place-details:v7:24052281', {
      ...staleDetails,
      contentId: '24052281',
      name: 'Sogno Paris',
    })
    resetTripadvisorPlacePhotosForTests()

    const spherePeek = peekTripadvisorRestaurantInfo('斯菲尔', 'Sphère')
    expect(spherePeek?.photos.join(' ')).not.toContain('sogno-pasta')
    expect(hasSettledTripadvisorRestaurantDetails(spherePeek)).toBe(false)
    expect(hasCachedTripadvisorRestaurantDetails('25158864')).toBe(false)
    expect(hasCachedTripadvisorGallery('25158864', 'restaurant')).toBe(false)
    expect(peekTripadvisorRestaurantInfo('Sogno')?.photos.join(' ')).not.toContain('sphere-salle')
    expect(hasCachedTripadvisorRestaurantDetails('24052281')).toBe(false)

    authFetch.mockImplementation(async (input) => {
      const href = String(input)
      if (href.includes('restaurants%2Freviews')) {
        return new Response(JSON.stringify({ success: true, reviews: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      if (href.includes(encodeURIComponent(SPHERE_LISTING_URL))) {
        return tripadvisor34DetailResponse({
          id: '25158864',
          name: 'Sphere',
          photos: [
            'https://media-cdn.tripadvisor.com/sphere-listing-1.jpg',
            'https://media-cdn.tripadvisor.com/sphere-listing-2.jpg',
          ],
          address: '18 Rue La Boétie, 75008 Paris',
          rating: 3.7,
          reviews: [
            {
              text: 'Listing-only Sphere album from restaurants detail.',
              rating: 4,
              author: 'Pat',
            },
          ],
        })
      }
      if (href.includes(encodeURIComponent(SOGNO_LISTING_URL))) {
        return tripadvisor34DetailResponse({
          id: '24052281',
          name: 'Sogno Paris',
          photos: [
            'https://media-cdn.tripadvisor.com/sogno-listing-1.jpg',
            'https://media-cdn.tripadvisor.com/sogno-listing-2.jpg',
          ],
          address: "42 Rue de l'Amiral Hamelin, 75016 Paris",
          rating: 4.5,
          reviews: [
            {
              text: 'Listing-only Sogno album from restaurants detail.',
              rating: 5,
              author: 'Sam',
            },
          ],
        })
      }
      throw new Error(`unexpected Tripadvisor request ${href}`)
    })

    const sphere = await fetchTripadvisorRestaurantInfo({
      name: '斯菲尔',
      nameLocal: 'Sphère',
    })
    const sogno = await fetchTripadvisorRestaurantInfo({ name: 'Sogno' })
    const detailUrls = authFetch.mock.calls
      .map((call) => String(call[0] || ''))
      .filter((href) => href.includes('restaurants%2Fdetail'))
    expect(detailUrls).toHaveLength(2)
    expectRestaurantDetailsQuery(detailUrls[0], SPHERE_LISTING_URL)
    expectRestaurantDetailsQuery(detailUrls[1], SOGNO_LISTING_URL)
    expect(sphere?.photos.join(' ')).toContain('sphere-listing-1')
    expect(sphere?.photos.join(' ')).not.toContain('sogno-pasta')
    expect(sogno?.photos.join(' ')).toContain('sogno-listing-1')
    expect(sogno?.photos.join(' ')).not.toContain('sphere-salle')
    expect(hasCachedTripadvisorRestaurantDetails('25158864')).toBe(true)
    expect(hasCachedTripadvisorRestaurantDetails('24052281')).toBe(true)
  })

  it('still requests restaurant details after a cover preview and fires onDetails later', async () => {
    authFetch.mockReset()
    resetTripadvisorRequestBudgetForTests()
    resetLlmArtifactStoreForTests()
    resetTripadvisorPlacePhotosForTests()
    let resolveDetails!: (value: Response) => void
    const detailsPromise = new Promise<Response>((resolve) => {
      resolveDetails = resolve
    })
    authFetch.mockImplementation(async (input) => {
      const href = String(input)
      if (href.includes('restaurants%2Fdetail')) return detailsPromise
      throw new Error(`unexpected Tripadvisor request ${href}`)
    })

    const firstOnDetails = vi.fn()
    const secondOnDetails = vi.fn()
    const preview = await fetchTripadvisorRestaurantInfo({
      name: '斯菲尔',
      nameLocal: 'Sphère',
      onPreview: (info) => {
        expect(info.photos.length).toBeGreaterThan(0)
      },
      onDetails: firstOnDetails,
    })
    expect(preview?.photos).toHaveLength(1)
    expect(firstOnDetails).not.toHaveBeenCalled()
    expect(authFetch).toHaveBeenCalledTimes(1)

    const joined = fetchTripadvisorRestaurantInfo({
      name: '斯菲尔',
      nameLocal: 'Sphère',
      onPreview: () => {},
      onDetails: secondOnDetails,
    })
    expect(authFetch).toHaveBeenCalledTimes(1)
    expect(secondOnDetails).not.toHaveBeenCalled()

    resolveDetails(
      tripadvisor34DetailResponse({
        id: '25158864',
        name: 'Sphere',
        photos: [
          'https://media-cdn.tripadvisor.com/sphere-1.jpg',
          'https://media-cdn.tripadvisor.com/sphere-2.jpg',
        ],
        address: '10 Rue de Moscou, 75008 Paris',
        rating: 4.6,
      }),
    )
    await vi.waitFor(() => {
      expect(firstOnDetails).toHaveBeenCalled()
      expect(secondOnDetails).toHaveBeenCalled()
    })
    const detailsInfo = firstOnDetails.mock.calls[0]?.[0] as TripadvisorAttractionInfo
    expect(detailsInfo.photos.length).toBeGreaterThan(1)
    expect(detailsInfo.address).toBe('10 Rue de Moscou, 75008 Paris')
    expect(detailsInfo.rating).toBe(4.6)
    await joined
  })


  it('keeps the Sphere cover when restaurant details fail', async () => {
    authFetch.mockReset()
    resetTripadvisorRequestBudgetForTests()
    resetLlmArtifactStoreForTests()
    resetTripadvisorPlacePhotosForTests()
    authFetch.mockResolvedValueOnce(new Response('upstream timeout', { status: 502 }))

    const info = await fetchTripadvisorRestaurantInfo({
      name: '斯菲尔',
      nameLocal: 'Sphère',
    })
    expect(info?.contentId).toBe('25158864')
    expect(info?.photos[0]).toContain('salle-du-restaurant-gastronomi.jpg')
    expect(authFetch).toHaveBeenCalledTimes(1)
    expect(resolveTripadvisorRestaurantListing).not.toHaveBeenCalled()
  })

  it('still requests Sphere details after other Tripadvisor calls have used budget', async () => {
    authFetch.mockReset()
    resetTripadvisorRequestBudgetForTests()
    resetLlmArtifactStoreForTests()
    resetTripadvisorPlacePhotosForTests()
    for (let index = 0; index < TRIPADVISOR_MONTHLY_LIMIT - 1; index += 1) {
      expect(tryConsumeTripadvisorRequest('auto-complete')).toBe(true)
    }
    authFetch.mockResolvedValueOnce(
      tripadvisor34DetailResponse({
        id: '25158864',
        name: 'Sphere',
        photos: [
          'https://media-cdn.tripadvisor.com/sphere-1.jpg',
          'https://media-cdn.tripadvisor.com/sphere-2.jpg',
        ],
        address: '18 Rue La Boétie, 75008 Paris',
        rating: 3.7,
        reviewCount: 200,
        priceRange: '$$$$',
        cuisines: ['French'],
        reviews: [
          {
            text: 'A memorable tasting menu in a quiet dining room near Parc Monceau.',
            rating: 5,
            author: { name: 'Ada' },
            publishedDate: '2026-04-01',
          },
        ],
      }),
    )

    const info = await fetchTripadvisorRestaurantInfo({
      name: '斯菲尔',
      nameLocal: 'Sphère',
    })
    expect(authFetch).toHaveBeenCalledTimes(1)
    expectRestaurantDetailsQuery(String(authFetch.mock.calls[0]?.[0] || ''), SPHERE_LISTING_URL)
    expect(info?.rating).toBe(3.7)
    expect(info?.address).toContain('18 Rue La Boétie')
    expect(info?.photos.length).toBeGreaterThan(1)
  })

  it('does not request restaurant details after the monthly cap is used', async () => {
    authFetch.mockReset()
    resetTripadvisorRequestBudgetForTests()
    resetLlmArtifactStoreForTests()
    resetTripadvisorPlacePhotosForTests()
    for (let index = 0; index < TRIPADVISOR_MONTHLY_LIMIT; index += 1) {
      expect(tryConsumeTripadvisorRequest('auto-complete')).toBe(true)
    }

    const info = await fetchTripadvisorRestaurantInfo({
      name: '斯菲尔',
      nameLocal: 'Sphère',
    })
    expect(authFetch).not.toHaveBeenCalled()
    expect(info?.contentId).toBe('25158864')
    expect(info?.photos).toHaveLength(1)
    expect(info?.photos[0]).toContain('salle-du-restaurant-gastronomi.jpg')
    expect(info?.rating).toBeUndefined()
  })

  it('does not request restaurant details after the monthly cap is used', async () => {
    authFetch.mockReset()
    resetTripadvisorRequestBudgetForTests()
    resetLlmArtifactStoreForTests()
    resetTripadvisorPlacePhotosForTests()
    for (let index = 0; index < TRIPADVISOR_MONTHLY_LIMIT; index += 1) {
      expect(tryConsumeTripadvisorRequest('auto-complete')).toBe(true)
    }

    const info = await fetchTripadvisorRestaurantInfo({
      name: '斯菲尔',
      nameLocal: 'Sphère',
    })
    expect(authFetch).not.toHaveBeenCalled()
    expect(info?.contentId).toBe('25158864')
    expect(info?.photos).toHaveLength(1)
    expect(info?.photos[0]).toContain('salle-du-restaurant-gastronomi.jpg')
    expect(info?.rating).toBeUndefined()
  })

  it('persists a sparse restaurant details response instead of requesting it again', async () => {
    authFetch.mockReset()
    resetTripadvisorRequestBudgetForTests()
    resetLlmArtifactStoreForTests()
    resetTripadvisorPlacePhotosForTests()
    let detailCalls = 0
    const sphereCover =
      'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/2a/82/2c/00/salle-du-restaurant-gastronomi.jpg?w=1200&h=900&s=1'
    authFetch.mockImplementation(async (input) => {
      const href = String(input)
      if (href.includes('restaurants%2Freviews')) {
        return new Response(JSON.stringify({ success: true, reviews: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      if (!href.includes('restaurants%2Fdetail')) {
        throw new Error(`unexpected Tripadvisor request ${href}`)
      }
      detailCalls += 1
      if (detailCalls === 1) {
        return tripadvisor34DetailResponse({
          id: '25158864',
          name: 'Sphere',
          photos: [sphereCover],
        })
      }
      return tripadvisor34DetailResponse({
        id: '25158864',
        name: 'Sphere',
        photos: [
          'https://media-cdn.tripadvisor.com/sphere-1.jpg',
          'https://media-cdn.tripadvisor.com/sphere-2.jpg',
        ],
        address: '18 Rue La Boétie, 75008 Paris',
        rating: 3.7,
        cuisines: ['French'],
        priceRange: '$$$$',
      })
    })

    const first = await fetchTripadvisorRestaurantInfo({
      name: '斯菲尔',
      nameLocal: 'Sphère',
    })
    expect(first?.photos).toEqual([sphereCover])
    expect(hasSettledTripadvisorRestaurantDetails(first)).toBe(false)
    expect(detailCalls).toBe(1)

    resetTripadvisorPlacePhotosForTests()
    authFetch.mockClear()
    const second = await fetchTripadvisorRestaurantInfo({
      name: '斯菲尔',
      nameLocal: 'Sphère',
    })
    expect(detailCalls).toBe(1)
    expect(authFetch).not.toHaveBeenCalled()
    expect(second?.photos).toEqual([sphereCover])
    expect(second?.rating).toBeUndefined()
  })

  it('reuses a cafe gallery when the Chinese/English labels are swapped', async () => {
    authFetch.mockReset()
    resetTripadvisorRequestBudgetForTests()
    resetLlmArtifactStoreForTests()
    resetTripadvisorPlacePhotosForTests()
    authFetch
      .mockResolvedValueOnce(
        tripadvisor34AutocompleteResponse([
          {
            locationId: 778899,
            name: 'Parallel Coffee',
            type: 'restaurant',
          },
        ]),
      )
      .mockResolvedValueOnce(restaurantMediaGalleryResponse('https://media-cdn.tripadvisor.com/parallel.jpg'))

    const first = await fetchTripadvisorPlaceGallery({
      name: 'Parallel Coffee',
      nameLocal: '平行咖啡',
      type: 'cafe',
    })
    expect(first?.photos).toEqual(['https://media-cdn.tripadvisor.com/parallel.jpg'])
    expect(authFetch).toHaveBeenCalledTimes(2)

    authFetch.mockClear()
    const swapped = await fetchTripadvisorPlaceGallery({
      name: '平行咖啡',
      nameLocal: 'Parallel Coffee',
      type: 'cafe',
    })
    expect(swapped?.photos).toEqual(['https://media-cdn.tripadvisor.com/parallel.jpg'])
    expect(authFetch).not.toHaveBeenCalled()
  })

  it('invalidates one cafe match and gallery before an explicit refresh', async () => {
    authFetch.mockReset()
    resetTripadvisorRequestBudgetForTests()
    resetLlmArtifactStoreForTests()
    resetTripadvisorPlacePhotosForTests()
    authFetch
      .mockResolvedValueOnce(
        tripadvisor34AutocompleteResponse([
          { locationId: 778899, name: 'Parallel Coffee', type: 'restaurant' },
        ]),
      )
      .mockResolvedValueOnce(
        restaurantMediaGalleryResponse('https://media-cdn.tripadvisor.com/stale-cafe.jpg'),
      )
      .mockResolvedValueOnce(
        tripadvisor34AutocompleteResponse([
          { locationId: 990011, name: 'Parallel Coffee', type: 'restaurant' },
        ]),
      )
      .mockResolvedValueOnce(
        restaurantMediaGalleryResponse('https://media-cdn.tripadvisor.com/parallel-new.jpg'),
      )

    const input = {
      name: 'Parallel Coffee',
      nameLocal: '平行咖啡',
      type: 'cafe' as const,
    }
    const first = await fetchTripadvisorPlaceGallery(input)
    expect(first?.photos).toEqual([
      'https://media-cdn.tripadvisor.com/stale-cafe.jpg',
    ])

    invalidateTripadvisorPlaceCache(input)
    const refreshed = await fetchTripadvisorPlaceGallery(input)

    expect(refreshed?.contentId).toBe('990011')
    expect(refreshed?.photos).toEqual([
      'https://media-cdn.tripadvisor.com/parallel-new.jpg',
    ])
    expect(authFetch).toHaveBeenCalledTimes(4)
  })

  it('does not attach an unrelated restaurant autocomplete hit', async () => {
    authFetch.mockReset()
    resetTripadvisorRequestBudgetForTests()
    resetLlmArtifactStoreForTests()
    resetTripadvisorPlacePhotosForTests()
    authFetch.mockResolvedValueOnce(
      tripadvisor34AutocompleteResponse([
        {
          locationId: 111000,
          name: 'Some Other Bistro',
          type: 'restaurant',
        },
      ]),
    )

    const unmatched = await fetchTripadvisorPlaceGallery({
      name: 'Le Comptoir du Relais',
      type: 'restaurant',
    })
    expect(unmatched).toBeNull()
    expect(authFetch).toHaveBeenCalledTimes(1)
    expect(String(authFetch.mock.calls[0]?.[0] || '')).toContain(
      'rest=api%2Fv1%2Fautocomplete',
    )
    expect(String(authFetch.mock.calls[0]?.[0] || '')).not.toContain(
      'restaurants%2Fsearch',
    )
    expect(String(authFetch.mock.calls[0]?.[0] || '')).not.toContain('restaurants%2Fdetail')
  })

  it('matches the seeded Sogno Paris listing from the Google/itinerary name', () => {
    const items = listSeededTripadvisorRestaurants()
    expect(matchTripadvisorCatalogItem(items, 'Sogno')?.contentId).toBe('24052281')
    expect(matchTripadvisorCatalogItem(items, '多恋', 'Sogno Paris')?.contentId).toBe(
      '24052281',
    )
    const seeded = listSeededTripadvisorRestaurants()
    const sognoCover = seeded.find((item) => item.contentId === '24052281')?.coverUrl || ''
    const sphereCover = seeded.find((item) => item.contentId === '25158864')?.coverUrl || ''
    expect(sognoCover).toContain('penne-all-arrabbiata.jpg')
    expect(sphereCover).toContain('salle-du-restaurant-gastronomi.jpg')
    expect(sognoCover).not.toBe(sphereCover)
  })

  it('does not ingest nested related listing photos into a restaurant gallery', () => {
    const sognoHero =
      'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/sogno-pasta.jpg?w=1200&h=900&s=1'
    const sognoDish =
      'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/sogno-pizza.jpg?w=1200&h=900&s=1'
    const sphereHero =
      'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/sphere-salle.jpg?w=1200&h=900&s=1'
    const selfie =
      'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/king-cap-selfie.jpg?w=1200&h=900&s=1'
    const eiffel =
      'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/eiffel-tower.jpg?w=1200&h=900&s=1'
    const beach =
      'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/traveler-beach.jpg?w=1200&h=900&s=1'

    const sogno = normalizeTripadvisorAttractionDetails(
      {
        success: true,
        id: '24052281',
        name: 'Sogno Paris',
        category: 'RESTAURANT',
        image: sognoHero,
        images: [{ url: sognoHero }, { url: sognoDish }],
        similarRestaurants: [
          {
            id: '25158864',
            name: 'Sphere',
            image: sphereHero,
            images: [{ url: selfie }, { url: eiffel }, { url: beach }],
          },
        ],
        nearbyAttractions: [{ images: [{ url: eiffel }] }],
      },
      '24052281',
    )
    const sphere = normalizeTripadvisorAttractionDetails(
      {
        success: true,
        id: '25158864',
        name: 'Sphere',
        category: 'RESTAURANT',
        image: sphereHero,
        images: [{ url: sphereHero }],
        similarRestaurants: [
          {
            id: '24052281',
            name: 'Sogno Paris',
            images: [{ url: sognoHero }, { url: sognoDish }, { url: selfie }],
          },
        ],
      },
      '25158864',
    )

    expect(sogno.photos.join(' ')).toContain('sogno-pasta')
    expect(sogno.photos.join(' ')).toContain('sogno-pizza')
    expect(sogno.photos.join(' ')).not.toContain('king-cap-selfie')
    expect(sogno.photos.join(' ')).not.toContain('eiffel-tower')
    expect(sogno.photos.join(' ')).not.toContain('traveler-beach')
    expect(sogno.photos.join(' ')).not.toContain('sphere-salle')

    expect(sphere.photos.join(' ')).toContain('sphere-salle')
    expect(sphere.photos.join(' ')).not.toContain('sogno-pasta')
    expect(sphere.photos.join(' ')).not.toContain('sogno-pizza')
    expect(sphere.photos.join(' ')).not.toContain('king-cap-selfie')

    const wrapped = normalizeTripadvisorGallery(
      {
        success: true,
        data: {
          id: '24052281',
          name: 'Sogno Paris',
          category: 'RESTAURANT',
          image: sognoHero,
          images: [{ url: sognoDish }],
          relatedListings: [{ images: [{ url: selfie }, { url: eiffel }, { url: beach }] }],
        },
      },
      'restaurant',
      '24052281',
      'Sogno Paris',
    )
    expect(wrapped.photos.join(' ')).toContain('sogno-pizza')
    expect(wrapped.photos.join(' ')).not.toContain('king-cap-selfie')
    expect(wrapped.photos.join(' ')).not.toContain('eiffel-tower')
    expect(wrapped.photos.join(' ')).not.toContain('traveler-beach')

    const walked = normalizeTripadvisorAttractionDetails(
      {
        data: {
          localizedName: 'Sogno Paris',
          photoSizeDynamic: {
            urlTemplate:
              'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/sogno-hero.jpg?w={width}&h={height}&s=1',
          },
          similarRestaurants: [
            {
              photoSizeDynamic: {
                urlTemplate:
                  'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/king-cap-selfie.jpg?w={width}&h={height}&s=1',
              },
            },
          ],
        },
      },
      '24052281',
    )
    expect(walked.photos.join(' ')).toContain('sogno-hero')
    expect(walked.photos.join(' ')).not.toContain('king-cap-selfie')
  })

  it('drops Related Stories and nearby restaurant photos from tripadvisor34 details', () => {
    const listingHero =
      'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/2a/82/2c/00/salle-du-restaurant-gastronomi.jpg?w=500&h=-1&s=1'
    const listingDish =
      'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/28/b4/16/d3/caption.jpg?w=1100&h=600&'
    const listingInterior =
      'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/2d/b1/49/51/caption.jpg?w=1400&h=-1&'
    const tinyThumb =
      'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/34/22/fe/68/caption.jpg?w=300&h=300&'
    const seaCouple =
      'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/33/c9/52/3c/caption.jpg?w=2400&h=-1&'
    const eiffelCroissant =
      'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/30/0f/25/01/caption.jpg?w=2400&h=-1&'
    const groupSelfie =
      'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/2e/ca/54/84/caption.jpg?w=2400&h=-1&'
    const nearbyPizza =
      'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/0b/e3/d1/28/maigre-confit-a-l-huile.jpg?w=1600&h=1200&'
    const nearbyHotel =
      'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/26/f4/b2/e3/hotel-la-canopee.jpg?w=400&h=400&'
    const nearbyBurger =
      'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/related-burger.jpg?w=1600&h=1200&'
    const beach =
      'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/traveler-beach.jpg?w=1600&h=1200&'

    const mixedAlbum = normalizeTripadvisorAttractionDetails(
      {
        success: true,
        id: '25158864',
        name: 'Sphere',
        category: 'RESTAURANT',
        image: listingHero,
        images: [
          { url: listingHero },
          { url: listingDish },
          { url: listingInterior },
          { url: tinyThumb },
          { url: seaCouple },
          { url: eiffelCroissant },
          { url: groupSelfie },
          { url: nearbyPizza },
          { url: nearbyHotel },
        ],
        relatedStories: [
          {
            title: 'The most beautiful beaches near Paris',
            caption: '5 min read',
            author: 'Tripadvisor Editors',
            image: seaCouple,
          },
          {
            title: 'A croissant under the Eiffel Tower',
            caption: '4 min read',
            image: eiffelCroissant,
          },
          {
            title: '10 literary trips with friends',
            caption: '6 min read',
            images: [{ url: groupSelfie }, { url: beach }],
          },
        ],
        nearbyRestaurants: [
          {
            name: 'Best moderately priced restaurants',
            images: [{ url: nearbyPizza }, { url: nearbyBurger }],
          },
          { name: 'Best nearby', image: nearbyHotel },
        ],
      },
      '25158864',
    )
    const mixed = mixedAlbum.photos.join(' ')
    expect(mixed).toContain('salle-du-restaurant-gastronomi')
    expect(mixed).toContain('28/b4/16/d3')
    expect(mixed).toContain('2d/b1/49/51')
    expect(mixed).not.toContain('33/c9/52/3c')
    expect(mixed).not.toContain('30/0f/25/01')
    expect(mixed).not.toContain('2e/ca/54/84')
    expect(mixed).not.toContain('maigre-confit')
    expect(mixed).not.toContain('hotel-la-canopee')
    expect(mixed).not.toContain('related-burger')
    expect(mixed).not.toContain('traveler-beach')
    expect(mixed).not.toContain('34/22/fe/68')

    const captioned = normalizeTripadvisorAttractionDetails(
      {
        success: true,
        id: '24052281',
        name: 'Sogno Paris',
        category: 'RESTAURANT',
        image:
          'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/sogno-pasta.jpg?w=1200&h=900&s=1',
        images: [
          {
            url: 'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/sogno-pasta.jpg?w=1200&h=900&s=1',
          },
          {
            url: 'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/sogno-pizza.jpg?w=1200&h=900&s=1',
          },
          {
            url: seaCouple,
            type: 'article',
            section: 'Related Stories',
            caption: '5 min read',
          },
          {
            url: nearbyBurger,
            kind: 'nearby',
            source: 'Best nearby',
          },
        ],
      },
      '24052281',
    )
    expect(captioned.photos.join(' ')).toContain('sogno-pasta')
    expect(captioned.photos.join(' ')).toContain('sogno-pizza')
    expect(captioned.photos.join(' ')).not.toContain('33/c9/52/3c')
    expect(captioned.photos.join(' ')).not.toContain('related-burger')

    const gallery = normalizeTripadvisorGallery(
      {
        success: true,
        data: {
          id: '188486',
          name: 'Grand Palais',
          category: 'ATTRACTION',
          image:
            'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/grand-palais.jpg?w=1200&h=900&s=1',
          images: [
            {
              url: 'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/grand-palais.jpg?w=1200&h=900&s=1',
            },
            { url: tinyThumb },
            { url: seaCouple },
            { url: eiffelCroissant },
            { url: groupSelfie },
          ],
          related_stories: [{ image: seaCouple }, { image: eiffelCroissant }],
        },
      },
      'attraction',
      '188486',
      'Grand Palais',
    )
    expect(gallery.photos.join(' ')).toContain('grand-palais')
    expect(gallery.photos.join(' ')).not.toContain('33/c9/52/3c')
    expect(gallery.photos.join(' ')).not.toContain('30/0f/25/01')
    expect(gallery.photos.join(' ')).not.toContain('2e/ca/54/84')
  })

  it('does not treat nearby hotel thumbs as a cafe album', () => {
    const info = normalizeTripadvisorAttractionDetails(
      {
        success: true,
        id: '33063008',
        name: 'Parallel Coffee',
        category: 'RESTAURANT',
        images: [
          { url: 'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/30/0f/25/01/caption.jpg?w=2400&h=-1&' },
          { url: 'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/2e/ca/54/84/caption.jpg?w=2400&h=-1&' },
          { url: 'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/33/c9/52/3c/caption.jpg?w=2400&h=-1&' },
          { url: 'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/34/15/ff/ac/executive-room-with-balcony.jpg?w=400&h=400&' },
          { url: 'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/34/2b/94/5c/facade.jpg?w=400&h=400&' },
          { url: 'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/06/53/f7/78/le-belmont-hotel.jpg?w=400&h=400&' },
          { url: 'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/07/9c/cf/e6/ratn.jpg?w=400&h=400&' },
          { url: 'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/04/c2/9a/88/le-maxan.jpg?w=400&h=400&' },
          { url: 'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/2e/ea/40/79/l-orangerie.jpg?w=400&h=400&' },
          { url: 'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/07/92/e0/a8/le-confidentiel.jpg?w=400&h=400&' },
          { url: 'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/2c/a0/15/7a/caption.jpg?w=400&h=400&' },
          { url: 'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/0e/6f/20/d6/photo1jpg.jpg?w=400&h=400&' },
        ],
        rating: 5,
        reviewCount: 1,
      },
      '33063008',
    )
    expect(info.name).toBe('Parallel Coffee')
    expect(info.photos.join(' ')).not.toContain('executive-room-with-balcony')
    expect(info.photos.join(' ')).not.toContain('le-belmont-hotel')
    expect(info.photos.join(' ')).not.toContain('30/0f/25/01')
    expect(info.photos).toEqual([])
  })

  it('keeps the listing album when nearby thumbs come before the photos', () => {
    const cover =
      'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/10/4b/8b/6d/les-collections-permanentes.jpg?w=1200&h=-1&s=1'
    const nearbyTiny =
      'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/23/15/f2/f9/mayfair-garden.jpg?w=200&h=-1&'
    const nearbyLarge =
      'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/27/3c/f9/a3/galerie-dior.jpg?w=1200&h=1200&'
    const albumOne =
      'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/34/2e/06/97/caption.jpg?w=1100&h=1100&'
    const albumTwo =
      'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/34/2e/06/96/caption.jpg?w=1100&h=1100&'
    const albumThree =
      'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/34/2e/06/92/caption.jpg?w=1100&h=1100&'
    const courtyard =
      'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/0f/ec/32/31/vue-de-la-cour-d-honneur.jpg?w=1200&h=1200&'
    const editorial =
      'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/30/0f/25/01/caption.jpg?w=2400&h=-1&'

    const info = normalizeTripadvisorAttractionDetails(
      {
        success: true,
        id: '188486',
        name: "Musee d'Art Moderne de Paris",
        category: 'ATTRACTION',
        image: cover,
        images: [
          { url: nearbyTiny },
          { url: nearbyLarge },
          { url: nearbyTiny },
          { url: albumOne },
          { url: albumTwo },
          { url: albumThree },
          { url: nearbyTiny },
          { url: courtyard },
          { url: editorial },
          { url: cover },
        ],
      },
      '188486',
    )
    const photos = info.photos.join(' ')
    expect(photos).toContain('les-collections-permanentes')
    expect(photos).toContain('34/2e/06/97')
    expect(photos).toContain('34/2e/06/96')
    expect(photos).toContain('34/2e/06/92')
    expect(photos).not.toContain('mayfair-garden')
    expect(photos).not.toContain('galerie-dior')
    expect(photos).not.toContain('30/0f/25/01')
  })

  it('drops Must-see highlights and Historical Tours photos from attraction details', () => {
    const arcHero =
      'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/0e/53/47/52/arc-de-triomphe.jpg?w=1200&h=900&s=1'
    const arcSunset =
      'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/arc-sunset.jpg?w=1600&h=1200&s=1'
    const rooftop =
      'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/highlight-rooftop.jpg?w=1600&h=1200&s=1'
    const flame =
      'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/highlight-flame.jpg?w=1600&h=1200&s=1'
    const tomb =
      'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/highlight-tomb.jpg?w=1600&h=1200&s=1'
    const pontTour =
      'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/tour-pont-alexandre.jpg?w=1600&h=1200&s=1'
    const bikeTour =
      'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/tour-invalides-bikes.jpg?w=1600&h=1200&s=1'
    const skipTicket =
      'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/ticket-pantheon.jpg?w=1600&h=1200&s=1'

    const details = normalizeTripadvisorAttractionDetails(
      {
        success: true,
        id: '188709',
        name: 'Arc de Triomphe',
        category: 'ATTRACTION',
        image: arcHero,
        images: [
          { url: arcHero },
          { url: arcSunset },
          { url: rooftop },
          { url: flame },
          { url: tomb },
          { url: pontTour },
          { url: bikeTour },
          { url: skipTicket },
        ],
        mustSeeHighlights: [
          {
            title: 'Rooftop terrace',
            description: 'For 360-degree views of Paris, climb the spiral staircases.',
            image: rooftop,
          },
          {
            title: 'Flame of Remembrance',
            description: 'First lit in 1923, this eternal flame is rekindled every night.',
            image: flame,
          },
          {
            title: 'Tomb of the Unknown Soldier',
            description: 'This memorial at the base of the Arc honors French WWI soldiers.',
            image: tomb,
          },
        ],
        historicalTours: [
          {
            title: '1. Arc de Triomphe and Champs-Élysées Walking Tour',
            duration: '1h 15m',
            price: 'from C$82',
            image: pontTour,
          },
          {
            title: '2. Must-See Sites Tour',
            duration: '2h 30m',
            image: bikeTour,
          },
        ],
        skipTheLineTickets: [{ title: 'Paris Museum Pass', image: skipTicket }],
      },
      '188709',
    )
    const photos = details.photos.join(' ')
    expect(photos).toContain('arc-de-triomphe.jpg')
    expect(photos).toContain('arc-sunset')
    expect(photos).not.toContain('highlight-rooftop')
    expect(photos).not.toContain('highlight-flame')
    expect(photos).not.toContain('highlight-tomb')
    expect(photos).not.toContain('tour-pont-alexandre')
    expect(photos).not.toContain('tour-invalides-bikes')
    expect(photos).not.toContain('ticket-pantheon')

    const captioned = normalizeTripadvisorGallery(
      {
        success: true,
        data: {
          id: '188709',
          name: 'Arc de Triomphe',
          category: 'ATTRACTION',
          image: arcHero,
          images: [
            { url: arcHero },
            { url: arcSunset },
            { url: pontTour, section: 'Historical Tours', title: 'Walking Tour' },
            { url: rooftop, section: 'Must-see highlights', title: 'Rooftop terrace' },
          ],
        },
      },
      'attraction',
      '188709',
      'Arc de Triomphe',
    )
    expect(captioned.photos.join(' ')).toContain('arc-de-triomphe.jpg')
    expect(captioned.photos.join(' ')).toContain('arc-sunset')
    expect(captioned.photos.join(' ')).not.toContain('tour-pont-alexandre')
    expect(captioned.photos.join(' ')).not.toContain('highlight-rooftop')
  })

  it('drops More tickets / Audio Guides / Segway Tours photos from attraction details', () => {
    const palaisHero =
      'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/grand-palais-hero.jpg?w=1600&h=1200&s=1'
    const palaisHall =
      'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/grand-palais-hall.jpg?w=1600&h=1200&s=1'
    const audioBoat =
      'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/audio-guide-notre-dame-boat.jpg?w=1600&h=1200&s=1'
    const audioSunset =
      'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/audio-guide-seine-sunset.jpg?w=1600&h=1200&s=1'
    const segwayArc =
      'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/segway-arc.jpg?w=1600&h=1200&s=1'
    const tourBus =
      'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/hop-on-bus.jpg?w=1600&h=1200&s=1'

    const details = normalizeTripadvisorAttractionDetails(
      {
        success: true,
        id: '590230',
        name: 'Grand Palais',
        category: 'ATTRACTION',
        image: palaisHero,
        images: [
          { url: palaisHero },
          { url: palaisHall },
          { url: audioBoat },
          { url: audioSunset },
          { url: segwayArc },
          { url: tourBus },
        ],
        audioGuides: [
          {
            title: '1. Seine River Evening Cruise with Music and Comments',
            category: 'Sightseeing Cruises',
            duration: '1h',
            price: 'from C$41',
            image: audioBoat,
          },
          {
            title: '2. Seine River Guided Cruise with Audio Guide',
            duration: '60-80 minutes',
            price: 'from C$41',
            image: audioSunset,
          },
        ],
        segwayTours: [
          {
            title: '1. Paris: Experience Segway Top Highlights Small Group 2 Hours',
            duration: '2h',
            price: 'from C$113',
            image: segwayArc,
          },
        ],
        moreTicketsToursAndExperiences: {
          title: 'More tickets, tours, and experiences',
          cards: [
            {
              title: 'Hop-on Hop-off Bus',
              duration: '1 day',
              price: 'from C$55',
              image: tourBus,
            },
          ],
        },
      },
      '590230',
    )
    const photos = details.photos.join(' ')
    expect(photos).toContain('grand-palais-hero')
    expect(photos).toContain('grand-palais-hall')
    expect(photos).not.toContain('audio-guide-notre-dame-boat')
    expect(photos).not.toContain('audio-guide-seine-sunset')
    expect(photos).not.toContain('segway-arc')
    expect(photos).not.toContain('hop-on-bus')

    const titled = normalizeTripadvisorGallery(
      {
        success: true,
        data: {
          id: '590230',
          name: 'Grand Palais',
          category: 'ATTRACTION',
          image: palaisHero,
          images: [
            { url: palaisHero },
            { url: audioBoat, section: 'Audio Guides', title: 'Seine River Evening Cruise' },
            { url: segwayArc, section: 'Segway Tours', title: 'Paris Segway Express Tour' },
          ],
          sections: [
            {
              title: 'More tickets, tours, and experiences',
              items: [{ image: tourBus, price: 'from C$55', duration: '1 day' }],
            },
          ],
        },
      },
      'attraction',
      '590230',
      'Grand Palais',
    )
    expect(titled.photos.join(' ')).toContain('grand-palais-hero')
    expect(titled.photos.join(' ')).not.toContain('audio-guide-notre-dame-boat')
    expect(titled.photos.join(' ')).not.toContain('segway-arc')
    expect(titled.photos.join(' ')).not.toContain('hop-on-bus')
  })

  it('keeps Sphere and Sogno details galleries on separate contentIds', async () => {
    authFetch.mockReset()
    resetTripadvisorRequestBudgetForTests()
    resetLlmArtifactStoreForTests()
    resetTripadvisorPlacePhotosForTests()
    authFetch.mockImplementation(async (input) => {
      const href = String(input)
      if (href.includes(encodeURIComponent(SPHERE_LISTING_URL))) {
        return tripadvisor34DetailResponse({
          id: '25158864',
          name: 'Sphere',
          photos: [
            'https://media-cdn.tripadvisor.com/sphere-salle.jpg',
            'https://media-cdn.tripadvisor.com/sphere-dish.jpg',
          ],
        })
      }
      if (href.includes(encodeURIComponent(SOGNO_LISTING_URL))) {
        return tripadvisor34DetailResponse({
          id: '24052281',
          name: 'Sogno Paris',
          photos: [
            'https://media-cdn.tripadvisor.com/sogno-pasta.jpg',
            'https://media-cdn.tripadvisor.com/sogno-pizza.jpg',
          ],
        })
      }
      throw new Error(`unexpected Tripadvisor request ${href}`)
    })

    const sphere = await fetchTripadvisorPlaceGallery({
      name: '斯菲尔',
      nameLocal: 'Sphère',
      type: 'restaurant',
    })
    const sogno = await fetchTripadvisorPlaceGallery({
      name: 'Sogno',
      type: 'restaurant',
    })
    expect(sphere?.contentId).toBe('25158864')
    expect(sogno?.contentId).toBe('24052281')
    expect(sphere?.photos.join(' ')).toContain('sphere-salle')
    expect(sphere?.photos.join(' ')).not.toContain('sogno-pasta')
    expect(sogno?.photos.join(' ')).toContain('sogno-pasta')
    expect(sogno?.photos.join(' ')).not.toContain('sphere-salle')
    expect(peekTripadvisorRestaurantInfo('斯菲尔', 'Sphère')?.photos.join(' ')).not.toContain(
      'sogno-pasta',
    )
    expect(peekTripadvisorRestaurantInfo('Sogno')?.photos.join(' ')).not.toContain('sphere-salle')
  })

  it('loads seeded Sogno Paris from restaurant details without autocomplete', async () => {
    authFetch.mockReset()
    resetTripadvisorRequestBudgetForTests()
    resetLlmArtifactStoreForTests()
    resetTripadvisorPlacePhotosForTests()
    authFetch.mockResolvedValueOnce(
      restaurantMediaGalleryResponse(
        'https://media-cdn.tripadvisor.com/sogno-1.jpg',
        'https://media-cdn.tripadvisor.com/sogno-2.jpg',
        'https://media-cdn.tripadvisor.com/sogno-3.jpg',
      ),
    )

    const gallery = await fetchTripadvisorPlaceGallery({
      name: 'Sogno',
      type: 'restaurant',
      address: "42 Rue de l'Amiral Hamelin, 75016 Paris",
    })
    expect(gallery?.contentId).toBe('24052281')
    expect(gallery?.photos).toEqual([
      'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/24/67/76/e3/penne-all-arrabbiata.jpg?w=1200&h=900&s=1',
      'https://media-cdn.tripadvisor.com/sogno-1.jpg',
      'https://media-cdn.tripadvisor.com/sogno-2.jpg',
      'https://media-cdn.tripadvisor.com/sogno-3.jpg',
    ])
    expect(authFetch).toHaveBeenCalledTimes(1)
    expectRestaurantDetailsQuery(String(authFetch.mock.calls[0]?.[0] || ''), SOGNO_LISTING_URL)
    expect(resolveTripadvisorRestaurantListing).not.toHaveBeenCalled()
  })

  it('persists a provider-confirmed missing details result', async () => {
    authFetch.mockReset()
    resetTripadvisorRequestBudgetForTests()
    resetLlmArtifactStoreForTests()
    resetTripadvisorPlacePhotosForTests()
    authFetch
      .mockResolvedValueOnce(tripadvisorMissingResponse())
      .mockResolvedValueOnce(
        restaurantMediaGalleryResponse(
          'https://media-cdn.tripadvisor.com/sogno-1.jpg',
          'https://media-cdn.tripadvisor.com/sogno-2.jpg',
        ),
      )

    const first = await fetchTripadvisorPlaceGallery({
      name: 'Sogno',
      type: 'restaurant',
    })
    expect(first?.photos).toEqual([
      'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/24/67/76/e3/penne-all-arrabbiata.jpg?w=1200&h=900&s=1',
    ])
    expect(String(authFetch.mock.calls[0]?.[0] || '')).toContain(
      'rest=api%2Fv1%2Frestaurants%2Fdetail',
    )
    expect(authFetch).toHaveBeenCalledTimes(1)

    resetTripadvisorPlacePhotosForTests()
    authFetch.mockClear()
    const second = await fetchTripadvisorPlaceGallery({
      name: 'Sogno',
      type: 'restaurant',
    })
    expect(second?.photos).toEqual([
      'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/24/67/76/e3/penne-all-arrabbiata.jpg?w=1200&h=900&s=1',
    ])
    expect(authFetch).not.toHaveBeenCalled()
  })

  it('loads restaurant address, website, reviews and photos from Tripadvisor', async () => {
    authFetch.mockReset()
    resetTripadvisorRequestBudgetForTests()
    resetLlmArtifactStoreForTests()
    resetTripadvisorPlacePhotosForTests()
    authFetch.mockResolvedValueOnce(
      tripadvisor34DetailResponse({
        id: '24052281',
        name: 'Sogno Paris',
        photos: ['https://media-cdn.tripadvisor.com/sogno-1.jpg'],
        address: "42 Rue de l'Amiral Hamelin, 75016 Paris",
        website: 'https://www.sognoparis.com/',
        phone: '+33 1 47 04 00 00',
        rating: 4.5,
        reviewCount: 77,
        priceLevel: '$$',
        cuisine: 'Italian',
        reviews: [
          {
            text: 'Penne all arrabbiata was spicy and the room felt like a neighborhood trattoria.',
            rating: 5,
            author: { name: 'Luca' },
            publishedDate: '2026-06-18',
          },
        ],
      }),
    )

    const info = await fetchTripadvisorRestaurantInfo({ name: 'Sogno' })
    expect(info?.contentId).toBe('24052281')
    expect(info?.address).toBe("42 Rue de l'Amiral Hamelin, 75016 Paris")
    expect(info?.website).toBe('https://www.sognoparis.com/')
    expect(info?.phone).toBe('+33 1 47 04 00 00')
    expect(info?.rating).toBe(4.5)
    expect(info?.reviews).toEqual([
      {
        text: 'Penne all arrabbiata was spicy and the room felt like a neighborhood trattoria.',
        rating: 5,
        author: 'Luca',
        relativeTime: '2026-06-18',
      },
    ])
    expect(info?.photos).toContain('https://media-cdn.tripadvisor.com/sogno-1.jpg')
    expect(info?.priceLevel).toBe('$$')
    expect(info?.cuisine).toBe('Italian')
    const urls = authFetch.mock.calls.map((call) => String(call[0] || ''))
    expect(urls).toHaveLength(1)
    expectRestaurantDetailsQuery(urls[0], SOGNO_LISTING_URL)
    expect(urls[0]).not.toContain('restaurants%2Freviews')
  })

  it('uses a Tripadvisor listing URL when autocomplete only returns hotels', async () => {
    authFetch.mockReset()
    resetTripadvisorRequestBudgetForTests()
    resetLlmArtifactStoreForTests()
    resetTripadvisorPlacePhotosForTests()
    resolveTripadvisorRestaurantListing.mockResolvedValueOnce({
      url: 'https://www.tripadvisor.com/Restaurant_Review-g187147-d712345-Reviews-Le_Baratin-Paris_Ile_de_France.html',
      name: 'Le Baratin',
    })
    authFetch
      .mockResolvedValueOnce(
        tripadvisor34AutocompleteResponse([
          {
            locationId: 1809050,
            name: 'La Conca del Sogno',
            type: 'hotel',
            description: 'Nerano, Campania, Italy',
          },
        ]),
      )
      .mockResolvedValueOnce(
        tripadvisor34DetailResponse({
          id: '712345',
          name: 'Le Baratin',
          photos: ['https://media-cdn.tripadvisor.com/baratin.jpg'],
          rating: 4.4,
          reviewCount: 800,
        }),
      )

    const gallery = await fetchTripadvisorPlaceGallery({
      name: 'Le Baratin',
      type: 'restaurant',
      address: '3 Rue Jouye-Rouve, 75020 Paris',
    })
    expect(gallery?.photos).toEqual(['https://media-cdn.tripadvisor.com/baratin.jpg'])
    expect(resolveTripadvisorRestaurantListing).toHaveBeenCalledWith({
      name: 'Le Baratin',
      nameLocal: undefined,
      address: '3 Rue Jouye-Rouve, 75020 Paris',
      city: 'Paris',
    })
    expect(authFetch).toHaveBeenCalledTimes(2)
    expect(String(authFetch.mock.calls[0]?.[0] || '')).toContain(
      'rest=api%2Fv1%2Fautocomplete',
    )
    expect(String(authFetch.mock.calls[1]?.[0] || '')).toContain(
      'rest=api%2Fv1%2Frestaurants%2Fdetail',
    )
    expectRestaurantDetailsQuery(
      String(authFetch.mock.calls[1]?.[0] || ''),
      'https://www.tripadvisor.com/Restaurant_Review-g187147-d712345-Reviews-Le_Baratin-Paris_Ile_de_France.html',
    )
  })

  it('ignores a Tripadvisor contentId that is not in a Restaurant_Review URL', async () => {
    authFetch.mockReset()
    resetTripadvisorRequestBudgetForTests()
    resetLlmArtifactStoreForTests()
    resetTripadvisorPlacePhotosForTests()
    resolveTripadvisorRestaurantListing.mockResolvedValueOnce({
      contentId: '715944',
      name: "Brasserie L'Alsace",
    })
    authFetch.mockResolvedValueOnce(tripadvisor34AutocompleteResponse([]))

    const gallery = await fetchTripadvisorPlaceGallery({
      name: 'Maison Invented Bistro',
      type: 'restaurant',
    })
    expect(gallery).toBeNull()
    expect(authFetch).toHaveBeenCalledTimes(1)
    expect(authFetch.mock.calls.some((call) => String(call[0] || '').includes('detail'))).toBe(
      false,
    )
  })

  it('does not keep a listing URL whose Tripadvisor details page is gone', async () => {
    authFetch.mockReset()
    resetTripadvisorRequestBudgetForTests()
    resetLlmArtifactStoreForTests()
    resetTripadvisorPlacePhotosForTests()
    resolveTripadvisorRestaurantListing.mockResolvedValueOnce({
      url: 'https://www.tripadvisor.com/Restaurant_Review-g187147-d715944-Reviews-Gone-Paris.html',
      name: 'Maison Vanished Bistro',
    })
    authFetch
      .mockResolvedValueOnce(tripadvisor34AutocompleteResponse([]))
      .mockResolvedValueOnce(tripadvisorMissingResponse())

    const gallery = await fetchTripadvisorPlaceGallery({
      name: 'Maison Vanished Bistro',
      type: 'restaurant',
    })
    expect(gallery).toBeNull()
    expect(String(authFetch.mock.calls[1]?.[0] || '')).toContain(
      'rest=api%2Fv1%2Frestaurants%2Fdetail',
    )
    expectRestaurantDetailsQuery(
      String(authFetch.mock.calls[1]?.[0] || ''),
      'https://www.tripadvisor.com/Restaurant_Review-g187147-d715944-Reviews-Gone-Paris.html',
    )
    expect(authFetch.mock.calls.some((call) => String(call[0] || '').includes('media-gallery'))).toBe(
      false,
    )
  })

  it('loads a seeded attraction from things-to-do details, not a city search', async () => {
    authFetch.mockReset()
    resetTripadvisorRequestBudgetForTests()
    resetLlmArtifactStoreForTests()
    resetTripadvisorPlacePhotosForTests()
    authFetch.mockResolvedValueOnce(
      tripadvisor34DetailResponse({
        id: '188709',
        name: 'Arc de Triomphe',
        category: 'ATTRACTION',
        photos: ['https://media-cdn.tripadvisor.com/arc.jpg'],
        reviews: [
          {
            text: 'Climb at sunset if you can; the view over the avenues is worth every step.',
            rating: 5,
            author: { name: 'Mia' },
            publishedDate: '2026-05-02',
          },
        ],
      }),
    )

    const info = await fetchTripadvisorAttractionInfo({ name: '凯旋门', nameLocal: 'Arc de Triomphe' })
    expect(info?.contentId).toBe('188709')
    expect(info?.photos[0]).toContain('arc-de-triomphe.jpg')
    expect(info?.photos).toContain('https://media-cdn.tripadvisor.com/arc.jpg')
    expect(info?.reviews[0]).toMatchObject({
      text: 'Climb at sunset if you can; the view over the avenues is worth every step.',
      rating: 5,
      author: 'Mia',
    })
    expect(authFetch).toHaveBeenCalledTimes(1)
    const url = String(authFetch.mock.calls[0]?.[0] || '')
    expectAttractionLocationIdQuery(url, '188709')
    expect(url).not.toContain('startDate')
    expect(url).not.toContain('attractions%2Fdetails')
    expect(url).not.toContain('restaurants')
    expect(url).not.toContain('autocomplete')
  })

  it('loads attraction reviews when things-to-do details omit them', async () => {
    authFetch.mockReset()
    resetTripadvisorRequestBudgetForTests()
    resetLlmArtifactStoreForTests()
    resetTripadvisorPlacePhotosForTests()
    authFetch
      .mockResolvedValueOnce(
        tripadvisor34DetailResponse({
          id: '188709',
          name: 'Arc de Triomphe',
          category: 'ATTRACTION',
          photos: ['https://media-cdn.tripadvisor.com/arc.jpg'],
          rating: 4.5,
          reviewCount: 46505,
        }),
      )
      .mockResolvedValueOnce(
        tripadvisor34ReviewsResponse([
          {
            text: 'The rooftop terrace is the reason to climb, even with the stairs.',
            rating: 5,
            author: { name: 'Mia' },
            publishedDate: '2026-05-02',
          },
        ]),
      )

    const info = await fetchTripadvisorAttractionInfo({ name: '凯旋门', nameLocal: 'Arc de Triomphe' })
    expect(info?.contentId).toBe('188709')
    expect(info?.reviews[0]).toMatchObject({
      text: 'The rooftop terrace is the reason to climb, even with the stairs.',
      rating: 5,
      author: 'Mia',
    })
    expect(authFetch).toHaveBeenCalledTimes(2)
    expectAttractionLocationIdQuery(String(authFetch.mock.calls[0]?.[0] || ''), '188709')
    expectRestaurantReviewsQuery(String(authFetch.mock.calls[1]?.[0] || ''), '188709')
    expect(String(authFetch.mock.calls[0]?.[0] || '')).not.toContain('restaurants')
  })

  it('still fetches attraction reviews when the gallery cache has no review text', async () => {
    authFetch.mockReset()
    resetTripadvisorRequestBudgetForTests()
    resetLlmArtifactStoreForTests()
    resetTripadvisorPlacePhotosForTests()
    authFetch.mockResolvedValueOnce(
      tripadvisor34DetailResponse({
        id: '188709',
        name: 'Arc de Triomphe',
        category: 'ATTRACTION',
        photos: ['https://media-cdn.tripadvisor.com/arc.jpg'],
        rating: 4.5,
        reviewCount: 46505,
      }),
    )

    await fetchTripadvisorPlaceGallery({
      name: '凯旋门',
      nameLocal: 'Arc de Triomphe',
      type: 'attraction',
    })
    authFetch.mockReset()
    authFetch.mockResolvedValueOnce(
      tripadvisor34ReviewsResponse([
        {
          text: 'Climb at sunset if you can; the view over the avenues is worth every step.',
          rating: 5,
          author: { name: 'Mia' },
          publishedDate: '2026-05-02',
        },
      ]),
    )

    const info = await fetchTripadvisorAttractionInfo({ name: '凯旋门', nameLocal: 'Arc de Triomphe' })
    expect(info?.reviews[0]).toMatchObject({
      text: 'Climb at sunset if you can; the view over the avenues is worth every step.',
      rating: 5,
      author: 'Mia',
    })
    expect(authFetch).toHaveBeenCalledTimes(1)
    expectRestaurantReviewsQuery(String(authFetch.mock.calls[0]?.[0] || ''), '188709')
  })

  it('loads Palais de Tokyo reviews from the restaurant reviews endpoint', async () => {
    authFetch.mockReset()
    resetTripadvisorRequestBudgetForTests()
    resetLlmArtifactStoreForTests()
    resetTripadvisorPlacePhotosForTests()
    const listingUrl = attractionListingUrl(246664, 'Palais de Tokyo')
    authFetch
      .mockResolvedValueOnce(
        tripadvisor34DetailResponse({
          id: '246664',
          name: 'Palais de Tokyo',
          category: 'ATTRACTION',
          photos: ['https://media-cdn.tripadvisor.com/tokyo.jpg'],
          rating: 3.9,
          reviewCount: 649,
        }),
      )
      .mockResolvedValueOnce(
        tripadvisor34RestaurantReviewsResponse([
          {
            text: 'We went to a very good special art exhibit here. The expo space is big and well-organized.',
            rating: 4,
            userDisplayName: 'Thomas V',
            publishedDate: '2026-02-23',
          },
        ]),
      )

    const info = await fetchTripadvisorAttractionInfo({
      name: '东京宫',
      nameLocal: 'Palais de Tokyo',
    })
    expect(info?.contentId).toBe('246664')
    expect(info?.reviews[0]).toMatchObject({
      text: 'We went to a very good special art exhibit here. The expo space is big and well-organized.',
      rating: 4,
      author: 'Thomas V',
    })
    expect(authFetch).toHaveBeenCalledTimes(2)
    expectAttractionDetailsQuery(String(authFetch.mock.calls[0]?.[0] || ''), listingUrl)
    expectRestaurantReviewsQuery(String(authFetch.mock.calls[1]?.[0] || ''), '246664', listingUrl)
  })

  it('falls back to restaurant details when attraction review lists are empty', async () => {
    authFetch.mockReset()
    resetTripadvisorRequestBudgetForTests()
    resetLlmArtifactStoreForTests()
    resetTripadvisorPlacePhotosForTests()
    const listingUrl = attractionListingUrl(246664, 'Palais de Tokyo')
    authFetch
      .mockResolvedValueOnce(
        tripadvisor34DetailResponse({
          id: '246664',
          name: 'Palais de Tokyo',
          category: 'ATTRACTION',
          photos: ['https://media-cdn.tripadvisor.com/tokyo.jpg'],
          rating: 3.9,
          reviewCount: 649,
        }),
      )
      .mockResolvedValueOnce(tripadvisor34RestaurantReviewsResponse([]))
      .mockResolvedValueOnce(
        tripadvisor34DetailResponse({
          id: '246664',
          name: 'Palais de Tokyo',
          reviews: [
            {
              text: 'We went to a very good special art exhibit here. The expo space is big and well-organized.',
              rating: 4,
              author: { name: 'Thomas V' },
              publishedDate: '2026-02-23',
            },
          ],
        }),
      )

    const info = await fetchTripadvisorAttractionInfo({
      name: '东京宫',
      nameLocal: 'Palais de Tokyo',
    })
    expect(info?.reviews[0]).toMatchObject({
      text: 'We went to a very good special art exhibit here. The expo space is big and well-organized.',
      rating: 4,
      author: 'Thomas V',
    })
    expect(authFetch).toHaveBeenCalledTimes(3)
    expectAttractionDetailsQuery(String(authFetch.mock.calls[0]?.[0] || ''), listingUrl)
    expectRestaurantReviewsQuery(String(authFetch.mock.calls[1]?.[0] || ''), '246664', listingUrl)
    expectRestaurantDetailsQuery(String(authFetch.mock.calls[2]?.[0] || ''), listingUrl)
  })

  it('loads Champs-Élysées from the seeded Tripadvisor id without autocomplete', async () => {
    authFetch.mockReset()
    resetTripadvisorRequestBudgetForTests()
    resetLlmArtifactStoreForTests()
    resetTripadvisorPlacePhotosForTests()
    authFetch.mockResolvedValueOnce(
      tripadvisor34DetailResponse({
        id: '209760',
        name: 'Champs-Elysees',
        category: 'ATTRACTION',
        photos: ['https://media-cdn.tripadvisor.com/champs.jpg'],
        reviews: [
          {
            text: 'Busy and touristy, but still the classic Paris walk from Concorde to the Arc.',
            rating: 4,
            author: { name: 'Jon' },
            publishedDate: '2026-04-11',
          },
        ],
      }),
    )

    const info = await fetchTripadvisorAttractionInfo({
      name: '香榭丽舍大街（中段）',
      nameLocal: 'Avenue des Champs-Élysées',
    })
    expect(info?.contentId).toBe('209760')
    expect(info?.photos[0]).toContain('champs-elysees-from-the.jpg')
    expect(info?.photos).toContain('https://media-cdn.tripadvisor.com/champs.jpg')
    expect(authFetch).toHaveBeenCalledTimes(1)
    const url = String(authFetch.mock.calls[0]?.[0] || '')
    expectAttractionLocationIdQuery(url, '209760')
    expect(url).not.toContain('autocomplete')
  })

  it('looks up an unseeded attraction by a cleaned name, then loads the gallery', async () => {
    authFetch.mockReset()
    resetTripadvisorRequestBudgetForTests()
    resetLlmArtifactStoreForTests()
    resetTripadvisorPlacePhotosForTests()
    authFetch
      .mockResolvedValueOnce(
        tripadvisor34AutocompleteResponse([
          {
            locationId: 188678,
            name: 'Pont Neuf',
            type: 'attraction',
          },
          {
            locationId: 999002,
            name: 'Pont Neuf Hotel',
            type: 'hotel',
          },
        ]),
      )
      .mockResolvedValueOnce(
        tripadvisor34DetailResponse({
          id: '188678',
          name: 'Pont Neuf',
          category: 'ATTRACTION',
          photos: ['https://media-cdn.tripadvisor.com/pont.jpg'],
        }),
      )

    const gallery = await fetchTripadvisorPlaceGallery({
      name: '新桥（西端）',
      nameLocal: 'Pont Neuf',
      type: 'attraction',
    })
    expect(gallery?.contentId).toBe('188678')
    expect(gallery?.photos).toEqual(['https://media-cdn.tripadvisor.com/pont.jpg'])
    expect(authFetch).toHaveBeenCalledTimes(2)
    const autocompleteUrl = String(authFetch.mock.calls[0]?.[0] || '')
    expect(autocompleteUrl).toContain('rest=api%2Fv1%2Fautocomplete')
    expect(autocompleteUrl).toContain('location=Pont+Neuf+Paris')
    expectAttractionDetailsQuery(
      String(authFetch.mock.calls[1]?.[0] || ''),
      attractionListingUrl(188678, 'Pont Neuf'),
    )
  })
})

  it('does not attach an unrelated autocomplete hit just because it was first', async () => {
    authFetch.mockReset()
    resetTripadvisorRequestBudgetForTests()
    resetLlmArtifactStoreForTests()
    resetTripadvisorPlacePhotosForTests()
    authFetch.mockResolvedValueOnce(
      tripadvisor34AutocompleteResponse([
        {
          locationId: 188151,
          name: 'Eiffel Tower',
          type: 'attraction',
        },
      ]),
    )

    const gallery = await fetchTripadvisorPlaceGallery({
      name: 'Canal Saint-Martin',
      type: 'attraction',
    })
    expect(gallery).toBeNull()
    expect(authFetch).toHaveBeenCalledTimes(1)
    expect(resolveAttractionCanonicalName).toHaveBeenCalled()
  })

  it('uses the LLM name to hit a seeded attraction without another Tripadvisor search', async () => {
    authFetch.mockReset()
    resetTripadvisorRequestBudgetForTests()
    resetLlmArtifactStoreForTests()
    resetTripadvisorPlacePhotosForTests()
    resolveAttractionCanonicalName.mockResolvedValue({
      nameEn: 'Eiffel Tower',
      nameFr: 'Tour Eiffel',
      aliases: ['Tour Eiffel'],
    })
    authFetch.mockResolvedValueOnce(
      tripadvisor34DetailResponse({
        id: '188151',
        name: 'Eiffel Tower',
        category: 'ATTRACTION',
        photos: ['https://media-cdn.tripadvisor.com/eiffel.jpg'],
      }),
    )

    const gallery = await fetchTripadvisorPlaceGallery({
      name: '那个铁塔',
      type: 'attraction',
    })
    expect(gallery?.contentId).toBe('188151')
    expect(gallery?.photos).toEqual(['https://media-cdn.tripadvisor.com/eiffel.jpg'])
    expect(resolveAttractionCanonicalName).toHaveBeenCalledWith({
      name: '那个铁塔',
      nameLocal: undefined,
    })
    expect(authFetch).toHaveBeenCalledTimes(1)
    const url = String(authFetch.mock.calls[0]?.[0] || '')
    expectAttractionLocationIdQuery(url, '188151')
    expect(url).not.toContain('autocomplete')
  })

  it('retries Tripadvisor autocomplete with the LLM English name', async () => {
    authFetch.mockReset()
    resetTripadvisorRequestBudgetForTests()
    resetLlmArtifactStoreForTests()
    resetTripadvisorPlacePhotosForTests()
    resolveAttractionCanonicalName.mockResolvedValue({
      nameEn: 'Pont Neuf',
      nameFr: 'Pont Neuf',
      aliases: [],
    })
    authFetch
      .mockResolvedValueOnce(
        tripadvisor34AutocompleteResponse([
          {
            locationId: 188678,
            name: 'Pont Neuf',
            type: 'attraction',
          },
        ]),
      )
      .mockResolvedValueOnce(
        tripadvisor34DetailResponse({
          id: '188678',
          name: 'Pont Neuf',
          category: 'ATTRACTION',
          photos: ['https://media-cdn.tripadvisor.com/pont.jpg'],
        }),
      )

    const gallery = await fetchTripadvisorPlaceGallery({
      name: '新桥',
      type: 'attraction',
    })
    expect(gallery?.contentId).toBe('188678')
    expect(gallery?.photos).toEqual(['https://media-cdn.tripadvisor.com/pont.jpg'])
    expect(authFetch).toHaveBeenCalledTimes(2)
    const autocompleteUrl = String(authFetch.mock.calls[0]?.[0] || '')
    expect(autocompleteUrl).toContain('rest=api%2Fv1%2Fautocomplete')
    expect(autocompleteUrl).toContain('location=Pont+Neuf+Paris')
    expectAttractionDetailsQuery(
      String(authFetch.mock.calls[1]?.[0] || ''),
      attractionListingUrl(188678, 'Pont Neuf'),
    )
})
