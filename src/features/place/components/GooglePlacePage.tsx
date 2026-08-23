import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  GalleryThumb,
  photoReferrerPolicy,
  photoSlideVariants,
} from './PlacePhotoGallery'
import { BottomSheet } from '../../../shared/components/BottomSheet'
import { glassModalSurfaceClass } from '../../../shared/styles/glassCapsule'
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Languages,
  MapPin,
  RefreshCw,
  RotateCw,
} from 'lucide-react'
import {
  fetchRapidApiGooglePhotoFallbackById,
  fetchRapidApiGooglePlaceDetailsById,
  invalidateRapidApiGooglePhotoFallback,
  peekGooglePlaceDetails,
  peekRapidApiGooglePhotoFallback,
  placeDetailsQuery,
  type GooglePlaceDetails,
} from '../../map/services/googlePlaceDetails'
import {
  fetchTripadvisorAttractionInfo,
  fetchTripadvisorPlaceGallery,
  fetchTripadvisorRestaurantInfo,
  hasCachedTripadvisorGallery,
  hasCachedTripadvisorRestaurantDetails,
  hasRememberedTripadvisorPlaceMiss,
  invalidateTripadvisorPlaceCache,
  peekTripadvisorAttractionInfo,
  peekTripadvisorPlacePhotos,
  peekTripadvisorRestaurantInfo,
  MAX_GALLERY_PHOTOS,
  type TripadvisorAttractionInfo,
} from '../services/tripadvisorPlacePhotos'
import { tripadvisorPlaceLoadingSlices } from '../services/tripadvisorPlaceLoading'
import { shouldFetchWebsiteGalleryFallback } from '../services/placeGalleryFallback'
import {
  nextGalleryPhotoIndex,
  pickPlaceGalleryPhotos,
} from '../services/placeGalleryPhotos'
import {
  fetchPlaceWebsitePhotosWithFallback,
  invalidatePlaceWebsitePhotosCache,
  peekCachedPlaceWebsitePhotos,
} from '../services/placeWebsitePhotos'
import { getGoogleMapsApiKey, googleMapsEmbedApiUrl } from '../../map/services/googleMapsKey'
import { isLlmConfigured } from '../../../shared/services/llm/llm'
import {
  looksChinese,
  peekPlaceNameZh,
  translatePlaceNameToChinese,
} from '../../chat/services/translate'
import type { Coordinates, PlaceType } from '../../../types'
import type { PlaceAdvisorFacts } from '../services/placeAdvisorFacts'
import { placeOriginalLabel, placeTitleLines } from '../../../shared/utils/placeTitle'
import { formatPriceLevelLabel } from '../../../shared/utils/priceLevel'
import { CloseIconButton } from '../../../shared/components/CloseIconButton'
import { GoogleReviewsList } from './GoogleReviewsList'
import { PlaceSourceMark } from './PlaceSourceMark'
import {
  placeSourceLabel,
  type PlaceInfoSource,
} from '../services/placeSource'
import { LoadingIndicator } from '../../../shared/components/LoadingIndicator'
import { ShimmerLines } from '../../../shared/components/ShimmerLines'
import { useTranslation } from '../../../shared/i18n'
import {
  fetchWikimediaPlacePhoto,
  peekWikimediaPlacePhoto,
  type WikimediaPlacePhoto,
} from '../../map/services/wikimediaPlacePhotos'
import {
  glassCapsuleSurfaceClass,
  glassCapsuleToneClass,
  glassHandleSurfaceClass,
  glassSageCardSurfaceClass,
} from '../../../shared/styles/glassCapsule'

const placeDetailCapsuleClass =
  `${glassCapsuleSurfaceClass} inline-flex items-center gap-1.5 px-3 py-1`

export interface LlmPlaceNarrative {
  intro?: string
  reason?: string
  tripFit?: string
  loading?: boolean
  /** `single` renders one paragraph (hotel advisor reason); default is multi-section. */
  variant?: 'single' | 'full'
  /** Customize section copy; defaults suit hotels, override for places. */
  labels?: {
    title?: string
    intro?: string
    reason?: string
    tripFit?: string
    loadingText?: string
    loadingMoreText?: string
  }
  /** When set, show a control to regenerate the saved LLM narrative. */
  onRegenerate?: () => void
  regenerating?: boolean
}

interface Props {
  open: boolean
  name: string
  nameLocal?: string
  googlePlaceId?: string
  /** Google facts captured before the detail page opens. */
  googleRating?: number
  googleRatingCount?: number
  googleAddress?: string
  /** Legacy fallback for saved places created before numeric Google facts. */
  googleRatingHint?: string
  tripadvisorContentId?: string
  location?: Coordinates
  placeType?: PlaceType
  fallbackImage?: string
  showMap?: boolean
  /** Booking-style gallery with lazy full album load on forward swipe. */
  galleryVariant?: 'carousel' | 'booking'
  /** Fired when user swipes forward at the last loaded Booking photo. */
  onBookingGalleryAdvance?: (nextIndex: number, loadedCount: number) => void
  bookingGalleryPhotosLoading?: boolean
  bookingGalleryPhotosError?: string | null
  /** True after the full Booking photo API has been fetched. */
  bookingPhotosFullyLoaded?: boolean
  /** Provider block renders rating/address; suppress generic summary above it. */
  providerOwnsSummary?: boolean
  /** Pre-resolved provider payload (used by Booking hotel details). */
  detailsOverride?: GooglePlaceDetails | null
  /** Never query Google Places when an alternate provider owns this record. */
  skipProviderLookup?: boolean
  reviewSourceLabel?: string
  /** Provider-specific facts inserted after the address. */
  providerDetails?: ReactNode
  /** Provider-owned lazy review UI. Suppresses the default review rendering. */
  reviewsSection?: ReactNode
  /** Optional LLM story block (used for hotel detail). */
  llmNarrative?: LlmPlaceNarrative | null
  /** Sticky footer (e.g. custom-hotel decision buttons). */
  footer?: ReactNode
  /** When true, backdrop / Esc call onClose (default true). */
  closeOnBackdrop?: boolean
  /** Overlay stacking class; default sits under AddPlaceDialog (z-2100). */
  overlayClassName?: string
  /**
   * Explicit stacking order (inline style). Prefer this when the overlay must
   * reliably sit above fixed chat/sheets — Tailwind arbitrary z-* on props can
   * be easy to miss visually when another fixed layer shares the viewport.
   */
  overlayZIndex?: number
  /** Persist a recovered Google identity in the owning trip record. */
  onDetailsResolved?: (details: GooglePlaceDetails) => void
  /** Listing facts for 行程顾问点评 once Google / Tripadvisor details settle. */
  onAdvisorFacts?: (facts: PlaceAdvisorFacts) => void
  onClose: () => void
}

function isUsablePhotoHttp(url: string): boolean {
  return (
    /^https?:\/\//i.test(url) &&
    !url.includes('places.googleapis.com') &&
    !url.includes('maps.googleapis.com/maps/api/place/photo')
  )
}

function googleRatingFromHint(value?: string): number | undefined {
  if (!value || !/google/i.test(value)) return undefined
  const match = value.match(/(?:^|\s|[≈★])([1-5](?:\.\d)?)(?:\s|$)/)
  const rating = match ? Number(match[1]) : Number.NaN
  return Number.isFinite(rating) ? rating : undefined
}

function mergePhotoUrls(current: string[], next: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const url of [...current, ...next]) {
    const identity = url.split('?')[0]
    if (!url || seen.has(identity)) continue
    seen.add(identity)
    out.push(url)
  }
  return out
}

function mergeTripadvisorInfo(
  current: TripadvisorAttractionInfo | null,
  next: TripadvisorAttractionInfo,
): TripadvisorAttractionInfo {
  if (!current || current.contentId !== next.contentId) return next
  return {
    ...current,
    ...next,
    photos:
      next.photos.length >= current.photos.length
        ? mergePhotoUrls(next.photos, current.photos)
        : mergePhotoUrls(current.photos, next.photos),
    reviews: next.reviews.length ? next.reviews : current.reviews,
    address: next.address || current.address,
    website: next.website || current.website,
    phone: next.phone || current.phone,
    description: next.description || current.description,
    priceLevel: next.priceLevel || current.priceLevel,
    cuisine: next.cuisine || current.cuisine,
    rating: next.rating ?? current.rating,
    userRatingCount: next.userRatingCount ?? current.userRatingCount,
    location: next.location || current.location,
  }
}

function tripadvisorHasFacts(info: TripadvisorAttractionInfo | null): boolean {
  return Boolean(
    info &&
      (info.rating != null ||
        info.address ||
        info.reviews.length ||
        info.priceLevel ||
        info.cuisine ||
        info.phone ||
        info.website),
  )
}

function tripadvisorHasDetailContent(
  info: TripadvisorAttractionInfo | null,
): boolean {
  return Boolean(info && (info.photos.length || tripadvisorHasFacts(info)))
}

function PlaceChipShimmer({ label }: { label: string }) {
  return (
    <span className={`${placeDetailCapsuleClass} ${glassCapsuleToneClass.neutral} text-[var(--stone)]`}>
      <span className="h-3 w-12 rounded-full day-tab-shimmer" aria-hidden />
      {label}
    </span>
  )
}

function PlaceReviewsShimmer() {
  return (
    <div className="space-y-2" aria-busy>
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <PlaceSourceMark source="tripadvisor" showLabel={false} />
        Tripadvisor 评论
      </p>
      {Array.from({ length: 2 }, (_, index) => (
        <article
          key={index}
          className="rounded-2xl border border-white/80 dark:border-white/10 bg-white/60 dark:bg-[#18201c]/80 p-3.5 text-sm shadow-sm backdrop-blur-md"
          aria-hidden
        >
          <span className="mb-2 block h-3.5 w-24 rounded-full day-tab-shimmer" />
          <ShimmerLines lines={3} />
        </article>
      ))}
    </div>
  )
}



function sourceFromPhotoUrl(url: string): PlaceInfoSource | null {
  const value = url.toLowerCase()
  if (value.includes('tripadvisor.com') || value.includes('media-cdn.tripadvisor')) {
    return 'tripadvisor'
  }
  if (
    value.includes('googleusercontent.com') ||
    value.includes('googleapis.com') ||
    value.includes('ggpht.com')
  ) {
    return 'google'
  }
  if (value.includes('bstatic.com') || value.includes('booking.com')) return 'booking'
  if (value.includes('wikimedia') || value.includes('wikipedia')) return 'wikimedia'
  return null
}

function resolvePhotoSource(input: {
  url: string
  galleryVariant?: 'carousel' | 'booking'
  websitePhotos: string[]
  tripadvisorPhotos: string[]
  googlePhotos: string[]
  wikimediaUrl?: string
}): PlaceInfoSource | null {
  const url = input.url
  if (!url) return null
  if (input.galleryVariant === 'booking') return 'booking'
  if (input.wikimediaUrl && url === input.wikimediaUrl) return 'wikimedia'
  if (input.websitePhotos.includes(url)) return 'website'
  if (input.tripadvisorPhotos.includes(url)) return 'tripadvisor'
  if (input.googlePhotos.includes(url)) return 'google'
  return sourceFromPhotoUrl(url)
}



function LlmNarrativeSingleBody({
  reason,
  loading,
  loadingLabel,
}: {
  reason?: string
  loading: boolean
  loadingLabel?: string
}) {
  const bodyRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState<number | null>(null)
  const showShimmer = loading && !reason
  const streaming = loading && Boolean(reason?.trim())

  useLayoutEffect(() => {
    const el = bodyRef.current
    if (!el) return
    if (streaming) {
      setHeight(null)
      return
    }

    const prevHeight = el.style.height
    el.style.height = 'auto'
    const nextHeight = Math.ceil(el.getBoundingClientRect().height)
    el.style.height = prevHeight

    setHeight((prev) => (prev === nextHeight ? prev : nextHeight))
  }, [reason, loading, showShimmer, streaming])

  return (
    <div
      ref={bodyRef}
      className={`llm-narrative-body ${streaming ? 'overflow-visible' : 'overflow-hidden'}`}
      style={height != null && !streaming ? { height } : undefined}
      aria-busy={loading || undefined}
    >
      {showShimmer ? (
        <div className="space-y-2" aria-hidden>
          <span className="block h-3.5 w-full rounded-full day-tab-shimmer" />
          <span className="block h-3.5 w-[92%] rounded-full day-tab-shimmer" />
          <span className="block h-3.5 w-[78%] rounded-full day-tab-shimmer" />
        </div>
      ) : reason ? (
        <p className="text-sm leading-relaxed text-[var(--ink)]/90">
          {reason}
          {streaming ? (
            <span
              className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[0.1em] animate-pulse bg-[var(--sage)] align-text-bottom"
              aria-hidden
            />
          ) : null}
        </p>
      ) : null}
      {showShimmer && loadingLabel ? (
        <span className="sr-only">{loadingLabel}</span>
      ) : null}
    </div>
  )
}

export function GooglePlacePage({
  open,
  name,
  nameLocal,
  googlePlaceId,
  googleRating,
  googleRatingCount,
  googleAddress,
  googleRatingHint,
  tripadvisorContentId,
  location,
  placeType,
  fallbackImage,
  showMap = true,
  galleryVariant = 'carousel',
  onBookingGalleryAdvance,
  bookingGalleryPhotosLoading = false,
  bookingGalleryPhotosError = null,
  bookingPhotosFullyLoaded = false,
  providerOwnsSummary = false,
  detailsOverride,
  skipProviderLookup = false,
  reviewSourceLabel = 'Google 评论',
  providerDetails,
  reviewsSection,
  llmNarrative,
  footer,
  closeOnBackdrop = true,
  overlayClassName = 'z-[2000]',
  overlayZIndex,
  onDetailsResolved,
  onAdvisorFacts,
  onClose,
}: Props) {
  const { t, locale } = useTranslation()
  const [details, setDetails] = useState<GooglePlaceDetails | null>(null)
  const [loading, setLoading] = useState(false)
  const [googleLookupReady, setGoogleLookupReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [photoIndex, setPhotoIndex] = useState(0)
  const [failedPhotos, setFailedPhotos] = useState<string[]>([])
  const [websitePhotos, setWebsitePhotos] = useState<string[]>([])
  const [websitePhotosResolved, setWebsitePhotosResolved] = useState(false)
  const [tripadvisorFallbackPhotos, setTripadvisorFallbackPhotos] = useState<string[]>([])
  const [tripadvisorFallbackResolved, setTripadvisorFallbackResolved] = useState(false)
  const [rapidApiPhotoFallbackUrl, setRapidApiPhotoFallbackUrl] = useState<string | null>(null)
  const [heroReady, setHeroReady] = useState(false)
  const pendingGalleryAdvanceRef = useRef<string | null>(null)
  const [wikimediaPhoto, setWikimediaPhoto] =
    useState<WikimediaPlacePhoto | null>(null)
  const [tripadvisorInfo, setTripadvisorInfo] =
    useState<TripadvisorAttractionInfo | null>(null)
  const [tripadvisorResolved, setTripadvisorResolved] = useState(false)
  const [tripadvisorDetailsResolved, setTripadvisorDetailsResolved] = useState(false)
  const [rapidApiFallbackLoading, setRapidApiFallbackLoading] = useState(false)
  const [rapidApiFallbackResolved, setRapidApiFallbackResolved] = useState(false)
  const [tripadvisorPhotosRefreshing, setTripadvisorPhotosRefreshing] = useState(false)
  const [tripadvisorRefreshVersion, setTripadvisorRefreshVersion] = useState(0)
  const tripadvisorPlaceKeyRef = useRef('')
  const [llmZh, setLlmZh] = useState<string | null>(null)
  /** idle = not finished; loading = in flight; done = success or gave up */
  const [nameZhPhase, setNameZhPhase] = useState<'idle' | 'loading' | 'done'>('idle')
  const [photoDirection, setPhotoDirection] = useState(0)
  const [isZoomed, setIsZoomed] = useState(false)
  const lastTapTime = useRef(0)
  const heroRef = useRef<HTMLDivElement | null>(null)
  const thumbRefs = useRef<(HTMLButtonElement | null)[]>([])
  const thumbScrollReadyRef = useRef(false)
  const onDetailsResolvedRef = useRef(onDetailsResolved)
  onDetailsResolvedRef.current = onDetailsResolved
  const onAdvisorFactsRef = useRef(onAdvisorFacts)
  onAdvisorFactsRef.current = onAdvisorFacts

  const query = placeDetailsQuery(name, nameLocal)
  const apiKey = getGoogleMapsApiKey()
  const embedSrc = googleMapsEmbedApiUrl(query, apiKey)
  const nameTranslateKey = `${name}|${nameLocal || ''}`
  const placeResetKey = `${nameTranslateKey}|${tripadvisorContentId || ''}|${googlePlaceId || ''}`
  const nameTranslateKeyRef = useRef(nameTranslateKey)
  const placeResetKeyRef = useRef(placeResetKey)
  if (nameTranslateKeyRef.current !== nameTranslateKey) {
    nameTranslateKeyRef.current = nameTranslateKey
    setLlmZh(null)
    setNameZhPhase('idle')
  }
  if (placeResetKeyRef.current !== placeResetKey) {
    placeResetKeyRef.current = placeResetKey
    setDetails(null)
    setLoading(false)
    setError(null)
    setGoogleLookupReady(false)
    setTripadvisorInfo(null)
    setTripadvisorResolved(false)
    setTripadvisorDetailsResolved(false)
    setRapidApiFallbackLoading(false)
    setRapidApiFallbackResolved(false)
    setTripadvisorPhotosRefreshing(false)
    setTripadvisorRefreshVersion(0)
    setTripadvisorFallbackPhotos([])
    setTripadvisorFallbackResolved(false)
    setRapidApiPhotoFallbackUrl(null)
    setWebsitePhotos([])
    setWebsitePhotosResolved(false)
    setFailedPhotos([])
    setHeroReady(false)
    setPhotoIndex(0)
  }

  const isAttraction = placeType === 'attraction'
  const needsTripadvisorFallback =
    !skipProviderLookup &&
    placeType !== 'attraction' &&
    placeType !== 'hotel' &&
    placeType !== 'transport'
  const tripadvisorRoute =
    !skipProviderLookup && (isAttraction || needsTripadvisorFallback)
  // Detail pages are cache-only for Google. Tripadvisor owns live facts and photos.
  const skipGoogleLookup = true
  const knownTripadvisorMiss =
    tripadvisorRoute &&
    hasRememberedTripadvisorPlaceMiss({
      name,
      nameLocal,
      type: placeType,
      contentId: tripadvisorContentId,
    })
  const tripadvisorMissing =
    tripadvisorRoute &&
    (knownTripadvisorMiss || tripadvisorDetailsResolved) &&
    !tripadvisorHasDetailContent(tripadvisorInfo)
  const rapidApiReviewFallbackNeeded =
    tripadvisorRoute &&
    (knownTripadvisorMiss || tripadvisorDetailsResolved) &&
    !(tripadvisorInfo?.reviews.length)
  const rapidApiFallbackActive = tripadvisorMissing
  const rapidApiReviewsActive = rapidApiReviewFallbackNeeded
  const displayNarrative = llmNarrative
  const tripadvisorCached = peekTripadvisorPlacePhotos(
    name,
    nameLocal,
    placeType,
    tripadvisorContentId,
  )
  const usableWebsitePhotos = websitePhotos.filter(
    (url) => isUsablePhotoHttp(url) && !failedPhotos.includes(url),
  )
  const restaurantTripadvisorAlbum = mergePhotoUrls(
    tripadvisorInfo?.photos || [],
    mergePhotoUrls(tripadvisorFallbackPhotos, tripadvisorCached),
  )
  const hasTripadvisorPhotos = restaurantTripadvisorAlbum.length > 0
  const tripadvisorPhotoLookupResolved =
    knownTripadvisorMiss ||
    (tripadvisorResolved && (isAttraction || tripadvisorFallbackResolved))
  const providerGalleryPhotos = pickPlaceGalleryPhotos({
    galleryVariant,
    bookingPhotos: details?.photos || [],
    websitePhotos: usableWebsitePhotos,
    tripadvisorPhotos: restaurantTripadvisorAlbum,
    tripadvisorResolved: tripadvisorPhotoLookupResolved,
  })
  const photoRefs =
    galleryVariant === 'booking'
      ? providerGalleryPhotos
      : providerGalleryPhotos.slice(0, MAX_GALLERY_PHOTOS)
  const googlePhotos = photoRefs.filter(
    (url) => isUsablePhotoHttp(url) && !failedPhotos.includes(url),
  )
  const survivingGoogle = googlePhotos.filter((url) => !failedPhotos.includes(url))
  const rawPhotos = survivingGoogle.length
    ? survivingGoogle
    : needsTripadvisorFallback
      ? rapidApiPhotoFallbackUrl
        ? [rapidApiPhotoFallbackUrl]
        : []
      : wikimediaPhoto?.url
        ? [wikimediaPhoto.url]
        : rapidApiPhotoFallbackUrl
          ? [rapidApiPhotoFallbackUrl]
          : fallbackImage
            ? [fallbackImage]
            : []
  const photos = rawPhotos.filter((url) => !failedPhotos.includes(url))
  const photosRef = useRef(photos)
  photosRef.current = photos
  const currentRef = photoRefs[photoIndex]
  const currentResolved =
    currentRef && isUsablePhotoHttp(currentRef) && !failedPhotos.includes(currentRef)
      ? currentRef
      : undefined
  const activePhoto =
    (currentResolved && !failedPhotos.includes(currentResolved)
      ? currentResolved
      : null) ||
    photos[0] ||
    (needsTripadvisorFallback
      ? ''
      : wikimediaPhoto?.url || fallbackImage || '')
  const websitePhotoCache = peekCachedPlaceWebsitePhotos({
    website: details?.website,
    name: details?.name || name,
    nameLocal: details?.nameOriginal || nameLocal,
    address: details?.address,
  })
  const tripadvisorPeekedId =
    tripadvisorContentId ||
    (isAttraction
      ? peekTripadvisorAttractionInfo(name, nameLocal, tripadvisorContentId)?.contentId
      : peekTripadvisorRestaurantInfo(name, nameLocal, tripadvisorContentId)?.contentId)
  const hasCachedTripadvisorAlbum = isAttraction
    ? hasCachedTripadvisorGallery(tripadvisorPeekedId)
    : hasCachedTripadvisorGallery(tripadvisorPeekedId, 'restaurant') ||
      hasCachedTripadvisorRestaurantDetails(tripadvisorPeekedId)
  const hasTripadvisorAlbum =
    hasCachedTripadvisorAlbum ||
    (tripadvisorFallbackResolved && tripadvisorFallbackPhotos.length > 0)
  const awaitingOfficialPhotos =
    galleryVariant !== 'booking' &&
    !skipGoogleLookup &&
    !isAttraction &&
    !tripadvisorRoute &&
    usableWebsitePhotos.length === 0 &&
    !websitePhotosResolved &&
    !websitePhotoCache.miss &&
    !hasTripadvisorAlbum
  const galleryPending =
    galleryVariant !== 'booking' &&
    (tripadvisorRoute
      ? (!tripadvisorPhotoLookupResolved && !hasTripadvisorPhotos) ||
        (tripadvisorPhotoLookupResolved &&
          !hasTripadvisorPhotos &&
          !websitePhotosResolved)
        : !skipGoogleLookup &&
          !hasTripadvisorAlbum &&
          !websitePhotosResolved)
  const awaitingTripadvisorPhotos =
    galleryPending && tripadvisorRoute
  const displayPhoto =
    awaitingOfficialPhotos || awaitingTripadvisorPhotos ? '' : activePhoto
  const photoSource = resolvePhotoSource({
    url: displayPhoto,
    galleryVariant,
    websitePhotos,
    tripadvisorPhotos: [
      ...(tripadvisorInfo?.photos || []),
      ...tripadvisorFallbackPhotos,
      ...tripadvisorCached,
    ],
    googlePhotos: details?.photos || [],
    wikimediaUrl: wikimediaPhoto?.url,
  })
  const factsSource: PlaceInfoSource | null =
    rapidApiFallbackActive
      ? details?.fullDetails
        ? 'google'
        : null
      : tripadvisorRoute
        ? tripadvisorHasFacts(tripadvisorInfo)
          ? 'tripadvisor'
          : null
        : details && !skipGoogleLookup
          ? 'google'
          : null
  const photoSourcesExhausted =
    galleryVariant !== 'booking' &&
    tripadvisorRoute &&
    tripadvisorPhotoLookupResolved &&
    websitePhotosResolved &&
    photos.length === 0
  const showPhotoRetry =
    galleryVariant !== 'booking' &&
    tripadvisorRoute &&
    !displayPhoto &&
    !awaitingOfficialPhotos &&
    !awaitingTripadvisorPhotos &&
    websitePhotosResolved &&
    tripadvisorDetailsResolved &&
    !rapidApiFallbackLoading
  const photoSectionReady =
    !galleryPending && Boolean(displayPhoto) && heroReady
  const showPhotoShimmer = !photoSourcesExhausted && !photoSectionReady
  const displayPhotoRef = useRef(displayPhoto)
  const heroImgRef = useRef<HTMLImageElement>(null)
  if (displayPhotoRef.current !== displayPhoto) {
    displayPhotoRef.current = displayPhoto
    setHeroReady(false)
  }
  const galleryLength = Math.max(photoRefs.length, photos.length)
  const showThumbStrip = galleryLength > 1
  const mapsPlaceId = details?.id || googlePlaceId?.replace(/^places\//, '').trim()
  const googleMapsPlaceUrl = mapsPlaceId
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        details?.nameOriginal || details?.name || query,
      )}&query_place_id=${encodeURIComponent(mapsPlaceId)}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`

  function stepPhoto(delta: number) {
    setIsZoomed(false)
    if (delta < 0) {
      if (galleryLength < 2) return
      setPhotoDirection(-1)
      setPhotoIndex((i) => (i - 1 + galleryLength) % galleryLength)
      return
    }

    if (
      galleryVariant === 'booking' &&
      onBookingGalleryAdvance &&
      !bookingPhotosFullyLoaded &&
      (photos.length <= 1 || photoIndex >= photos.length - 1)
    ) {
      pendingGalleryAdvanceRef.current = activePhoto
      onBookingGalleryAdvance(photoIndex + 1, photos.length)
      return
    }

    if (galleryLength < 2) return
    setPhotoDirection(1)
    setPhotoIndex((i) => (i + 1) % galleryLength)
  }

  function selectPhoto(index: number) {
    if (index === photoIndex) return
    setIsZoomed(false)
    setPhotoDirection(index > photoIndex ? 1 : -1)
    setPhotoIndex(index)
  }

  const showGalleryNav =
    photoRefs.length > 1 ||
    (galleryVariant === 'booking' &&
      !bookingPhotosFullyLoaded &&
      Boolean(onBookingGalleryAdvance))

  function refreshTripadvisorPhotos() {
    if (!tripadvisorRoute || tripadvisorPhotosRefreshing) return
    invalidateTripadvisorPlaceCache({
      name,
      nameLocal,
      type: placeType,
      contentId: tripadvisorContentId,
    })
    invalidatePlaceWebsitePhotosCache({
      website: tripadvisorInfo?.website || details?.website,
      name: details?.name || name,
      nameLocal: details?.nameOriginal || nameLocal,
      address: tripadvisorInfo?.address || googleAddress || details?.address,
    })
    invalidateRapidApiGooglePhotoFallback(googlePlaceId)
    setTripadvisorPhotosRefreshing(true)
    setTripadvisorInfo(null)
    setTripadvisorResolved(false)
    setTripadvisorDetailsResolved(false)
    setTripadvisorFallbackPhotos([])
    setTripadvisorFallbackResolved(false)
    setRapidApiPhotoFallbackUrl(null)
    setWebsitePhotos([])
    setWebsitePhotosResolved(false)
    setFailedPhotos([])
    setHeroReady(false)
    setPhotoIndex(0)
    setTripadvisorRefreshVersion((version) => version + 1)
  }

  useEffect(() => {
    if (!open || !isAttraction || !location) {
      setWikimediaPhoto(null)
      return
    }
    if (tripadvisorInfo?.photos.length || tripadvisorCached.length) {
      setWikimediaPhoto(null)
      return
    }
    const originalName = name.trim() || nameLocal?.trim() || ''
    if (!originalName) return
    const cached = peekWikimediaPlacePhoto(originalName, location)
    if (cached) {
      setWikimediaPhoto(cached)
      return
    }
    let cancelled = false
    void fetchWikimediaPlacePhoto(originalName, location).then((photo) => {
      if (!cancelled) setWikimediaPhoto(photo)
    })
    return () => {
      cancelled = true
    }
  }, [
    open,
    isAttraction,
    name,
    nameLocal,
    location,
    tripadvisorInfo?.photos.length,
    tripadvisorCached.length,
  ])

  useEffect(() => {
    setFailedPhotos([])
    setWebsitePhotos([])
    setWebsitePhotosResolved(false)
    setTripadvisorFallbackPhotos([])
    setTripadvisorFallbackResolved(false)
    setTripadvisorInfo(null)
    setTripadvisorResolved(false)
    setTripadvisorDetailsResolved(false)
    setRapidApiFallbackLoading(false)
    setRapidApiFallbackResolved(false)
    setDetails(null)
    setLoading(false)
    setError(null)
    setGoogleLookupReady(false)
    setHeroReady(false)
    setPhotoIndex(0)
    pendingGalleryAdvanceRef.current = null
  }, [open, name])

  useLayoutEffect(() => {
    const img = heroImgRef.current
    if (img?.complete && img.naturalWidth > 0) setHeroReady(true)
  }, [displayPhoto])

  useEffect(() => {
    if (!open || galleryVariant === 'booking' || !tripadvisorRoute) {
      setWebsitePhotosResolved(true)
      return
    }
    if (hasTripadvisorPhotos) {
      setWebsitePhotos([])
      setWebsitePhotosResolved(true)
      return
    }
    if (!tripadvisorPhotoLookupResolved) {
      setWebsitePhotosResolved(false)
      return
    }
    const officialWebsite = tripadvisorInfo?.website || details?.website
    const cached = peekCachedPlaceWebsitePhotos({
      website: officialWebsite,
      name: details?.name || name,
      nameLocal: details?.nameOriginal || nameLocal,
      address: tripadvisorInfo?.address || googleAddress || details?.address,
    })
    if (cached.photos.length) {
      setWebsitePhotos(cached.photos)
      setWebsitePhotosResolved(true)
      return
    }
    if (cached.miss) {
      setWebsitePhotos([])
      setWebsitePhotosResolved(true)
      return
    }
    if (
      !shouldFetchWebsiteGalleryFallback({
        usesTripadvisor: tripadvisorRoute,
        tripadvisorResolved: tripadvisorPhotoLookupResolved,
        usableTripadvisorPhotoCount: restaurantTripadvisorAlbum.length,
        hasCachedWebsiteResult: Boolean(cached.photos.length || cached.miss),
      })
    ) {
      setWebsitePhotosResolved(true)
      return
    }
    let cancelled = false
    setWebsitePhotosResolved(false)
    void fetchPlaceWebsitePhotosWithFallback({
      website: officialWebsite,
      name: details?.name || name,
      nameLocal: details?.nameOriginal || nameLocal,
      address: tripadvisorInfo?.address || googleAddress || details?.address,
    })
      .then((result) => {
        if (cancelled || !result.photos.length) return
        setWebsitePhotos(result.photos)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setWebsitePhotosResolved(true)
      })
    return () => {
      cancelled = true
    }
  }, [
    open,
    galleryVariant,
    tripadvisorRoute,
    tripadvisorPhotoLookupResolved,
    hasTripadvisorPhotos,
    restaurantTripadvisorAlbum.length,
    tripadvisorInfo?.website,
    tripadvisorInfo?.address,
    details?.website,
    details?.name,
    details?.nameOriginal,
    details?.address,
    name,
    nameLocal,
    googleAddress,
  ])

  useEffect(() => {
    if (!open || !needsTripadvisorFallback || galleryVariant === 'booking') {
      setTripadvisorFallbackResolved(true)
      return
    }
    const peeked = peekTripadvisorRestaurantInfo(
      details?.name || name,
      details?.nameOriginal || nameLocal,
      tripadvisorContentId,
    )
    const cachedPhotos = [
      peekTripadvisorPlacePhotos(name, nameLocal, placeType, tripadvisorContentId),
      peekTripadvisorPlacePhotos(
        details?.name || name,
        details?.nameOriginal || nameLocal,
        placeType,
        tripadvisorContentId,
      ),
    ].find((photos) => photos.length) || []
    const hasCachedAlbum =
      hasCachedTripadvisorRestaurantDetails(peeked?.contentId) ||
      hasCachedTripadvisorGallery(peeked?.contentId, 'restaurant')
    if (cachedPhotos.length) {
      setTripadvisorFallbackPhotos(cachedPhotos)
      setTripadvisorFallbackResolved(true)
      return
    }
    if (hasCachedAlbum) {
      setTripadvisorFallbackResolved(true)
      return
    }
    let cancelled = false
    setTripadvisorFallbackResolved(false)
    void fetchTripadvisorPlaceGallery({
      name: details?.name || name,
      nameLocal: details?.nameOriginal || nameLocal || name,
      type: placeType === 'cafe' ? 'cafe' : 'restaurant',
      contentId: tripadvisorContentId,
      address: details?.address,
    })
      .then((gallery) => {
        if (cancelled || !gallery?.photos.length) return
        setTripadvisorFallbackPhotos(gallery.photos)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setTripadvisorFallbackResolved(true)
      })
    return () => {
      cancelled = true
    }
  }, [
    open,
    needsTripadvisorFallback,
    details?.name,
    details?.nameOriginal,
    details?.address,
    name,
    nameLocal,
    placeType,
    tripadvisorContentId,
    galleryVariant,
  ])

  useEffect(() => {
    const requestedFrom = pendingGalleryAdvanceRef.current
    const loadedPhotos = photosRef.current
    if (!requestedFrom || loadedPhotos.length < 1) return
    pendingGalleryAdvanceRef.current = null
    setPhotoIndex(
      nextGalleryPhotoIndex({
        photos: loadedPhotos,
        currentPhoto: requestedFrom,
      }),
    )
  }, [details?.photos])

  useEffect(() => {
    if (!open) {
      thumbScrollReadyRef.current = false
      return
    }
    if (!thumbScrollReadyRef.current) {
      thumbScrollReadyRef.current = true
      return
    }
    thumbRefs.current[photoIndex]?.scrollIntoView({
      inline: 'center',
      block: 'nearest',
      behavior: 'smooth',
    })
  }, [open, photoIndex])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && closeOnBackdrop) {
        onClose()
        return
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        stepPhoto(-1)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        stepPhoto(1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onClose, closeOnBackdrop, photos.length])

  useEffect(() => {
    if (open) return
    setIsZoomed(false)
  }, [open])

  useEffect(() => {
    if (!open) return
    const queryLocation =
      location?.lat != null && location?.lng != null
        ? { lat: location.lat, lng: location.lng }
        : undefined
    const cached =
      detailsOverride ||
      peekGooglePlaceDetails(name, nameLocal, queryLocation, googlePlaceId)
    setDetails(cached || null)
    setLoading(false)
    setError(null)
    setPhotoIndex(0)
    setGoogleLookupReady(true)
    if (cached) onDetailsResolvedRef.current?.(cached)
  }, [open, name, nameLocal, googlePlaceId, location?.lat, location?.lng, detailsOverride])

  // Final RapidAPI Google Place fallback — fires once when Tripadvisor and the
  // official site have no usable photo and we know the place_id.
  useEffect(() => {
    if (!open) return
    if (galleryVariant === 'booking') return
    if (!tripadvisorRoute) return
    if (!googlePlaceId) return
    if (rapidApiPhotoFallbackUrl !== null) return
    if (
      !tripadvisorResolved ||
      !websitePhotosResolved ||
      !tripadvisorFallbackResolved ||
      !tripadvisorDetailsResolved
    ) {
      return
    }
    const tripadvisorPhotos = [
      ...(tripadvisorInfo?.photos || []),
      ...tripadvisorFallbackPhotos,
    ]
    if (tripadvisorPhotos.length) return
    if (usableWebsitePhotos.length) return
    const cached = peekRapidApiGooglePhotoFallback(googlePlaceId)
    if (cached) {
      setRapidApiPhotoFallbackUrl(cached)
      return
    }
    let cancelled = false
    void fetchRapidApiGooglePhotoFallbackById(googlePlaceId)
      .then((url) => {
        if (cancelled) return
        setRapidApiPhotoFallbackUrl(url)
      })
      .catch(() => {
        if (!cancelled) setRapidApiPhotoFallbackUrl(null)
      })
    return () => {
      cancelled = true
    }
  }, [
    open,
    galleryVariant,
    tripadvisorRoute,
    googlePlaceId,
    tripadvisorResolved,
    websitePhotosResolved,
    tripadvisorFallbackResolved,
    tripadvisorDetailsResolved,
    tripadvisorInfo?.photos,
    tripadvisorFallbackPhotos,
    usableWebsitePhotos,
    rapidApiPhotoFallbackUrl,
  ])

  useEffect(() => {
    if (!open) {
      setTripadvisorInfo(null)
      setTripadvisorResolved(true)
      setTripadvisorDetailsResolved(true)
      setTripadvisorPhotosRefreshing(false)
      return
    }
    if (isAttraction) {
      const peeked = peekTripadvisorAttractionInfo(
        name,
        nameLocal,
        tripadvisorContentId,
      )
      if (peeked) setTripadvisorInfo(peeked)
      const galleryReady = Boolean(
        peeked && hasCachedTripadvisorGallery(peeked.contentId),
      )
      if (galleryReady && peeked?.reviews.length) {
        setTripadvisorResolved(true)
        setTripadvisorDetailsResolved(true)
        setTripadvisorPhotosRefreshing(false)
        return
      }
      setTripadvisorResolved(galleryReady)
      setTripadvisorDetailsResolved(false)
      let cancelled = false
      void fetchTripadvisorAttractionInfo({
        name,
        nameLocal,
        contentId: tripadvisorContentId,
      })
        .then((result) => {
          if (!cancelled && result) setTripadvisorInfo(result)
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) {
            setTripadvisorResolved(true)
            setTripadvisorDetailsResolved(true)
            setTripadvisorPhotosRefreshing(false)
          }
        })
      return () => {
        cancelled = true
      }
    }
    if (!needsTripadvisorFallback) {
      setTripadvisorResolved(true)
      setTripadvisorDetailsResolved(true)
      setTripadvisorPhotosRefreshing(false)
      return
    }
    const peeked = peekTripadvisorRestaurantInfo(
      name,
      nameLocal,
      tripadvisorContentId,
    )
    if (peeked) {
      setTripadvisorInfo(peeked)
      if (peeked.photos.length) {
        setTripadvisorFallbackPhotos(peeked.photos)
        setTripadvisorFallbackResolved(true)
      }
    }
    if (hasCachedTripadvisorRestaurantDetails(peeked?.contentId)) {
      setTripadvisorResolved(true)
      setTripadvisorFallbackResolved(true)
      setTripadvisorDetailsResolved(true)
      setTripadvisorPhotosRefreshing(false)
      return
    }
    setTripadvisorResolved(false)
    setTripadvisorDetailsResolved(false)
    const expectedKey = `${name}|${nameLocal || ''}|${tripadvisorContentId || ''}`
    tripadvisorPlaceKeyRef.current = expectedKey
    let cancelled = false
    const applyTripadvisor = (info: TripadvisorAttractionInfo) => {
      if (cancelled || tripadvisorPlaceKeyRef.current !== expectedKey) return
      setTripadvisorInfo((current) => mergeTripadvisorInfo(current, info))
      if (info.photos.length) {
        setTripadvisorFallbackPhotos((current) => mergePhotoUrls(current, info.photos))
        setTripadvisorFallbackResolved(true)
      }
    }
    void fetchTripadvisorRestaurantInfo({
      name,
      nameLocal,
      contentId: tripadvisorContentId,
      address: googleAddress || details?.address,
      onPreview: (preview) => {
        if (cancelled) return
        if (!preview.photos.length && !tripadvisorHasFacts(preview)) return
        applyTripadvisor(preview)
      },
      onDetails: (info) => {
        if (cancelled || tripadvisorPlaceKeyRef.current !== expectedKey) return
        if (info) applyTripadvisor(info)
        setTripadvisorDetailsResolved(true)
      },
    })
      .then((result) => {
        if (!cancelled && result) applyTripadvisor(result)
      })
      .catch(() => {})
      .finally(() => {
        if (cancelled || tripadvisorPlaceKeyRef.current !== expectedKey) return
        setTripadvisorResolved(true)
        setTripadvisorFallbackResolved(true)
        setTripadvisorPhotosRefreshing(false)
      })
    return () => {
      cancelled = true
    }
  }, [
    open,
    isAttraction,
    needsTripadvisorFallback,
    googleAddress,
    details?.address,
    name,
    nameLocal,
    tripadvisorContentId,
    tripadvisorRefreshVersion,
  ])

  useEffect(() => {
    if (!open) {
      setRapidApiFallbackLoading(false)
      setRapidApiFallbackResolved(false)
      return
    }
    if (!rapidApiReviewFallbackNeeded) {
      setRapidApiFallbackLoading(false)
      setRapidApiFallbackResolved(tripadvisorDetailsResolved)
      return
    }
    const placeId = googlePlaceId?.trim()
    if (!placeId) {
      setRapidApiFallbackLoading(false)
      setRapidApiFallbackResolved(true)
      return
    }

    let cancelled = false
    setRapidApiFallbackLoading(true)
    setRapidApiFallbackResolved(false)
    void fetchRapidApiGooglePlaceDetailsById(placeId, query)
      .then((result) => {
        if (cancelled || !result) return
        setDetails(result)
        onDetailsResolvedRef.current?.(result)
      })
      .catch(() => {})
      .finally(() => {
        if (cancelled) return
        setRapidApiFallbackLoading(false)
        setRapidApiFallbackResolved(true)
      })

    return () => {
      cancelled = true
    }
  }, [
    open,
    rapidApiReviewFallbackNeeded,
    tripadvisorDetailsResolved,
    googlePlaceId,
    query,
  ])

  // When Google / trip data has no Chinese display name, LLM-translate the original.
  useEffect(() => {
    if (!open || locale !== 'zh-CN') {
      setLlmZh(null)
      setNameZhPhase(open ? 'done' : 'idle')
      return
    }

    const base = placeTitleLines(
      name,
      nameLocal,
      details?.name,
      details?.nameOriginal,
      undefined,
      { locale },
    )
    if (looksChinese(base.title)) {
      setLlmZh(null)
      setNameZhPhase('done')
      return
    }
    if (!isLlmConfigured()) {
      setLlmZh(null)
      setNameZhPhase('done')
      return
    }

    const original = placeOriginalLabel(
      name,
      nameLocal,
      details?.name,
      details?.nameOriginal,
    )
    const cached = peekPlaceNameZh(original)
    if (cached && looksChinese(cached)) {
      setLlmZh(cached)
      setNameZhPhase('done')
      return
    }

    // Reserve the Chinese title slot immediately — don't flash the English name first.
    setLlmZh(null)
    setNameZhPhase('loading')
    let cancelled = false
    void translatePlaceNameToChinese(original, {
      onPartial: (partial) => {
        if (cancelled || !partial.trim()) return
        setLlmZh(partial)
      },
    })
      .then((zh) => {
        if (cancelled) return
        setLlmZh(zh)
        setNameZhPhase('done')
      })
      .catch(() => {
        if (!cancelled) {
          setLlmZh(null)
          setNameZhPhase('done')
        }
      })
    return () => {
      cancelled = true
    }
  }, [open, name, nameLocal, details?.name, details?.nameOriginal, locale])

  const advisorReviews = useMemo(
    () =>
      rapidApiReviewsActive
        ? details?.reviews || []
        : tripadvisorRoute
          ? tripadvisorInfo?.reviews || []
          : details?.reviews || [],
    [
      details?.reviews,
      rapidApiReviewsActive,
      tripadvisorInfo?.reviews,
      tripadvisorRoute,
    ],
  )
  const advisorFactsSettled = rapidApiReviewFallbackNeeded
    ? rapidApiFallbackResolved
    : tripadvisorRoute
      ? tripadvisorDetailsResolved
      : googleLookupReady && !loading
  const advisorReviewsKey = advisorReviews
    .slice(0, 6)
    .map((review) => `${review.rating ?? ''}:${review.text.slice(0, 80)}`)
    .join('|')

  useEffect(() => {
    if (!open) return
    const cb = onAdvisorFactsRef.current
    if (!cb) return
    cb({
      // Prefer the concise Google address captured during itinerary generation.
      // Tripadvisor sometimes appends entrance/access instructions to its
      // address field, which should only be a last-resort fallback.
      address: googleAddress || details?.address || tripadvisorInfo?.address,
      description: rapidApiFallbackActive
        ? details?.summary
        : tripadvisorRoute
          ? tripadvisorInfo?.description || details?.summary
          : details?.summary || tripadvisorInfo?.description,
      rating: rapidApiFallbackActive
        ? details?.rating
        : tripadvisorRoute
          ? tripadvisorInfo?.rating
          : details?.rating,
      reviewCount: rapidApiFallbackActive
        ? details?.userRatingCount
        : tripadvisorRoute
          ? tripadvisorInfo?.userRatingCount
          : details?.userRatingCount,
      priceLevel:
        (rapidApiFallbackActive
          ? details?.priceLevel
          : tripadvisorRoute
            ? tripadvisorInfo?.priceLevel
            : details?.priceLevel) ||
        tripadvisorInfo?.priceLevel ||
        details?.priceLevel,
      cuisine: tripadvisorInfo?.cuisine,
      reviews: advisorReviews.slice(0, 6).map((review) => ({
        text: review.text,
        rating: review.rating,
        author: review.author,
      })),
      settled: advisorFactsSettled,
    })
  }, [
    open,
    advisorFactsSettled,
    advisorReviews,
    advisorReviewsKey,
    rapidApiFallbackActive,
    rapidApiReviewFallbackNeeded,
    rapidApiReviewsActive,
    rapidApiFallbackResolved,
    tripadvisorRoute,
    tripadvisorInfo?.address,
    tripadvisorInfo?.description,
    tripadvisorInfo?.rating,
    tripadvisorInfo?.userRatingCount,
    tripadvisorInfo?.priceLevel,
    tripadvisorInfo?.cuisine,
    details?.address,
    details?.summary,
    details?.rating,
    details?.userRatingCount,
    details?.priceLevel,
    googleAddress,
  ])

  const originalLabel = placeOriginalLabel(
    name,
    nameLocal,
    details?.name,
    details?.nameOriginal,
  )
  const official = placeTitleLines(
    name,
    nameLocal,
    details?.name,
    details?.nameOriginal,
    undefined,
    { locale },
  )
  const cachedZh = locale === 'zh-CN' ? peekPlaceNameZh(originalLabel) : null
  const effectiveLlmZh =
    locale === 'zh-CN'
      ? llmZh ||
        (cachedZh && looksChinese(cachedZh) ? cachedZh : null) ||
        null
      : null
  const needsLlmZh = locale === 'zh-CN' && !looksChinese(official.title) && isLlmConfigured()
  // Empty Chinese slot + translate animation until first streamed chars (or done).
  const showNameLoader = needsLlmZh && !effectiveLlmZh && nameZhPhase !== 'done'
  const nameStreaming = nameZhPhase === 'loading' && Boolean(effectiveLlmZh)

  const resolved = placeTitleLines(
    name,
    nameLocal,
    details?.name,
    details?.nameOriginal,
    effectiveLlmZh || undefined,
    { locale },
  )
  // While streaming, prefer the live partial even before placeTitleLines accepts it as CJK.
  const title = showNameLoader
    ? ''
    : nameStreaming && llmZh?.trim()
      ? llmZh.trim()
      : resolved.title
  const subtitle =
    showNameLoader || nameStreaming ? originalLabel : resolved.subtitle
  const titleIsLlmTranslated = Boolean(
    resolved.titleIsLlmTranslated && nameZhPhase === 'done',
  )
  const dialogLabel = showNameLoader
    ? `正在翻译「${originalLabel}」`
    : `${title || originalLabel} ${t('place.placeDetailsLabel')}`
  const priceLevelLabel = formatPriceLevelLabel(
    isAttraction
      ? undefined
      : rapidApiFallbackActive
        ? details?.priceLevel
        : tripadvisorInfo?.priceLevel || details?.priceLevel,
    locale,
  )
  const displayCuisine =
    isAttraction || rapidApiFallbackActive ? undefined : tripadvisorInfo?.cuisine
  const cachedGoogleRating =
    googleRating ?? details?.rating ?? googleRatingFromHint(googleRatingHint)
  const cachedGoogleRatingCount =
    googleRatingCount ?? details?.userRatingCount
  const displayRating = rapidApiFallbackActive ? undefined : tripadvisorInfo?.rating
  const displayRatingCount = rapidApiFallbackActive
    ? undefined
    : tripadvisorInfo?.userRatingCount
  const displayAddress =
    googleAddress ||
    details?.address ||
    tripadvisorInfo?.address
  const displayPhone = rapidApiFallbackActive
    ? details?.phone
    : tripadvisorInfo?.phone || details?.phone
  const displayWebsite = rapidApiFallbackActive
    ? details?.website
    : tripadvisorInfo?.website || details?.website
  const displayReviews = rapidApiReviewsActive
    ? details?.reviews || []
    : tripadvisorInfo?.reviews || []
  const tripadvisorLoading = tripadvisorPlaceLoadingSlices({
    detailsResolved: tripadvisorDetailsResolved,
    photoCount: galleryLength,
    hasRating: displayRating != null,
    hasPrice: Boolean(priceLevelLabel),
    hasCuisine: Boolean(displayCuisine),
    hasAddress: Boolean(displayAddress),
    reviewCount: displayReviews.length,
    expectPrice: !isAttraction,
    expectCuisine: !isAttraction,
  })
  const showMorePhotoShimmer =
    tripadvisorRoute &&
    Boolean(displayPhoto) &&
    heroReady &&
    tripadvisorLoading.morePhotos
  const showBookingPhotoShimmer =
    galleryVariant === 'booking' &&
    bookingGalleryPhotosLoading &&
    Boolean(displayPhoto)
  const showInitialThumbShimmer =
    galleryVariant !== 'booking' && showPhotoShimmer
  const showThumbRegion =
    showThumbStrip ||
    showInitialThumbShimmer ||
    showMorePhotoShimmer ||
    showBookingPhotoShimmer
  const animateGalleryThumbs =
    galleryVariant !== 'booking' || bookingPhotosFullyLoaded
  const showTripadvisorChipShimmer =
    !providerOwnsSummary &&
    tripadvisorRoute &&
    (tripadvisorLoading.rating ||
      tripadvisorLoading.price ||
      tripadvisorLoading.cuisine)
  const showTripadvisorAddressShimmer =
    !providerOwnsSummary && tripadvisorRoute && tripadvisorLoading.address
  const showTripadvisorReviewsShimmer =
    reviewsSection === undefined &&
    ((rapidApiReviewsActive && rapidApiFallbackLoading) ||
      (tripadvisorRoute && !rapidApiReviewsActive && tripadvisorLoading.reviews))
  const reviewsBlock =
    reviewsSection !== undefined
      ? reviewsSection
      : displayReviews.length
        ? (
            <GoogleReviewsList
              reviews={displayReviews}
              sourceLabel={
                rapidApiReviewsActive
                  ? t('place.googleReviews')
                  : tripadvisorRoute
                    ? t('place.tripadvisorReviews')
                    : (reviewSourceLabel || t('place.reviews'))
              }
              source={
                rapidApiReviewsActive
                  ? 'google'
                  : tripadvisorRoute
                    ? 'tripadvisor'
                    : 'google'
              }
            />
          )
        : showTripadvisorReviewsShimmer
          ? <PlaceReviewsShimmer />
          : null

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      overlayZIndex={overlayZIndex ?? 2000}
      overlayClassName={overlayClassName}
      closeOnBackdrop={closeOnBackdrop}
      ariaLabel={dialogLabel}
      containerProps={{
        'data-google-place-page': '1',
        'data-pending-place-confirm': footer ? '1' : undefined,
      }}
      className={`flex max-h-[min(75dvh,calc(100dvh-2rem))] max-w-3xl flex-col overflow-hidden rounded-t-3xl ${glassModalSurfaceClass} sm:rounded-3xl`}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--mist)] px-4 py-3">
          <div className="min-w-0 pr-3">
            <div className="flex min-h-[2rem] flex-wrap items-center gap-2">
              {showNameLoader ? (
                <LoadingIndicator
                  thinkingLabel="正在翻译名称…"
                  generatingLabel="正在翻译名称…"
                  mode="thinking"
                  task="translate"
                  userText={originalLabel}
                  size="sm"
                  showDots
                  className="font-display text-2xl leading-tight"
                />
              ) : (
                <h3 className="font-display text-2xl leading-tight">
                  {title}
                  {nameStreaming ? (
                    <span
                      className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[0.1em] animate-pulse bg-[var(--sage)] align-text-bottom"
                      aria-hidden
                    />
                  ) : null}
                </h3>
              )}
              {titleIsLlmTranslated && (
                <span
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--mist)] text-[var(--stone)]"
                  title={t('place.aiTranslatedName')}
                  aria-label={t('place.aiTranslatedName')}
                >
                  <Languages size={14} strokeWidth={1.75} aria-hidden />
                </span>
              )}
            </div>
            {subtitle && (
              <p className="text-sm text-[var(--stone)]">{subtitle}</p>
            )}
          </div>
          <CloseIconButton onClick={onClose} className="hidden sm:flex mt-0.5" />
        </div>

        <div
          className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
          aria-busy={
            loading ||
            rapidApiFallbackLoading ||
            (isAttraction && !tripadvisorResolved && !tripadvisorInfo) ||
            (tripadvisorRoute && !tripadvisorDetailsResolved) ||
            undefined
          }
        >
          {error && <p className="text-sm text-amber-800">{error}</p>}

          {(displayPhoto ||
            awaitingOfficialPhotos ||
            awaitingTripadvisorPhotos ||
            (!needsTripadvisorFallback && Boolean(fallbackImage))) && (
            <div className="space-y-2">
              <div className="grid grid-rows-[1fr] opacity-100">
              <div className="min-h-0 overflow-hidden">
              <div
                ref={heroRef}
                className="relative h-[min(56vw,14rem)] overflow-hidden rounded-2xl bg-[var(--mist)] select-none [touch-action:pan-y] sm:h-72"
                aria-busy={showPhotoShimmer || undefined}
              >
                <span
                  className={`absolute inset-0 z-[2] place-hero-shimmer motion-safe:transition-opacity motion-safe:duration-300 ${
                    showPhotoShimmer ? 'opacity-100' : 'pointer-events-none opacity-0'
                  }`}
                  aria-hidden
                />
                <AnimatePresence initial={false} custom={photoDirection}>
                  {displayPhoto ? (
                    <motion.div
                      key={displayPhoto}
                      custom={photoDirection}
                      variants={photoSlideVariants}
                      initial="enter"
                      animate="center"
                      exit="exit"
                      transition={{
                        x: { type: 'spring', stiffness: 340, damping: 32, mass: 0.6 },
                        opacity: { duration: 0.2 },
                        scale: { duration: 0.2 },
                      }}
                      drag={showGalleryNav && galleryLength > 1 ? 'x' : false}
                      dragConstraints={{ left: 0, right: 0 }}
                      dragElastic={0.22}
                      dragDirectionLock
                      onDragEnd={(_, { offset, velocity }) => {
                        if (offset.x < -45 || velocity.x < -300) {
                          stepPhoto(1)
                        } else if (offset.x > 45 || velocity.x > 300) {
                          stepPhoto(-1)
                        }
                      }}
                      className="absolute inset-0 flex h-full w-full select-none items-center justify-center cursor-grab active:cursor-grabbing"
                    >
                      <img
                        src={displayPhoto}
                        alt=""
                        aria-hidden
                        className={`pointer-events-none absolute inset-0 h-full w-full scale-125 object-cover blur-2xl motion-safe:transition-opacity motion-safe:duration-300 ${
                          heroReady ? 'opacity-80' : 'opacity-0'
                        }`}
                        referrerPolicy={photoReferrerPolicy(displayPhoto)}
                        draggable={false}
                      />
                      <span
                        className={`pointer-events-none absolute inset-0 bg-white/25 motion-safe:transition-opacity motion-safe:duration-300 ${
                          heroReady ? 'opacity-100' : 'opacity-0'
                        }`}
                        aria-hidden
                      />
                      <motion.img
                        ref={heroImgRef}
                        src={displayPhoto}
                        alt={details?.name || name}
                        animate={{ scale: isZoomed ? 2 : 1 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                        onDoubleClick={() => setIsZoomed((z) => !z)}
                        onTouchEnd={(e) => {
                          const now = Date.now()
                          if (now - lastTapTime.current < 280) {
                            e.preventDefault()
                            setIsZoomed((z) => !z)
                          }
                          lastTapTime.current = now
                        }}
                        className={`relative z-[1] h-full w-full object-contain pointer-events-none select-none motion-safe:transition-opacity motion-safe:duration-300 ${
                          heroReady ? 'opacity-100' : 'opacity-0'
                        }`}
                        referrerPolicy={photoReferrerPolicy(displayPhoto)}
                        draggable={false}
                        fetchPriority="high"
                        decoding="async"
                        onLoad={() => setHeroReady(true)}
                        onError={() =>
                          setFailedPhotos((current) =>
                            current.includes(displayPhoto)
                              ? current
                              : [...current, displayPhoto],
                          )
                        }
                      />
                    </motion.div>
                  ) : null}
                </AnimatePresence>
                {wikimediaPhoto && displayPhoto === wikimediaPhoto.url && heroReady && (
                  <a
                    href={wikimediaPhoto.sourcePage}
                    target="_blank"
                    rel="noreferrer"
                    className="absolute bottom-2 left-2 z-10 max-w-[70%] truncate rounded-full bg-black/50 px-2 py-1 text-[10px] text-white backdrop-blur-sm hover:bg-black/65"
                    title={`${wikimediaPhoto.attribution || 'Wikimedia Commons'}${wikimediaPhoto.license ? ` · ${wikimediaPhoto.license}` : ''}`}
                  >
                    {t('place.photoAttributionPrefix')}{wikimediaPhoto.attribution || 'Wikimedia Commons'}
                    {wikimediaPhoto.license ? ` · ${wikimediaPhoto.license}` : ''}
                  </a>
                )}
                {photoSource &&
                  photoSource !== 'wikimedia' &&
                  displayPhoto &&
                  heroReady && (
                    <span
                      className="absolute bottom-2 left-2 z-10"
                      aria-label={t('place.photoFromAttribution', { source: placeSourceLabel(photoSource, locale) })}
                    >
                      <PlaceSourceMark source={photoSource} onPhoto />
                    </span>
                  )}
                {showGalleryNav && (
                  <>
                    <button
                      type="button"
                      aria-label={t('place.photoPrev')}
                      onClick={() => stepPhoto(-1)}
                      disabled={galleryLength < 2}
                      className="absolute left-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition-opacity hover:bg-black/65 active:scale-95 disabled:pointer-events-none disabled:opacity-0"
                    >
                      <ChevronLeft size={16} strokeWidth={2.2} aria-hidden />
                    </button>
                    <button
                      type="button"
                      aria-label={t('place.photoNext')}
                      onClick={() => stepPhoto(1)}
                      disabled={bookingGalleryPhotosLoading}
                      className="absolute right-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition-opacity hover:bg-black/65 active:scale-95 disabled:opacity-60"
                    >
                      <ChevronRight size={16} strokeWidth={2.2} aria-hidden />
                    </button>
                    <div className="absolute bottom-2.5 right-2.5 z-10 flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-0.5 text-[11px] font-medium text-white shadow-sm backdrop-blur-md">
                      <motion.span
                        key={photoIndex}
                        initial={{ opacity: 0.3, y: photoDirection >= 0 ? 3 : -3 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.15 }}
                        className="tabular-nums font-semibold"
                      >
                        {photoIndex + 1}
                      </motion.span>
                      <span className="opacity-60">/</span>
                      <span className="tabular-nums opacity-80">{galleryLength}</span>
                      {galleryVariant === 'booking' &&
                      !bookingPhotosFullyLoaded &&
                      onBookingGalleryAdvance
                        ? '+'
                        : ''}
                    </div>
                  </>
                )}
              </div>
              <div
                className={`place-gallery-thumb-region ${
                  showThumbRegion ? 'place-gallery-thumb-region--open' : ''
                }`}
              >
              <div className="min-h-0 overflow-hidden">
              {showThumbStrip ? (
                <div
                  className={`mt-2 flex gap-2.5 overflow-x-auto px-1 py-1.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
                    animateGalleryThumbs ? 'place-gallery-strip-enter' : ''
                  }`}
                >
                  {photoRefs.map((ref, i) => {
                    const url = isUsablePhotoHttp(ref) ? ref : undefined
                    return (
                      <GalleryThumb
                        key={ref + i}
                        url={url}
                        selected={i === photoIndex}
                        onSelect={() => selectPhoto(i)}
                        animateIn={animateGalleryThumbs}
                        enterDelayMs={Math.min(i, 10) * 35}
                        onError={(failedUrl) =>
                          setFailedPhotos((current) =>
                            current.includes(failedUrl)
                              ? current
                              : [...current, failedUrl],
                          )
                        }
                        buttonRef={(el) => {
                          thumbRefs.current[i] = el
                        }}
                      />
                    )
                  })}
                </div>
              ) : showInitialThumbShimmer ? (
                <div className="mt-2 space-y-1">
                  <div className="flex gap-2 overflow-hidden" aria-hidden>
                    {Array.from({ length: 9 }, (_, i) => (
                      <span
                        key={i}
                        className="relative h-14 w-20 shrink-0 rounded-lg place-hero-shimmer"
                      />
                    ))}
                  </div>
                </div>
              ) : showMorePhotoShimmer || showBookingPhotoShimmer ? (
                <div className="mt-2 space-y-1">
                  <div
                    className="flex gap-2 overflow-hidden"
                    aria-busy
                    aria-label={t('place.loadingMorePhotosAria')}
                  >
                    {displayPhoto ? (
                      <GalleryThumb
                        url={displayPhoto}
                        selected
                        onSelect={() => selectPhoto(0)}
                        onError={(failedUrl) =>
                          setFailedPhotos((current) =>
                            current.includes(failedUrl)
                              ? current
                              : [...current, failedUrl],
                          )
                        }
                        buttonRef={(el) => {
                          thumbRefs.current[0] = el
                        }}
                      />
                    ) : null}
                    {Array.from({ length: displayPhoto ? 8 : 9 }, (_, i) => (
                      <span
                        key={i}
                        className="relative h-14 w-20 shrink-0 rounded-lg place-hero-shimmer"
                      />
                    ))}
                  </div>
                </div>
              ) : null}
              </div>
              </div>
              {bookingGalleryPhotosError && !bookingGalleryPhotosLoading && (
                <p className="text-xs text-amber-800">{bookingGalleryPhotosError}</p>
              )}
              </div>
              </div>
            </div>
          )}

          {showPhotoRetry && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={refreshTripadvisorPhotos}
                disabled={tripadvisorPhotosRefreshing}
                className={`${placeDetailCapsuleClass} ${glassCapsuleToneClass.neutral} text-xs font-medium text-[var(--stone)] dark:text-zinc-300 transition-colors hover:text-[var(--sage)] dark:hover:text-emerald-300 hover:bg-white/80 dark:hover:bg-white/15 disabled:cursor-wait disabled:opacity-60 active:scale-95 cursor-pointer`}
                aria-label={t('place.refreshPhotosTitle')}
                title={t('place.clearCacheReloadTitle')}
              >
                <RefreshCw
                  size={14}
                  strokeWidth={1.9}
                  className={tripadvisorPhotosRefreshing ? 'animate-spin' : undefined}
                  aria-hidden
                />
                {t('place.refreshPhotosLabel')}
              </button>
            </div>
          )}

          {!providerOwnsSummary && (cachedGoogleRating != null || displayRating != null || priceLevelLabel || displayPhone || displayWebsite || displayCuisine || showTripadvisorChipShimmer) && (
            <div className="space-y-1">
            <div className="flex flex-wrap gap-2 text-sm">
            {cachedGoogleRating != null && (
              <span
                className={`${placeDetailCapsuleClass} ${glassCapsuleToneClass.gold} text-[var(--ink)] dark:text-amber-200`}
                title={t('place.cachedGoogleRating')}
              >
                <PlaceSourceMark source="google" />
                <span>★ {cachedGoogleRating.toFixed(1)}</span>
                {cachedGoogleRatingCount != null ? `（${cachedGoogleRatingCount}）` : ''}
              </span>
            )}
            {tripadvisorLoading.rating && showTripadvisorChipShimmer && (
              <PlaceChipShimmer label={t('place.ratingChip')} />
            )}
            {displayRating != null && (
              <span
                className={`${placeDetailCapsuleClass} ${glassCapsuleToneClass.sage} text-[var(--ink)] dark:text-emerald-200`}
                title={t('place.tripadvisorRatingTitle')}
              >
                <PlaceSourceMark source="tripadvisor" />
                <span className="sr-only">
                  {factsSource
                    ? t('place.ratingSrLabel', { source: placeSourceLabel(factsSource, locale) })
                    : t('place.ratingSrLabel', { source: '' }).trimEnd() + ' '}
                </span>
                ★ {displayRating.toFixed(1)}
                {displayRatingCount != null ? `（${displayRatingCount}）` : ''}
              </span>
            )}
            {tripadvisorLoading.price && showTripadvisorChipShimmer && (
              <PlaceChipShimmer label={t('place.priceChip')} />
            )}
            {priceLevelLabel && (
              <span className={`${placeDetailCapsuleClass} ${glassCapsuleToneClass.blue} text-[var(--stone)] dark:text-zinc-300`}>
                {priceLevelLabel}
              </span>
            )}
            {tripadvisorLoading.cuisine && showTripadvisorChipShimmer && (
              <PlaceChipShimmer label={t('place.cuisineChip')} />
            )}
            {displayCuisine && (
              <span className={`${placeDetailCapsuleClass} ${glassCapsuleToneClass.copper} text-[var(--stone)] dark:text-zinc-300`}>
                {displayCuisine}
              </span>
            )}
            {displayPhone && (
              <span className={`${placeDetailCapsuleClass} ${glassCapsuleToneClass.violet} text-[var(--stone)] dark:text-zinc-300`}>
                {displayPhone}
              </span>
            )}
            {displayWebsite && (
              <a
                href={displayWebsite}
                target="_blank"
                rel="noreferrer"
                className={`${placeDetailCapsuleClass} ${glassCapsuleToneClass.sage} font-medium text-[var(--sage)] dark:text-emerald-300 transition-all hover:bg-[#dce9df]/90 dark:hover:bg-[#668b7a]/25 hover:border-[#a8bcae] dark:hover:border-[#668b7a]/40 active:scale-95 cursor-pointer`}
              >
                {t('place.website')}
              </a>
            )}
          </div>
          </div>
          )}

          {!providerOwnsSummary && displayAddress && (
            <div className="flex max-w-full items-center gap-1.5">
              <a
                href={googleMapsPlaceUrl}
                target="_blank"
                rel="noreferrer"
                className={`group ${placeDetailCapsuleClass} ${glassCapsuleToneClass.copper} max-w-full text-sm text-[var(--stone)] dark:text-zinc-300 transition-all hover:bg-[#f1ded0]/90 dark:hover:bg-[#d48354]/20 hover:text-[var(--copper)] dark:hover:text-[var(--copper)] hover:border-[#d7a98a] dark:hover:border-[#d48354]/45 active:scale-[0.99] cursor-pointer`}
                title={t('place.viewInGoogleMaps')}
              >
                <MapPin size={14} strokeWidth={1.9} className="shrink-0 text-[var(--copper)]/85 dark:text-[var(--copper)] transition-colors" aria-hidden />
                <span className="min-w-0 leading-snug">{displayAddress}</span>
                <ExternalLink
                  size={14}
                  strokeWidth={1.9}
                  className="ml-0.5 shrink-0 text-[var(--stone)]/80 dark:text-zinc-400 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[var(--copper)] dark:group-hover:text-[var(--copper)]"
                  aria-hidden
                />
              </a>
            </div>
          )}
          {!providerOwnsSummary && showTripadvisorAddressShimmer && (
            <div className="space-y-1" aria-busy>
              <span className="block h-3.5 w-[72%] rounded-full day-tab-shimmer" aria-hidden />
            </div>
          )}

          {displayNarrative &&
            (displayNarrative.loading ||
              displayNarrative.intro ||
              displayNarrative.reason ||
              displayNarrative.tripFit) && (
              <div className={`space-y-3 rounded-2xl ${glassSageCardSurfaceClass} p-4`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs uppercase tracking-[0.16em] text-[var(--sage)] font-semibold">
                    {displayNarrative.labels?.title || t('place.advisorNoteTitle')}
                  </p>
                  {displayNarrative.onRegenerate &&
                    (displayNarrative.intro ||
                      displayNarrative.reason ||
                      displayNarrative.tripFit ||
                      displayNarrative.regenerating) && (
                      <button
                        type="button"
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${glassHandleSurfaceClass} text-[var(--sage)] transition hover:bg-white dark:hover:bg-white/15 hover:shadow-sm active:scale-95 disabled:opacity-60`}
                        disabled={Boolean(displayNarrative.loading || displayNarrative.regenerating)}
                        aria-label={displayNarrative.regenerating ? t('common.loading') : t('place.regenerateNote')}
                        title={displayNarrative.regenerating ? t('common.loading') : t('place.regenerateNote')}
                        onClick={displayNarrative.onRegenerate}
                      >
                        <RotateCw
                          size={13}
                          strokeWidth={2.2}
                          className={
                            displayNarrative.regenerating || displayNarrative.loading
                              ? 'animate-spin'
                              : undefined
                          }
                          aria-hidden
                        />
                      </button>
                    )}
                </div>
                {displayNarrative.variant === 'single' ? (
                  <LlmNarrativeSingleBody
                    reason={displayNarrative.reason}
                    loading={Boolean(displayNarrative.loading)}
                    loadingLabel={displayNarrative.labels?.loadingText}
                  />
                ) : (
                  <>
                {displayNarrative.loading && !displayNarrative.intro && !displayNarrative.reason && (
                  <LoadingIndicator
                    thinkingLabel="Thinking…"
                    generatingLabel={
                      displayNarrative.labels?.loadingText || 'Loading…'
                    }
                    showDots
                    size="sm"
                    mode="thinking"
                    task="placeDetail"
                  />
                )}
                {displayNarrative.intro && (
                  <div>
                    <p className="text-sm font-medium">
                      {displayNarrative.labels?.intro || t('place.intro')}
                    </p>
                    <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-[var(--ink)]/90">
                      {displayNarrative.intro}
                      {displayNarrative.loading &&
                      !displayNarrative.reason &&
                      !displayNarrative.labels?.tripFit ? (
                        <span
                          className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[0.1em] animate-pulse bg-[var(--sage)] align-text-bottom"
                          aria-hidden
                        />
                      ) : null}
                    </p>
                  </div>
                )}
                {displayNarrative.reason && (
                  <div>
                    <p className="text-sm font-medium">
                      {displayNarrative.labels?.reason || t('place.whyRecommend')}
                    </p>
                    <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-[var(--ink)]/90">
                      {displayNarrative.reason}
                      {displayNarrative.loading && !displayNarrative.labels?.tripFit ? (
                        <span
                          className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[0.1em] animate-pulse bg-[var(--sage)] align-text-bottom"
                          aria-hidden
                        />
                      ) : null}
                    </p>
                  </div>
                )}
                {displayNarrative.tripFit && (
                  <div>
                    <p className="text-sm font-medium">
                      {displayNarrative.labels?.tripFit || t('place.fitReason')}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-[var(--ink)]/90">
                      {displayNarrative.tripFit}
                    </p>
                  </div>
                )}
                {displayNarrative.loading &&
                  (displayNarrative.intro || displayNarrative.reason) &&
                  !displayNarrative.tripFit &&
                  displayNarrative.labels?.tripFit &&
                  displayNarrative.labels?.loadingMoreText && (
                    <LoadingIndicator
                      thinkingLabel={displayNarrative.labels.loadingMoreText}
                      generatingLabel={displayNarrative.labels.loadingMoreText}
                      showDots
                      size="sm"
                      mode="thinking"
                      task="placeDetail"
                    />
                  )}
                  </>
                )}
              </div>
            )}

          {providerDetails}

          {reviewsBlock}

          {(!tripadvisorRoute || rapidApiReviewsActive) &&
            reviewsSection === undefined && details &&
            !loading &&
            !details.reviews.length &&
            (details.userRatingCount || 0) > 0 && (
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-sm font-medium">
                  <PlaceSourceMark source="google" showLabel={false} />
                  {reviewSourceLabel}
                </p>
                <div className="rounded-2xl border border-white/80 dark:border-white/10 bg-white/60 dark:bg-[#18201c]/80 p-3.5 text-sm shadow-sm backdrop-blur-md">
                  <p className="leading-relaxed text-[var(--stone)]">
                    {locale === 'en'
                      ? 'Google provided the rating and review count, but text reviews are not available via Places API.'
                      : 'Google 已返回评分与评论总数，但暂未向 Places API 提供可展示的评论正文。'}
                  </p>
                  {googleMapsPlaceUrl && (
                    <a
                      href={googleMapsPlaceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1.5 inline-flex items-center gap-1 font-medium text-[var(--sage)] underline-offset-2 hover:underline"
                    >
                      {t('place.viewReviewsOnGoogle')}
                      <ExternalLink size={13} strokeWidth={1.9} aria-hidden />
                    </a>
                  )}
                </div>
              </div>
            )}

          {showMap && (
            <div>
              <p className="mb-2 text-sm font-medium">{t('place.embeddedMapTitle')}</p>
              <div className="overflow-hidden rounded-2xl border border-white/80 dark:border-white/10 shadow-sm">
                <iframe
                  title={t('place.mapAria', { name })}
                  src={embedSrc}
                  className="h-[260px] w-full border-0"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  allowFullScreen
                />
              </div>
            </div>
          )}
        </div>

        {footer && (
          <div className="shrink-0 border-t border-white/80 dark:border-white/10 bg-white/75 dark:bg-[#161d19]/90 px-4 py-3 backdrop-blur-xl">
            {footer}
          </div>
        )}
    </BottomSheet>
  )
}
