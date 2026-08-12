import type { Coordinates } from '../../../types'
import { authFetch } from '../../auth/services/authFetch'
import {
  getLlmArtifact,
  setLlmArtifact,
} from '../../../shared/services/llm/llmArtifactStore'
import { placeIdentitySimilarity, PLACE_NAME_MATCH_MIN } from '../../../shared/utils/placeTitle'

export interface BookingHotelReview {
  text: string
  negativeText?: string
  rating?: number
  author?: string
  countryCode?: string
  completedAt?: number
}

export interface BookingFeaturedReviews {
  title?: string
  favorableCount?: number
  reviews: BookingHotelReview[]
}

export interface BookingHotelRecord {
  id: string
  name: string
  address: string
  location: Coordinates
  rating?: number
  reviewCount?: number
  stars?: number
  area?: string
  image?: string
  photos: string[]
  description?: string
  facilities: string[]
  propertyType?: string
  reviewScores?: Array<{ label: string; score: number }>
  languages?: string[]
  policies?: string[]
  paymentMethods?: string[]
  sustainability?: string
  reviews: BookingHotelReview[]
  checkIn?: string
  checkOut?: string
  sourceUrl?: string
}

type CachedValue<T> = { value: T; fetchedAt: number }

const SEARCH_PREFIX = 'booking-hotels-search:v3:'
const DETAIL_PREFIX = 'booking-hotel-detail:v4:'
const PHOTOS_PREFIX = 'booking-hotel-photos:v3:'
const FEATURED_REVIEWS_PREFIX = 'booking-hotel-featured-reviews:v1:'
const IDENTITY_PREFIX = 'booking-hotel-identity:v1:'
const CANDIDATE_PREFIX = 'booking-hotel-candidate:v3:'
const SEARCH_TTL_MS = 24 * 60 * 60 * 1_000
const DETAIL_TTL_MS = 30 * 24 * 60 * 60 * 1_000
const PARIS = { lat: 48.8566, lng: 2.3522 }
const PARIS_BOUNDS = {
  neLat: '48.9022',
  neLng: '2.4699',
  swLat: '48.8156',
  swLng: '2.2241',
}

const candidateMemory = new Map<string, BookingHotelRecord>()
const detailInflight = new Map<string, Promise<BookingHotelRecord | null>>()
const photosInflight = new Map<string, Promise<string[]>>()
const reviewInflight = new Map<string, Promise<BookingFeaturedReviews>>()

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function firstRecord(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) return asRecord(value[0])
  return asRecord(value)
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function number(value: unknown): number | undefined {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function uniqueStrings(values: unknown[]): string[] {
  return [...new Set(values.map(text).filter(Boolean))]
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    const row = asRecord(value)
    return row ? uniqueStrings(Object.values(row)) : []
  }
  return uniqueStrings(
    value.flatMap((item) => {
      const row = asRecord(item)
      return row
        ? [row.name, row.nameEn, row.title, row.label, row.text, row.description]
        : [item]
    }),
  )
}

function reviewScoreLabel(value: string): string {
  const labels: Record<string, string> = {
    hotel_staff: '员工服务',
    hotel_services: '设施服务',
    hotel_clean: '清洁程度',
    hotel_comfort: '舒适程度',
    hotel_value: '性价比',
    hotel_location: '位置',
    hotel_free_wifi: '免费 Wi-Fi',
    hotel_wifi: 'Wi-Fi',
    breakfast: '早餐',
    hotel_breakfast: '早餐',
    enjoy_walking_rating: '步行便利',
  }
  const key = value.trim().toLowerCase()
  return labels[key] || value.replace(/^hotel_/i, '').replaceAll('_', ' ')
}

function normalizeReviewScores(value: unknown): Array<{ label: string; score: number }> {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  return value.flatMap((item) => {
    const row = asRecord(item)
    if (!row) return []
    const question = asRecord(row.question)
    const scoreSegment = asRecord(row.scoreSegment)
    const rawLabel = text(row.name) || text(question?.question) || text(row.label)
    const score = number(row.score) ?? number(scoreSegment?.score) ?? number(scoreSegment?.scoreOutOf10)
    const customerType = text(row.customerType)
    if (!rawLabel || score == null || score <= 0 || /(^|_)total$/i.test(rawLabel)) return []
    if (customerType && customerType !== 'TOTAL') return []
    const label = reviewScoreLabel(rawLabel)
    if (seen.has(label)) return []
    seen.add(label)
    return [{ label, score }]
  }).slice(0, 8)
}

export function bookingPhotoUrl(value: unknown): string {
  const raw = text(value)
  if (!raw) return ''
  const absolute = /^https?:\/\//i.test(raw)
    ? raw
    : raw.startsWith('//')
      ? `https:${raw}`
      : raw.startsWith('/')
        ? `https://cf.bstatic.com${raw}`
        : raw
  // Autocomplete deliberately returns 150px thumbnails. Booking's CDN keeps
  // the same immutable image key across size variants, so requesting the
  // display-sized variant avoids a second RapidAPI call and blurry upscaling.
  return absolute.replace(
    /\/xdata\/images\/hotel\/(?:square\d+|max\d+x?\d*|\d+x\d+)\//i,
    '/xdata/images/hotel/max1024x768/',
  )
}

export function normalizeBookingPhotosResponse(payload: unknown): string[] {
  const root = asRecord(payload)
  const photoGroups = asRecord(asRecord(root?.data)?.data)
  if (!photoGroups) return []
  const urls: string[] = []
  for (const group of Object.values(photoGroups)) {
    if (!Array.isArray(group)) continue
    for (const rawPhoto of group) {
      if (!Array.isArray(rawPhoto)) continue
      const variants = rawPhoto[4]
      if (!Array.isArray(variants)) continue
      const displayUrl = variants.find(
        (value) => typeof value === 'string' && /\/max1024x768\//i.test(value),
      )
      if (displayUrl) urls.push(bookingPhotoUrl(displayUrl))
    }
  }
  return uniqueStrings(urls).slice(0, 24)
}

function joinedAddress(...parts: unknown[]): string {
  return uniqueStrings(parts).join(', ')
}

const GENERIC_HOTEL_NAME_TOKENS = new Set([
  'hotel',
  'hostel',
  'paris',
  'the',
  'le',
  'la',
  'les',
  'de',
  'du',
  'des',
])

function meaningfulHotelNameTokens(value: string): string[] {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(
      (token) =>
        token.length >= 3 && !GENERIC_HOTEL_NAME_TOKENS.has(token),
    )
}

function hasMeaningfulHotelNameOverlap(query: string, candidate: string): boolean {
  const queryTokens = meaningfulHotelNameTokens(query)
  if (!queryTokens.length) return true
  const candidateTokens = new Set(meaningfulHotelNameTokens(candidate))
  return queryTokens.some((token) => candidateTokens.has(token))
}

function decodeHtml(value: unknown): string {
  return text(value).replace(
    /&(#x?[0-9a-f]+|amp|quot|apos|lt|gt);/gi,
    (entity, token: string) => {
      const lower = token.toLowerCase()
      if (lower === 'amp') return '&'
      if (lower === 'quot') return '"'
      if (lower === 'apos') return "'"
      if (lower === 'lt') return '<'
      if (lower === 'gt') return '>'
      const radix = lower.startsWith('#x') ? 16 : 10
      const raw = lower.replace(/^#x?/, '')
      const code = Number.parseInt(raw, radix)
      return Number.isFinite(code) ? String.fromCodePoint(code) : entity
    },
  )
}

function distanceMeters(a: Coordinates, b: Coordinates): number {
  const rad = (degrees: number) => (degrees * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h))
}

function candidateArtifactKey(id: string): string {
  return `${CANDIDATE_PREFIX}${id}`
}

function remember(record: BookingHotelRecord, silent = false) {
  candidateMemory.set(record.id, record)
  setLlmArtifact(candidateArtifactKey(record.id), record, { silent })
}

function cachedValue<T>(key: string, ttl: number): T | null {
  const cached = getLlmArtifact<CachedValue<T>>(key)
  if (!cached || Date.now() - cached.fetchedAt > ttl) return null
  return cached.value
}

export function isBookingApiEnabled(): boolean {
  return String(import.meta.env.VITE_BOOKING_API_ENABLED || '').toLowerCase() === 'true'
}

async function request<T>(rest: string, params: Record<string, string>): Promise<T> {
  if (!isBookingApiEnabled()) {
    throw new Error('Booking 酒店服务尚未启用；当前不会消耗 API 请求额度。')
  }
  const query = new URLSearchParams({ rest, ...params })
  const response = await authFetch(`/api/booking?${query}`)
  if (!response.ok) {
    const message = await response.text().catch(() => '')
    if (/booking_upstream_waf|AwsWafIntegration|challenge-container/i.test(message)) {
      throw new Error('Booking 数据源暂时被上游验证拦截，请稍后再试。')
    }
    throw new Error(`Booking 酒店服务请求失败（${response.status}）${message ? `：${message}` : ''}`)
  }
  const payload = (await response.json()) as T
  const root = asRecord(payload)
  if (root?.status === false) {
    const errors = asRecord(root.errors)
    const upstreamContent = text(errors?.content)
    if (/AwsWafIntegration|challenge-container/i.test(upstreamContent)) {
      throw new Error('Booking 数据源暂时被上游验证拦截，请稍后再试。')
    }
    const detail = uniqueStrings(Object.values(errors || {})).join('；')
    throw new Error(`Booking 酒店服务返回错误${detail ? `：${detail}` : ''}`)
  }
  return payload
}

export function normalizeBookingSearchResponse(payload: unknown): BookingHotelRecord[] {
  const root = asRecord(payload)
  const rawData = root?.data
  const data = asRecord(rawData)
  const hotels = Array.isArray(rawData)
    ? rawData
    : Array.isArray(data?.results)
    ? data.results
    : Array.isArray(data?.hotels)
      ? data.hotels
      : []
  const out: BookingHotelRecord[] = []

  for (const raw of hotels) {
    const row = asRecord(raw)
    if (!row) continue

    // booking-com18 web response (GraphQL-style search result).
    const basic = asRecord(row.basicPropertyData)
    const basicLocation = asRecord(basic?.location)
    const displayName = asRecord(row.displayName)
    const reviews = asRecord(basic?.reviews) || asRecord(row.reviews)
    const starRating = asRecord(basic?.starRating) || asRecord(row.starRating)
    const displayLocation = asRecord(row.location)
    const propertyPhotos = asRecord(basic?.photos)
    const mainPhoto = asRecord(propertyPhotos?.main)
    const highRes = asRecord(mainPhoto?.highResUrl)
    const lowRes = asRecord(mainPhoto?.lowResUrl)
    const highResJpeg = asRecord(mainPhoto?.highResJpegUrl)
    const lowResJpeg = asRecord(mainPhoto?.lowResJpegUrl)
    const checkinCheckoutPolicy = asRecord(row.checkinCheckoutPolicy)

    // Retain compatibility with the earlier booking-com15 shape so existing
    // cached fixtures can still be read after the provider migration.
    const legacyProperty = asRecord(row.property)
    const id = String(basic?.id ?? row.id ?? row.hotel_id ?? legacyProperty?.id ?? '').trim()
    const name =
      text(displayName?.text) ||
      text(basic?.name) ||
      text(row.name) ||
      text(legacyProperty?.name)
    if (!id || !name) continue

    const lat =
      number(basicLocation?.latitude) ??
      number(row.latitude) ??
      number(legacyProperty?.latitude) ??
      PARIS.lat
    const lng =
      number(basicLocation?.longitude) ??
      number(row.longitude) ??
      number(legacyProperty?.longitude) ??
      PARIS.lng
    const legacyPhotoUrls = Array.isArray(legacyProperty?.photoUrls)
      ? legacyProperty.photoUrls
      : []
    const regularPhotoUrls = Array.isArray(row.photoUrls) ? row.photoUrls : []
    const photos = uniqueStrings([
      bookingPhotoUrl(highRes?.relativeUrl),
      bookingPhotoUrl(highRes?.absoluteUrl),
      bookingPhotoUrl(highResJpeg?.relativeUrl),
      bookingPhotoUrl(highResJpeg?.absoluteUrl),
      bookingPhotoUrl(lowRes?.relativeUrl),
      bookingPhotoUrl(lowRes?.absoluteUrl),
      bookingPhotoUrl(lowResJpeg?.relativeUrl),
      bookingPhotoUrl(lowResJpeg?.absoluteUrl),
      bookingPhotoUrl(legacyProperty?.photoUrl),
      bookingPhotoUrl(legacyProperty?.mainPhotoUrl),
      ...regularPhotoUrls.map(bookingPhotoUrl),
      ...legacyPhotoUrls.map(bookingPhotoUrl),
    ])
    const pageName = basic ? text(row.id) : ''
    const sourceUrl = pageName
      ? `https://www.booking.com/hotel/${pageName.replace(/^\/+|\.html$/g, '')}.html`
      : undefined
    out.push({
      id,
      name,
      address:
        joinedAddress(basicLocation?.address, basicLocation?.city) ||
        text(legacyProperty?.address) ||
        text(legacyProperty?.address2) ||
        joinedAddress(name, row.wishlistName || 'Paris', 'France'),
      location: { lat, lng },
      rating:
        number(reviews?.totalScore) ??
        number(row.reviewScore) ??
        number(legacyProperty?.reviewScore),
      reviewCount:
        number(reviews?.reviewsCount) ??
        number(row.reviewCount) ??
        number(legacyProperty?.reviewCount),
      stars:
        number(starRating?.value) ??
        number(row.accuratePropertyClass) ??
        number(row.propertyClass) ??
        number(row.qualityClass) ??
        number(legacyProperty?.propertyClass),
      area:
        text(displayLocation?.displayLocation) ||
        text(basicLocation?.city) ||
        text(row.wishlistName) ||
        text(legacyProperty?.wishlistName) ||
        text(legacyProperty?.city),
      image: photos[0],
      photos,
      facilities: [],
      reviews: [],
      checkIn:
        text(asRecord(row.checkin)?.fromTime) ||
        text(checkinCheckoutPolicy?.checkinTimeFromFormatted) ||
        undefined,
      checkOut:
        text(asRecord(row.checkout)?.untilTime) ||
        text(checkinCheckoutPolicy?.checkoutTimeUntilFormatted) ||
        undefined,
      sourceUrl,
    })
  }
  return out
}

export function normalizeBookingHotelIdentityResponse(
  payload: unknown,
  query: string,
): BookingHotelRecord | null {
  const root = asRecord(payload)
  const rows = Array.isArray(root?.data) ? root.data : []
  const hotels = rows.flatMap((value) => {
    const row = asRecord(value)
    if (!row || (text(row.dest_type) !== 'hotel' && text(row.type) !== 'ho')) return []
    const id = String(row.dest_id ?? '').trim()
    const name = text(row.name)
    const lat = number(row.latitude)
    const lng = number(row.longitude)
    if (!id || !name || lat == null || lng == null) return []
    return [{
      id,
      name,
      address: text(row.label) || joinedAddress(name, row.city_name, row.country),
      location: { lat, lng },
      area: text(row.city_name),
      image: bookingPhotoUrl(row.image_url) || undefined,
      photos: uniqueStrings([bookingPhotoUrl(row.image_url)]),
      facilities: [],
      reviews: [],
    } satisfies BookingHotelRecord]
  }).filter((hotel) => distanceMeters(PARIS, hotel.location) <= 30_000)
  return (
    hotels
      .map((hotel) => ({
        hotel,
        score: placeIdentitySimilarity(query, hotel.name),
      }))
      .filter(
        (item) =>
          item.score >= PLACE_NAME_MATCH_MIN &&
          hasMeaningfulHotelNameOverlap(query, item.hotel.name),
      )
      .sort((a, b) => b.score - a.score)[0]?.hotel || null
  )
}

export function normalizeBookingDestinationResponse(
  payload: unknown,
): { id: string; type: string } | null {
  const data = asRecord(payload)?.data
  const rows = Array.isArray(data) ? data : []
  const candidates = rows.map(asRecord).filter(Boolean)
  const city =
    candidates.find(
      (row) =>
        /^paris(?:,|$)/i.test(text(row?.label1) || text(row?.label)) &&
        /city/i.test(text(row?.dest_type)),
    ) ||
    candidates.find((row) => /paris/i.test(text(row?.label1) || text(row?.label)))
  const id = String(city?.dest_id ?? '').trim()
  if (!id) return null
  return { id, type: text(city?.dest_type) || 'city' }
}

export function normalizeBookingDetailResponse(payload: unknown): BookingHotelRecord | null {
  const root = asRecord(payload)
  const data = asRecord(root?.data)
  if (!data) return null

  // booking-com18 regular `stays/detail` response. Unlike the web endpoint,
  // this shape is flat and already includes coordinates and several photos.
  const regularId = String(data.hotel_id ?? data.id ?? '').trim()
  const regularName = text(data.hotel_name) || text(data.name)
  const regularLat = number(data.latitude)
  const regularLng = number(data.longitude)
  if (regularId && regularName && regularLat != null && regularLng != null) {
    const regularPhotos = Array.isArray(data.photos) ? data.photos : []
    const photos = uniqueStrings(
      regularPhotos.flatMap((item) => {
        const photo = asRecord(item)
        return [
          photo?.url_original,
          photo?.url_max300,
          photo?.url_640x200,
          photo?.url_square60,
        ].map(bookingPhotoUrl)
      }),
    )
    const facilitiesBlock = asRecord(data.facilities_block)
    const regularFacilities = Array.isArray(data.facilities)
      ? data.facilities
      : Array.isArray(facilitiesBlock?.facilities)
        ? facilitiesBlock.facilities
        : []
    const topBenefits = Array.isArray(data.top_ufi_benefits) ? data.top_ufi_benefits : []
    const highlightStrip = Array.isArray(data.property_highlight_strip)
      ? data.property_highlight_strip
      : []
    const hotelText = asRecord(data.hotel_text)
    const checkIn = asRecord(data.checkin)
    const checkOut = asRecord(data.checkout)
    const wifiScore = asRecord(data.wifi_review_score)
    const breakfastScore = asRecord(data.breakfast_review_score)
    const regularReviewScores = [
      Array.isArray(data.review_scores) ? data.review_scores :
      Array.isArray(data.review_subscores) ? data.review_subscores : [],
      wifiScore ? [{ name: 'hotel_wifi', score: wifiScore.rating }] : [],
      breakfastScore ? [{ name: 'hotel_breakfast', score: breakfastScore.rating }] : [],
    ].flat()
    const regularPolicies = uniqueStrings([
      ...stringArray(data.important_information),
      ...stringArray(data.fine_print),
      ...stringArray(data.house_rules),
      text(data.minimum_age) ? `最低入住年龄：${text(data.minimum_age)} 岁` : '',
      text(data.pets_allowed) ? `宠物政策：${text(data.pets_allowed)}` : '',
    ])

    return {
      id: regularId,
      name: regularName,
      address:
        text(data.hotel_address_line) ||
        joinedAddress(data.address, data.city, data.zip) ||
        `${regularName}, Paris, France`,
      location: { lat: regularLat, lng: regularLng },
      rating: number(data.review_score) ?? number(data.reviewScore),
      reviewCount: number(data.review_nr) ?? number(data.review_count),
      stars:
        number(data.class) ??
        number(data.accurate_property_class) ??
        number(data.property_class),
      area: text(data.city),
      image: photos[0],
      photos,
      description:
        text(hotelText?.description) ||
        text(hotelText?.summary) ||
        text(data.description),
      facilities: uniqueStrings(
        [...regularFacilities, ...topBenefits, ...highlightStrip].flatMap((item) => {
          const facility = asRecord(item)
          return [facility?.translated_name, facility?.name, facility?.title, item]
        }),
      ),
      propertyType:
        text(data.accommodation_type_name) ||
        text(data.property_type) ||
        text(data.hotel_type) ||
        undefined,
      reviewScores: normalizeReviewScores(regularReviewScores),
      languages: uniqueStrings([
        ...stringArray(data.spoken_languages),
        ...stringArray(data.languages_spoken),
        ...stringArray(asRecord(data.languages_spoken)?.languagecode),
        ...stringArray(data.languages),
      ]),
      policies: regularPolicies,
      paymentMethods: stringArray(data.accepted_payment_methods || data.payment_methods),
      sustainability:
        text(data.sustainability_level) || text(data.sustainability_tier) || undefined,
      reviews: [],
      checkIn:
        text(checkIn?.fromTime) ||
        text(checkIn?.from) ||
        text(data.checkin_from) ||
        undefined,
      checkOut:
        text(checkOut?.untilTime) ||
        text(checkOut?.until) ||
        text(data.checkout_until) ||
        undefined,
      sourceUrl: text(data.url) || undefined,
    }
  }

  const basic = firstRecord(data.basicPropertyData)
  const location = asRecord(basic?.location)
  const id = String(basic?.id ?? '').trim()
  const name = text(basic?.name)
  const lat = number(location?.latitude)
  const lng = number(location?.longitude)
  if (!id || !name || lat == null || lng == null) return null

  const hotelPhotos = Array.isArray(data.hotelPhotos) ? data.hotelPhotos : []
  const photos = uniqueStrings(
    hotelPhotos.flatMap((item) => {
      const photo = asRecord(item)
      return [photo?.highres_url, photo?.large_url, photo?.thumb_url]
    }),
  )
  const propertyRows = Array.isArray(data.property) ? data.property : []
  const property =
    propertyRows
      .map(asRecord)
      .find((item) => String(item?.id ?? '') === id) || null
  const propertyReviews = asRecord(property?.reviews)
  const propertyReview = firstRecord(data.propertyReview)
  const totalScore = asRecord(propertyReview?.totalScore)
  const translation = firstRecord(data.hotelTranslation)
  const starRating = firstRecord(data.starRating)
  const featuredReviews = Array.isArray(data.featuredReview) ? data.featuredReview : []
  const facilities = Array.isArray(data.baseFacility) ? data.baseFacility : []
  const houseRules = asRecord(property?.houseRules)
  const profile = asRecord(property?.profile)
  const policies = asRecord(property?.policies)
  const petsPolicy = asRecord(policies?.pets)
  const checkinAgeRestriction = asRecord(houseRules?.checkinAgeRestriction)
  const smokingPolicy = asRecord(houseRules?.smoking)
  const quietHours = asRecord(houseRules?.quietHours)
  const partiesPolicy = asRecord(houseRules?.parties)
  const groupsPolicy = asRecord(houseRules?.groups)
  const paymentPolicy = asRecord(houseRules?.paymentMethods)
  const times = asRecord(houseRules?.checkinCheckoutTimes)
  const checkInRange = asRecord(times?.checkinTimeRange)
  const checkOutRange = asRecord(times?.checkoutTimeRange)
  const links = Array.isArray(data.link) ? data.link : []
  const sourceUrl = links
    .map(asRecord)
    .find((link) => text(link?.id) === 'property_page')
  const reviewQuestions = Array.isArray(propertyReviews?.questions)
    ? propertyReviews.questions
    : Array.isArray(propertyReview?.questions)
      ? propertyReview.questions
      : []
  const finePrints = Array.isArray(property?.finePrints) ? property.finePrints : []
  const acceptedCards = stringArray(data.acceptedCreditCard)
  const minAge = number(checkinAgeRestriction?.minCheckinAge)
  const propertyPolicies = uniqueStrings([
    ...finePrints,
    text(checkinAgeRestriction?.checkinAgeRestrictionPhrase) ||
      (minAge != null ? `最低入住年龄：${minAge} 岁` : ''),
    text(petsPolicy?.petsAllowed) === 'NO' ? '不允许携带宠物' : text(petsPolicy?.petsAllowed),
    text(smokingPolicy?.smokingNotAllowedAllRoomsPhrase),
    text(quietHours?.quietHoursPhrase),
    text(partiesPolicy?.partiesNotAllowedPhrase),
    text(groupsPolicy?.groupLimitPhrase),
    text(paymentPolicy?.hotelAcceptsCashStatus) === 'PATP_PROPERTY_DOES_NOT_ACCEPT_CASH'
      ? '住宿不接受现金付款'
      : '',
    text(translation?.finePrint),
  ])
  const accommodationType = asRecord(property?.accommodationType)
  const sustainabilityTier = firstRecord(data.propertySustainabilityTier)

  return {
    id,
    name,
    address:
      text(location?.formattedAddress) || text(location?.formattedAddressShort) || `${name}, Paris`,
    location: { lat, lng },
    rating: number(totalScore?.score) ?? number(propertyReviews?.score),
    reviewCount: number(totalScore?.reviewsCount) ?? number(propertyReviews?.reviewsCount),
    stars: number(starRating?.value),
    area: text(location?.city),
    image: photos[0],
    photos,
    description: text(translation?.description),
    facilities: uniqueStrings(
      facilities.flatMap((item) => {
        const facility = asRecord(item)
        const instances = Array.isArray(facility?.instances) ? facility.instances : []
        return instances.map((instance) => asRecord(instance)?.title)
      }),
    ),
    propertyType: text(accommodationType?.type) || undefined,
    reviewScores: normalizeReviewScores(reviewQuestions),
    languages: stringArray(profile?.spokenLanguages),
    policies: propertyPolicies,
    paymentMethods: acceptedCards,
    sustainability: text(sustainabilityTier?.type) || undefined,
    reviews: featuredReviews
      .map((item): BookingHotelReview | null => {
        const review = asRecord(item)
        const positive = text(review?.positiveText)
        const negative = text(review?.negativeText)
        if (!positive && !negative) return null
        return {
          text: positive || negative,
          negativeText: positive ? negative || undefined : undefined,
          rating: number(review?.averageScore),
          author: text(review?.guestName) || undefined,
          countryCode: text(review?.guestCountryCode) || undefined,
          completedAt: number(review?.completed),
        }
      })
      .filter((item): item is BookingHotelReview => Boolean(item))
      .slice(0, 8),
    checkIn: text(checkInRange?.fromFormatted) || undefined,
    checkOut: text(checkOutRange?.untilFormatted) || undefined,
    sourceUrl: text(sourceUrl?.url) || undefined,
  }
}

export function normalizeBookingFeaturedReviews(
  payload: unknown,
): BookingFeaturedReviews {
  const root = asRecord(payload)
  const data = asRecord(root?.data)
  const rawReviews = Array.isArray(data?.vpm_featured_reviews)
    ? data.vpm_featured_reviews
    : []
  const reviews = rawReviews.flatMap((value) => {
    const row = asRecord(value)
    if (!row) return []
    const author = asRecord(row.author)
    const relative = asRecord(row.relative_time)
    const title = decodeHtml(row.title)
    const pros = decodeHtml(row.pros)
    const cons = decodeHtml(row.cons)
    const body = uniqueStrings([title, pros]).join('\n')
    if (!body && !cons) return []
    const date = text(row.date) || text(relative?.date)
    const parsedDate = date ? Date.parse(date.replace(' ', 'T') + 'Z') : Number.NaN
    return [{
      text: body || '住客未填写正面评价',
      negativeText: cons || undefined,
      rating: number(row.average_score_out_of_10),
      author: text(author?.name) || undefined,
      countryCode: text(author?.countrycode) || undefined,
      completedAt: Number.isFinite(parsedDate)
        ? Math.floor(parsedDate / 1_000)
        : undefined,
    }]
  })
  return {
    title: text(data?.featured_reviews_title) || undefined,
    favorableCount: number(data?.vpm_favorable_review_count),
    reviews,
  }
}

export function peekBookingHotel(id?: string): BookingHotelRecord | null {
  if (!id) return null
  const memory = candidateMemory.get(id)
  if (memory) return memory
  const stored = getLlmArtifact<BookingHotelRecord>(candidateArtifactKey(id))
  if (stored?.id) {
    candidateMemory.set(id, stored)
    return stored
  }
  return null
}

export async function searchBookingHotelCandidates(input: {
  startDate: string
  endDate: string
  limit?: number
}): Promise<BookingHotelRecord[]> {
  const limit = Math.max(1, Math.min(100, input.limit || 20))
  const key = `${SEARCH_PREFIX}paris:${input.startDate}:${input.endDate}:${limit}`
  const cached = cachedValue<BookingHotelRecord[]>(key, SEARCH_TTL_MS)
  if (cached) {
    cached.forEach((record) => remember(record, true))
    return cached
  }
  const payload = await request<unknown>('stays/search-by-geo', {
    ...PARIS_BOUNDS,
    checkinDate: input.startDate,
    checkoutDate: input.endDate,
    resultsPerPage: String(limit),
    page: '1',
    rooms: '1',
    adults: '2',
    units: 'metric',
    languageCode: 'en-us',
    currencyCode: 'EUR',
  })
  const records = normalizeBookingSearchResponse(payload)
    .filter((hotel) => distanceMeters(PARIS, hotel.location) <= 30_000)
    .sort((a, b) =>
      (b.rating || 0) * 20 + Math.log10((b.reviewCount || 0) + 1) * 5 -
      ((a.rating || 0) * 20 + Math.log10((a.reviewCount || 0) + 1) * 5),
    )
    .slice(0, limit)
  records.forEach((record) => remember(record, true))
  setLlmArtifact(key, { value: records, fetchedAt: Date.now() })
  return records
}

export async function resolveBookingHotelIdentity(
  rawQuery: string,
): Promise<BookingHotelRecord | null> {
  const name = rawQuery.split(',')[0].trim()
  if (!name) return null
  const query = /\bparis\b/i.test(name) ? name : `${name} Paris`
  const key = `${IDENTITY_PREFIX}${query.toLowerCase()}`
  const cached = cachedValue<BookingHotelRecord | null>(key, DETAIL_TTL_MS)
  if (cached) {
    remember(cached, true)
    return cached
  }
  const payload = await request<unknown>('stays/auto-complete', {
    query,
    languageCode: 'en-us',
  })
  const identity = normalizeBookingHotelIdentityResponse(payload, query)
  if (identity) remember(identity, true)
  setLlmArtifact(key, { value: identity, fetchedAt: Date.now() })
  return identity
}

export async function fetchBookingHotelDetails(input: {
  id: string
  startDate: string
  endDate: string
}): Promise<BookingHotelRecord | null> {
  const key = `${DETAIL_PREFIX}${input.id}`
  const cached = cachedValue<BookingHotelRecord>(key, DETAIL_TTL_MS)
  if (cached) {
    remember(cached, true)
    return cached
  }
  const pending = detailInflight.get(key)
  if (pending) return pending
  const task = request<unknown>('stays/detail', {
    hotelId: input.id,
    checkinDate: input.startDate,
    checkoutDate: input.endDate,
    rooms: '1',
    adults: '2',
    units: 'metric',
    languageCode: 'en-us',
    currencyCode: 'EUR',
  })
    .then(normalizeBookingDetailResponse)
    .then((record) => {
      if (record) {
        const candidate = peekBookingHotel(input.id)
        const merged: BookingHotelRecord = candidate
          ? {
              ...candidate,
              ...record,
              rating: record.rating ?? candidate.rating,
              reviewCount: record.reviewCount ?? candidate.reviewCount,
              stars: record.stars ?? candidate.stars,
              image: record.image || candidate.image,
              photos: record.photos.length ? record.photos : candidate.photos,
              facilities: record.facilities.length
                ? record.facilities
                : candidate.facilities,
              reviews: record.reviews.length ? record.reviews : candidate.reviews,
              propertyType: record.propertyType || candidate.propertyType,
              reviewScores: record.reviewScores?.length
                ? record.reviewScores
                : candidate.reviewScores,
              languages: record.languages?.length ? record.languages : candidate.languages,
              policies: record.policies?.length ? record.policies : candidate.policies,
              paymentMethods: record.paymentMethods?.length
                ? record.paymentMethods
                : candidate.paymentMethods,
              sustainability: record.sustainability || candidate.sustainability,
              checkIn: record.checkIn || candidate.checkIn,
              checkOut: record.checkOut || candidate.checkOut,
              sourceUrl: record.sourceUrl || candidate.sourceUrl,
            }
          : record
        remember(merged)
        setLlmArtifact(key, { value: merged, fetchedAt: Date.now() })
        return merged
      }
      return record
    })
    .finally(() => detailInflight.delete(key))
  detailInflight.set(key, task)
  return task
}

export async function fetchBookingHotelFeaturedReviews(input: {
  id: string
}): Promise<BookingFeaturedReviews> {
  const key = `${FEATURED_REVIEWS_PREFIX}${input.id}`
  const cached = cachedValue<BookingFeaturedReviews>(key, DETAIL_TTL_MS)
  if (cached) return cached
  const pending = reviewInflight.get(key)
  if (pending) return pending
  const task = request<unknown>('stays/review-featured', {
    hotelId: input.id,
    languageCode: 'en-us',
  })
    .then(normalizeBookingFeaturedReviews)
    .then((result) => {
      setLlmArtifact(key, { value: result, fetchedAt: Date.now() })
      return result
    })
    .finally(() => reviewInflight.delete(key))
  reviewInflight.set(key, task)
  return task
}

export async function fetchBookingHotelPhotos(input: {
  id: string
}): Promise<string[]> {
  const id = input.id.trim()
  if (!id) return []
  const key = `${PHOTOS_PREFIX}${id}`
  const cached = cachedValue<string[]>(key, DETAIL_TTL_MS)
  if (cached) return cached
  const pending = photosInflight.get(key)
  if (pending) return pending
  const task = request<unknown>('stays/get-photos', { hotelId: id })
    .then(normalizeBookingPhotosResponse)
    .then((photos) => {
      if (photos.length) {
        setLlmArtifact(key, { value: photos, fetchedAt: Date.now() })
      }
      return photos
    })
    .finally(() => photosInflight.delete(key))
  photosInflight.set(key, task)
  return task
}

export function resetBookingHotelCacheForTests() {
  candidateMemory.clear()
  detailInflight.clear()
  photosInflight.clear()
  reviewInflight.clear()
}
