import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchWikimediaPlacePhoto,
  resetWikimediaPlacePhotoCacheForTests,
} from '../features/map/services/wikimediaPlacePhotos'

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response
}

describe('Wikimedia landmark photos', () => {
  beforeEach(() => {
    resetWikimediaPlacePhotoCacheForTests()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('resolves a coordinate-verified Commons image and reuses the cache', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ search: [{ id: 'Q243', label: 'tour Eiffel' }] }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          entities: {
            Q243: {
              id: 'Q243',
              labels: { fr: { value: 'tour Eiffel' } },
              claims: {
                P18: [
                  {
                    mainsnak: {
                      datavalue: { value: 'Tour Eiffel Wikimedia Commons.jpg' },
                    },
                  },
                ],
                P625: [
                  {
                    mainsnak: {
                      datavalue: {
                        value: { latitude: 48.85837, longitude: 2.294481 },
                      },
                    },
                  },
                ],
              },
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          query: {
            pages: {
              '123': {
                imageinfo: [
                  {
                    thumburl:
                      'https://upload.wikimedia.org/example/1200px-tour-eiffel.jpg',
                    descriptionurl:
                      'https://commons.wikimedia.org/wiki/File:Tour_Eiffel.jpg',
                    extmetadata: {
                      Artist: { value: '<a href="/wiki/User:Jane">Jane Doe</a>' },
                      LicenseShortName: { value: 'CC BY-SA 4.0' },
                      LicenseUrl: {
                        value: 'https://creativecommons.org/licenses/by-sa/4.0/',
                      },
                    },
                  },
                ],
              },
            },
          },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    const location = { lat: 48.85837, lng: 2.294481 }
    const first = await fetchWikimediaPlacePhoto(
      'Tour Eiffel cache-test-20260811',
      location,
    )
    const second = await fetchWikimediaPlacePhoto(
      'Tour Eiffel cache-test-20260811',
      location,
    )

    expect(first).toMatchObject({
      url: 'https://upload.wikimedia.org/example/1200px-tour-eiffel.jpg',
      attribution: 'Jane Doe',
      license: 'CC BY-SA 4.0',
      wikidataId: 'Q243',
    })
    expect(second).toEqual(first)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('rejects a name match whose Wikidata coordinates are far away', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ search: [{ id: 'Q999', label: 'Test landmark' }] }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          entities: {
            Q999: {
              id: 'Q999',
              labels: { en: { value: 'Test landmark' } },
              claims: {
                P18: [
                  {
                    mainsnak: {
                      datavalue: { value: 'Wrong city.jpg' },
                    },
                  },
                ],
                P625: [
                  {
                    mainsnak: {
                      datavalue: {
                        value: { latitude: 49.2827, longitude: -123.1207 },
                      },
                    },
                  },
                ],
              },
            },
          },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    const photo = await fetchWikimediaPlacePhoto(
      'Test landmark coordinate-test-20260811',
      { lat: 48.8566, lng: 2.3522 },
    )

    expect(photo).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('wikidata.org')
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('wikidata.org')
  })
})
