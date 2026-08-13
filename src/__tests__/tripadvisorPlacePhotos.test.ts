import { beforeEach, describe, expect, it, vi } from 'vitest'

const { authFetch, resolveAttractionCanonicalName } = vi.hoisted(() => ({
  authFetch: vi.fn(),
  resolveAttractionCanonicalName: vi.fn(async () => null),
}))

vi.mock('../features/auth/services/authFetch', () => ({ authFetch }))
vi.mock('../shared/services/llm/llm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../shared/services/llm/llm')>()
  return {
    ...actual,
    resolveAttractionCanonicalName,
  }
})

import {
  fetchTripadvisorAttractionInfo,
  fetchTripadvisorPlaceGallery,
  listSeededTripadvisorAttractions,
  matchTripadvisorCatalogItem,
  normalizeTripadvisorAttractionDetails,
  normalizeTripadvisorAutocomplete,
  normalizeTripadvisorCatalog,
  normalizeTripadvisorGallery,
  pickTripadvisorPhotoUrl,
  resetTripadvisorPlacePhotosForTests,
  selectBestTripadvisorGalleryPhotos,
  tripadvisorAutocompleteQuery,
  tripadvisorContentIdFromCandidate,
  tripadvisorPhotoUrl,
} from '../features/place/services/tripadvisorPlacePhotos'
import { resetTripadvisorRequestBudgetForTests } from '../features/place/services/tripadvisorRequestBudget'
import { resetLlmArtifactStoreForTests } from '../shared/services/llm/llmArtifactStore'
import { placeSearchQuery } from '../shared/utils/placeTitle'

describe('Tripadvisor place photos', () => {
  beforeEach(() => {
    resolveAttractionCanonicalName.mockReset()
    resolveAttractionCanonicalName.mockResolvedValue(null)
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

  it('keeps the 15 sharpest still photos and drops tiny or video items', () => {
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

  it('keeps Paris in restaurant autocomplete queries', () => {
    expect(tripadvisorAutocompleteQuery('Sogno', undefined, 'restaurant')).toBe(
      'Sogno Paris',
    )
    expect(tripadvisorAutocompleteQuery('Sogno Paris', undefined, 'restaurant')).toBe(
      'Sogno Paris',
    )
    expect(
      tripadvisorAutocompleteQuery('索尼奥', 'Sogno Paris', 'restaurant'),
    ).toBe('Sogno Paris')
  })

  it('reads an attraction contentId from auto-complete suggestions', () => {
    const items = normalizeTripadvisorAutocomplete({
      data: [
        {
          localizedName: 'Eiffel Tower',
          type: 'ATTRACTION',
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
      { contentId: '188151', name: 'Eiffel Tower', kind: 'attraction' },
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
    expect(tripadvisorContentIdFromCandidate('ChIJ-google')).toBeUndefined()
  })

  it('calls Tripadvisor autocomplete once for an unmatched cafe and skips the gallery', async () => {
    authFetch.mockReset()
    resetTripadvisorRequestBudgetForTests()
    resetLlmArtifactStoreForTests()
    resetTripadvisorPlacePhotosForTests()
    authFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const unmatched = await fetchTripadvisorPlaceGallery({
      name: 'Some Unknown Cafe',
      type: 'cafe',
    })
    expect(unmatched).toBeNull()
    expect(authFetch).toHaveBeenCalledTimes(1)
    expect(String(authFetch.mock.calls[0]?.[0] || '')).toContain('rest=auto-complete')
    expect(String(authFetch.mock.calls[0]?.[0] || '')).not.toContain('media-gallery')

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
        new Response(
          JSON.stringify({
            data: [
              {
                localizedName: 'Bouillon Chartier',
                type: 'RESTAURANT',
                route: { params: { contentId: '698123' } },
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              sections: [
                {
                  mediaList: [
                    {
                      item: {
                        data: {
                          sizes: [
                            {
                              width: 1200,
                              url: 'https://media-cdn.tripadvisor.com/chartier.jpg',
                            },
                          ],
                        },
                      },
                    },
                  ],
                },
              ],
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )

    const gallery = await fetchTripadvisorPlaceGallery({
      name: 'Bouillon Chartier',
      type: 'restaurant',
    })
    expect(gallery?.contentId).toBe('698123')
    expect(gallery?.kind).toBe('restaurant')
    expect(gallery?.photos).toEqual(['https://media-cdn.tripadvisor.com/chartier.jpg'])
    expect(authFetch).toHaveBeenCalledTimes(2)
    expect(String(authFetch.mock.calls[0]?.[0] || '')).toContain('rest=auto-complete')
    expect(String(authFetch.mock.calls[0]?.[0] || '')).toContain(
      'query=Bouillon+Chartier+Paris',
    )
    expect(String(authFetch.mock.calls[1]?.[0] || '')).toContain(
      'rest=restaurants%2Fmedia-gallery',
    )
    expect(String(authFetch.mock.calls[1]?.[0] || '')).toContain('contentId=698123')

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

  it('reuses a cafe gallery when the Chinese/English labels are swapped', async () => {
    authFetch.mockReset()
    resetTripadvisorRequestBudgetForTests()
    resetLlmArtifactStoreForTests()
    resetTripadvisorPlacePhotosForTests()
    authFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                localizedName: 'Parallel Coffee',
                type: 'RESTAURANT',
                route: { params: { contentId: '778899' } },
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              sections: [
                {
                  mediaList: [
                    {
                      item: {
                        data: {
                          sizes: [
                            {
                              width: 1200,
                              url: 'https://media-cdn.tripadvisor.com/parallel.jpg',
                            },
                          ],
                        },
                      },
                    },
                  ],
                },
              ],
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )

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

  it('does not attach an unrelated restaurant autocomplete hit', async () => {
    authFetch.mockReset()
    resetTripadvisorRequestBudgetForTests()
    resetLlmArtifactStoreForTests()
    resetTripadvisorPlacePhotosForTests()
    authFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: [
            {
              localizedName: 'Some Other Bistro',
              type: 'RESTAURANT',
              route: { params: { contentId: '111000' } },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )

    const unmatched = await fetchTripadvisorPlaceGallery({
      name: 'Le Comptoir du Relais',
      type: 'restaurant',
    })
    expect(unmatched).toBeNull()
    expect(authFetch).toHaveBeenCalledTimes(1)
    expect(String(authFetch.mock.calls[0]?.[0] || '')).not.toContain('media-gallery')
  })

  it('loads a seeded attraction with media-gallery only, not the dated details endpoint', async () => {
    authFetch.mockReset()
    resetTripadvisorRequestBudgetForTests()
    resetLlmArtifactStoreForTests()
    resetTripadvisorPlacePhotosForTests()
    authFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            sections: [
              {
                mediaList: [
                  {
                    item: {
                      data: {
                        sizes: [
                          { width: 1024, url: 'https://media-cdn.tripadvisor.com/arc.jpg' },
                        ],
                      },
                    },
                  },
                ],
              },
            ],
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )

    const info = await fetchTripadvisorAttractionInfo({ name: '凯旋门', nameLocal: 'Arc de Triomphe' })
    expect(info?.contentId).toBe('188709')
    expect(info?.photos[0]).toContain('arc-de-triomphe.jpg')
    expect(info?.photos).toContain('https://media-cdn.tripadvisor.com/arc.jpg')
    expect(authFetch).toHaveBeenCalledTimes(1)
    const url = String(authFetch.mock.calls[0]?.[0] || '')
    expect(url).toContain('rest=attractions%2Fmedia-gallery')
    expect(url).toContain('contentId=188709')
    expect(url).not.toContain('startDate')
    expect(url).not.toContain('attractions%2Fdetails')
  })

  it('loads Champs-Élysées from the seeded Tripadvisor id without autocomplete', async () => {
    authFetch.mockReset()
    resetTripadvisorRequestBudgetForTests()
    resetLlmArtifactStoreForTests()
    resetTripadvisorPlacePhotosForTests()
    authFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            sections: [
              {
                mediaList: [
                  {
                    item: {
                      data: {
                        sizes: [
                          { width: 1200, url: 'https://media-cdn.tripadvisor.com/champs.jpg' },
                        ],
                      },
                    },
                  },
                ],
              },
            ],
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
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
    expect(url).toContain('contentId=209760')
    expect(url).not.toContain('auto-complete')
  })

  it('looks up an unseeded attraction by a cleaned name, then loads the gallery', async () => {
    authFetch.mockReset()
    resetTripadvisorRequestBudgetForTests()
    resetLlmArtifactStoreForTests()
    resetTripadvisorPlacePhotosForTests()
    authFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                localizedName: 'Pont Neuf',
                type: 'ATTRACTION',
                route: { params: { contentId: '188678' } },
              },
              {
                title: 'Pont Neuf Hotel',
                type: 'HOTEL',
                route: { params: { contentId: '999002' } },
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              sections: [
                {
                  mediaList: [
                    {
                      item: {
                        data: {
                          sizes: [
                            { width: 1200, url: 'https://media-cdn.tripadvisor.com/pont.jpg' },
                          ],
                        },
                      },
                    },
                  ],
                },
              ],
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
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
    expect(autocompleteUrl).toContain('rest=auto-complete')
    expect(autocompleteUrl).toContain('query=pont+neuf+Paris')
    expect(String(authFetch.mock.calls[1]?.[0] || '')).toContain('contentId=188678')
  })

  it('does not attach an unrelated autocomplete hit just because it was first', async () => {
    authFetch.mockReset()
    resetTripadvisorRequestBudgetForTests()
    resetLlmArtifactStoreForTests()
    resetTripadvisorPlacePhotosForTests()
    authFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: [
            {
              localizedName: 'Eiffel Tower',
              type: 'ATTRACTION',
              route: { params: { contentId: '188151' } },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
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
      new Response(
        JSON.stringify({
          data: {
            sections: [
              {
                mediaList: [
                  {
                    item: {
                      data: {
                        sizes: [
                          { width: 1200, url: 'https://media-cdn.tripadvisor.com/eiffel.jpg' },
                        ],
                      },
                    },
                  },
                ],
              },
            ],
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
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
    expect(url).toContain('contentId=188151')
    expect(url).not.toContain('auto-complete')
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
        new Response(
          JSON.stringify({
            data: [
              {
                localizedName: 'Pont Neuf',
                type: 'ATTRACTION',
                route: { params: { contentId: '188678' } },
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              sections: [
                {
                  mediaList: [
                    {
                      item: {
                        data: {
                          sizes: [
                            { width: 1200, url: 'https://media-cdn.tripadvisor.com/pont.jpg' },
                          ],
                        },
                      },
                    },
                  ],
                },
              ],
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )

    const gallery = await fetchTripadvisorPlaceGallery({
      name: '新桥',
      type: 'attraction',
    })
    expect(gallery?.contentId).toBe('188678')
    expect(gallery?.photos).toEqual(['https://media-cdn.tripadvisor.com/pont.jpg'])
    expect(authFetch).toHaveBeenCalledTimes(2)
    const autocompleteUrl = String(authFetch.mock.calls[0]?.[0] || '')
    expect(autocompleteUrl).toContain('rest=auto-complete')
    expect(autocompleteUrl).toContain('query=pont+neuf+Paris')
  })
})
