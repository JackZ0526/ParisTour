import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchBookingHotelDetails,
  fetchBookingHotelFeaturedReviews,
  bookingPhotoUrl,
  isBookingApiEnabled,
  normalizeBookingDestinationResponse,
  normalizeBookingDetailResponse,
  normalizeBookingDescriptionResponse,
  normalizeBookingFeaturedReviews,
  normalizeBookingHotelIdentityResponse,
  normalizeBookingHotelIdentityQuery,
  normalizeBookingPhotosResponse,
  normalizeBookingReviewScoresResponse,
  normalizeBookingSearchResponse,
  resetBookingHotelCacheForTests,
  resolveBookingHotelIdentity,
  searchBookingHotelCandidates,
} from '../features/hotel/services/bookingHotels'

describe('Booking hotel adapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    resetBookingHotelCacheForTests()
  })

  it('honors the browser-safe disabled switch', () => {
    vi.stubEnv('VITE_BOOKING_API_ENABLED', 'false')
    expect(isBookingApiEnabled()).toBe(false)
  })

  it('does not issue any network request while disabled', async () => {
    vi.stubEnv('VITE_BOOKING_API_ENABLED', 'false')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      searchBookingHotelCandidates({
        startDate: '2098-04-01',
        endDate: '2098-04-05',
      }),
    ).rejects.toThrow('尚未启用')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('selects the Paris city destination from booking-com18 auto-complete', () => {
    expect(
      normalizeBookingDestinationResponse({
        data: [
          {
            dest_type: 'hotel',
            type: 'ho',
            dest_id: 'wrong-country',
            name: 'Georgette Hôtel & Restaurant',
            label: 'Georgette Hôtel & Restaurant, Mindelo, Cape Verde',
            latitude: 16.887,
            longitude: -24.988,
          },
          {
            dest_id: '2090',
            dest_type: 'district',
            label: 'Paris City Centre, Paris, France',
            label1: 'Paris City Centre',
          },
          {
            dest_id: '-1456928',
            dest_type: 'city',
            label: 'Paris, Île-de-France, France',
            label1: 'Paris',
          },
        ],
      }),
    ).toEqual({ id: '-1456928', type: 'city' })
  })

  it('normalizes regular stays search cards without an extra details request', () => {
    const hotels = normalizeBookingSearchResponse({
      data: {
        results: [
          {
            displayName: { text: 'Hôtel Georgette' },
            checkinCheckoutPolicy: {
              checkinTimeFromFormatted: '15:00',
              checkoutTimeUntilFormatted: '11:00',
            },
            basicPropertyData: {
              id: 186118,
              name: 'Hôtel Georgette',
              location: {
                address: '36 Rue du Grenier-Saint-Lazare',
                city: 'Paris',
                latitude: 48.8632711,
                longitude: 2.352693,
              },
              reviews: { totalScore: 8.6, reviewsCount: 1186 },
              starRating: { value: 4 },
              photos: {
                main: {
                  lowResJpegUrl: {
                    absoluteUrl: 'https://cf.bstatic.com/hotel/main.jpg',
                  },
                },
              },
            },
          },
        ],
      },
    })

    expect(hotels).toEqual([
      expect.objectContaining({
        id: '186118',
        name: 'Hôtel Georgette',
        address: '36 Rue du Grenier-Saint-Lazare, Paris',
        rating: 8.6,
        reviewCount: 1186,
        stars: 4,
        area: 'Paris',
        image: 'https://cf.bstatic.com/hotel/main.jpg',
        checkIn: '15:00',
        checkOut: '11:00',
        location: { lat: 48.8632711, lng: 2.352693 },
      }),
    ])
  })

  it('recovers official stars from description when class is missing', () => {
    const hotel = normalizeBookingDetailResponse({
      data: {
        hotel_id: 8913188,
        hotel_name: 'Padam Hôtel',
        latitude: 48.868668,
        longitude: 2.297871,
        review_score: 9.2,
        review_nr: 762,
        description:
          'Stay in the heart of Paris. This 4-star hotel offers room service and a restaurant.',
        accommodation_type_name: 'Hotels',
      },
    })

    expect(hotel).toMatchObject({
      id: '8913188',
      stars: 4,
      rating: 9.2,
      reviewCount: 762,
    })
  })

  it('extracts regular stays detail photos, top_ufi_benefits, and location', () => {
    const hotel = normalizeBookingDetailResponse({
      data: {
        hotel_id: 186118,
        hotel_name: 'Hôtel Georgette',
        latitude: 48.8632711,
        longitude: 2.352693,
        address: '36 Rue du Grenier-Saint-Lazare',
        city: 'Paris',
        zip: '75003',
        review_score: 8.6,
        review_nr: 1186,
        class: 4,
        photos: [
          {
            url_original: 'https://cf.bstatic.com/hotel/highres.jpg',
            url_max300: 'https://cf.bstatic.com/hotel/thumb.jpg',
          },
        ],
        top_ufi_benefits: [
          { translated_name: 'Wifi' },
          { translated_name: 'Non-smoking rooms' },
        ],
        facilities: [
          { translated_name: 'Air conditioning' },
          { translated_name: 'Baggage storage' },
        ],
        accommodation_type_name: 'Hotel',
        review_scores: [
          { name: 'hotel_location', score: 9.4 },
          { name: 'hotel_clean', score: 9.1 },
        ],
        languages_spoken: ['fr', 'en'],
        important_information: ['Guests must show photo ID at check-in.'],
        accepted_payment_methods: ['Visa', 'Mastercard'],
        checkin: { fromTime: '15:00' },
        checkout: { untilTime: '11:00' },
      },
    })

    expect(hotel).toMatchObject({
      id: '186118',
      name: 'Hôtel Georgette',
      address: '36 Rue du Grenier-Saint-Lazare, Paris, 75003',
      rating: 8.6,
      reviewCount: 1186,
      stars: 4,
      image: 'https://cf.bstatic.com/hotel/highres.jpg',
      facilities: ['Wifi', 'Non-smoking rooms'],
      propertyType: 'Hotel',
      reviewScores: [
        { label: '位置', score: 9.4 },
        { label: '清洁程度', score: 9.1 },
      ],
      languages: ['fr', 'en'],
      policies: ['Guests must show photo ID at check-in.'],
      paymentMethods: ['Visa', 'Mastercard'],
      checkIn: '15:00',
      checkOut: '11:00',
      location: { lat: 48.8632711, lng: 2.352693 },
    })
  })

  it('extracts structured policies from property_policy_display_details', () => {
    const hotel = normalizeBookingDetailResponse({
      data: {
        hotel_id: 432332,
        hotel_name: 'Georgette Hôtel & Restaurant',
        latitude: 48.86324,
        longitude: 2.3526356,
        review_score: 8.6,
        review_nr: 743,
        property_policy_display_details: {
          minimum_age_phrase: 'Guests must be 18 or older to check in.',
          pets_allowed_phrase: 'Pets are not allowed.',
          smoking_not_allowed_phrase: 'Smoking is not allowed.',
        },
        hotel_accepts_cash_status: 'PATP_PROPERTY_DOES_NOT_ACCEPT_CASH',
      },
    })

    expect(hotel?.policies).toEqual(
      expect.arrayContaining([
        'Guests must be 18 or older to check in.',
        'Pets are not allowed.',
        'Smoking is not allowed.',
        '住宿不接受现金付款',
      ]),
    )
  })

  it('extracts review scores from stays/review-scores total breakdown', () => {
    const result = normalizeBookingReviewScoresResponse({
      data: {
        hotel_id: 432332,
        score_breakdown: [
          {
            customer_type: 'total',
            count: 743,
            average_score: '8.4',
            question: [
              { question: 'hotel_clean', score: 8.8 },
              { question: 'hotel_location', score: 9.4 },
              { question: 'hotel_staff', score: 9.3 },
              { question: 'total', score: 8.4 },
            ],
          },
        ],
      },
    })

    expect(result).toMatchObject({
      rating: 8.4,
      reviewCount: 743,
      reviewScores: [
        { label: '清洁程度', score: 8.8 },
        { label: '位置', score: 9.4 },
        { label: '员工服务', score: 9.3 },
      ],
    })
  })

  it('extracts location description from stays/get-description', () => {
    const result = normalizeBookingDescriptionResponse({
      data: [
        {
          descriptiontype_id: 6,
          description: 'Located in the Marais district.\n\nRambuteau Metro is nearby.',
        },
        {
          descriptiontype_id: 7,
          description: 'Guests must show photo ID at check-in.',
        },
      ],
    })

    expect(result.locationDescription).toContain('Marais')
    expect(result.policies).toEqual(['Guests must show photo ID at check-in.'])
  })

  it('extracts stable hotel details from the supplied GraphQL-style response', () => {
    const hotel = normalizeBookingDetailResponse({
      data: {
        basicPropertyData: [
          {
            id: 186118,
            name: 'Mayfair Hotel, Ascend Hotel Collection',
            location: {
              city: 'New York',
              latitude: 40.761311,
              longitude: -73.985921,
              formattedAddress:
                '242 West 49th Street, New York, NY 10019, United States',
            },
          },
        ],
        hotelPhotos: [
          {
            highres_url: 'https://cf.bstatic.com/hotel/highres.jpg',
            large_url: 'https://cf.bstatic.com/hotel/large.jpg',
          },
        ],
        property: [
          {
            id: 186118,
            reviews: { reviewsCount: 1186 },
            houseRules: {
              checkinCheckoutTimes: {
                checkinTimeRange: { fromFormatted: '15:00' },
                checkoutTimeRange: { untilFormatted: '11:00' },
              },
            },
          },
        ],
        propertyReview: [
          { totalScore: { score: 8.6, reviewsCount: 1186 } },
        ],
        hotelTranslation: [
          { description: 'A renovated hotel in the Theater District.' },
        ],
        starRating: [{ value: 3 }],
        baseFacility: [
          { instances: [{ title: 'Air conditioning' }] },
          { instances: [{ title: 'Baggage storage' }] },
        ],
        featuredReview: [
          {
            averageScore: 9,
            guestName: 'Jennifer',
            guestCountryCode: 'us',
            positiveText: 'Clean and comfortable.',
            negativeText: 'Small room.',
            completed: 1725455678,
          },
        ],
      },
    })

    expect(hotel).toMatchObject({
      id: '186118',
      name: 'Mayfair Hotel, Ascend Hotel Collection',
      rating: 8.6,
      reviewCount: 1186,
      stars: 3,
      image: 'https://cf.bstatic.com/hotel/highres.jpg',
      facilities: ['Air conditioning', 'Baggage storage'],
      checkIn: '15:00',
      checkOut: '11:00',
      reviews: [
        expect.objectContaining({
          author: 'Jennifer',
          rating: 9,
          text: 'Clean and comfortable.',
          negativeText: 'Small room.',
        }),
      ],
    })
  })

  it('extracts Booking featured review copy and metadata', () => {
    const result = normalizeBookingFeaturedReviews({
      data: {
        vpm_favorable_review_count: 3593,
        featured_reviews_title: 'What guests loved the most:',
        vpm_featured_reviews: [
          {
            title: 'Perfect stay',
            pros: 'Friendly staff &amp; a clean room.',
            cons: 'Breakfast was expensive.',
            average_score_out_of_10: 9.6,
            date: '2024-01-11 04:39:12',
            author: { name: 'Angel', countrycode: 'au' },
          },
        ],
      },
    })

    expect(result).toMatchObject({
      title: 'What guests loved the most:',
      favorableCount: 3593,
      reviews: [
        expect.objectContaining({
          text: 'Perfect stay\nFriendly staff & a clean room.',
          negativeText: 'Breakfast was expensive.',
          rating: 9.6,
          author: 'Angel',
          countryCode: 'au',
        }),
      ],
    })
    expect(result.reviews[0].completedAt).toBeTypeOf('number')
  })

  it('upgrades Booking thumbnails without a separate image request', () => {
    expect(
      bookingPhotoUrl(
        'https://cf.bstatic.com/xdata/images/hotel/150x150/13030433.jpg?k=photo-key&o=',
      ),
    ).toContain('/xdata/images/hotel/max1024x768/13030433.jpg')
  })

  it('extracts one display-size URL per photo from get-photos response', () => {
    const photos = normalizeBookingPhotosResponse({
      data: {
        __typename: 'hoteldescriptionphotosResults',
        data: {
          '2291137': [
            [
              1,
              [],
              484656765,
              [{ id: 173, tag: 'Photo of the whole room' }],
              [
                '/xdata/images/hotel/square60/484656765.jpg?k=a&o=',
                '/xdata/images/hotel/max1024x768/484656765.jpg?k=a&o=',
                '/xdata/images/hotel/max200/484656765.jpg?k=a&o=',
              ],
            ],
            [
              1,
              [],
              484656760,
              [{ id: 3, tag: 'Property building' }],
              [
                '/xdata/images/hotel/max1024x768/484656760.jpg?k=b&o=',
              ],
            ],
          ],
        },
      },
    })
    expect(photos).toEqual([
      'https://cf.bstatic.com/xdata/images/hotel/max1024x768/484656765.jpg?k=a&o=',
      'https://cf.bstatic.com/xdata/images/hotel/max1024x768/484656760.jpg?k=b&o=',
    ])
  })

  it('resolves an exact hotel identity from autocomplete results', () => {
    const hotel = normalizeBookingHotelIdentityResponse(
      {
        data: [
          {
            dest_type: 'hotel',
            type: 'ho',
            dest_id: '12345',
            name: 'Georgette Hôtel & Restaurant',
            label: 'Georgette Hôtel & Restaurant, Paris, France',
            latitude: 48.8632,
            longitude: 2.3527,
            image_url: 'https://cf.bstatic.com/georgette.jpg',
          },
          {
            dest_type: 'hotel',
            type: 'ho',
            dest_id: '67890',
            name: 'Hôtel Marie',
            latitude: 48.86,
            longitude: 2.35,
          },
        ],
      },
      'Georgette Hôtel & Restaurant',
    )

    expect(hotel).toMatchObject({
      id: '12345',
      name: 'Georgette Hôtel & Restaurant',
      image: 'https://cf.bstatic.com/georgette.jpg',
    })
  })

  it('removes legacy star decorations before Booking identity lookup', () => {
    expect(normalizeBookingHotelIdentityQuery('Padam hôtel 4*')).toBe('Padam hôtel')
    expect(normalizeBookingHotelIdentityQuery('Padam Hôtel 4 stars, Paris')).toBe(
      'Padam Hôtel',
    )
  })

  it('accepts nested coordinates returned by Booking autocomplete', () => {
    const hotel = normalizeBookingHotelIdentityResponse(
      {
        data: [
          {
            dest_type: 'hotel',
            dest_id: 'padam-1',
            name: 'Padam Hôtel',
            location: { latitude: 48.867, longitude: 2.292 },
          },
        ],
      },
      'Padam hôtel',
    )

    expect(hotel).toMatchObject({
      id: 'padam-1',
      name: 'Padam Hôtel',
      location: { lat: 48.867, lng: 2.292 },
    })
  })

  it('hydrates an autocomplete identity through Booking details when coordinates are absent', async () => {
    vi.stubEnv('VITE_BOOKING_API_ENABLED', 'true')
    const storage = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) || null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    })
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.includes('auto-complete')) {
        return Response.json({
          data: [
            {
              dest_type: 'hotel',
              dest_id: 'padam-identity',
              name: 'Padam Hôtel',
              label: 'Padam Hôtel, Paris, France',
            },
          ],
        })
      }
      return Response.json({
        data: {
          hotel_id: 'padam-identity',
          hotel_name: 'Padam Hôtel',
          latitude: 48.868,
          longitude: 2.296,
          address: '9 Rue Jean Giraudoux, Paris',
        },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const hotel = await resolveBookingHotelIdentity('Padam hôtel 4*', {
      startDate: '2098-04-01',
      endDate: '2098-04-05',
    })

    expect(hotel).toMatchObject({
      id: 'padam-identity',
      name: 'Padam Hôtel',
      location: { lat: 48.868, lng: 2.296 },
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('caches candidate, detail, and featured-review requests independently', async () => {
    vi.stubEnv('VITE_BOOKING_API_ENABLED', 'true')
    const storage = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) || null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
    })
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.includes('stays%2Fsearch-by-geo') || url.includes('stays/search-by-geo')) {
        return Response.json({
          data: {
            results: [
              {
                basicPropertyData: {
                  id: 777001,
                  name: 'Cache Test Paris Hotel',
                  location: {
                    latitude: 48.8567,
                    longitude: 2.3523,
                    city: 'Paris',
                  },
                  reviews: { totalScore: 9.1, reviewsCount: 321 },
                },
              },
            ],
          },
          status: true,
        })
      }
      if (url.includes('stays%2Fdetail') || url.includes('stays/detail')) {
        return Response.json({
          data: {
            hotel_id: 777001,
            hotel_name: 'Cache Test Paris Hotel',
            latitude: 48.8567,
            longitude: 2.3523,
            address: '1 Rue de Test',
            city: 'Paris',
            top_ufi_benefits: [{ translated_name: 'Free WiFi' }],
          },
          status: true,
        })
      }
      return Response.json({
        data: {
          vpm_featured_reviews: [
            { pros: 'Excellent location.', average_score_out_of_10: 9 },
          ],
        },
        status: true,
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const dates = { startDate: '2097-04-01', endDate: '2097-04-05' }
    await searchBookingHotelCandidates(dates)
    await searchBookingHotelCandidates(dates)
    await fetchBookingHotelDetails({ id: '777001', ...dates })
    await fetchBookingHotelDetails({ id: '777001', ...dates })
    await fetchBookingHotelFeaturedReviews({ id: '777001' })
    await fetchBookingHotelFeaturedReviews({ id: '777001' })

    const urls = fetchMock.mock.calls.map(([input]) => String(input))
    expect(urls.filter((url) => url.includes('search-by-geo'))).toHaveLength(1)
    expect(urls.filter((url) => url.includes('stays%2Fdetail'))).toHaveLength(1)
    expect(urls.filter((url) => url.includes('review-featured'))).toHaveLength(1)
  })
})
