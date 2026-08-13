import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type HTMLAttributeReferrerPolicy,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import {
  fetchGooglePlaceDetails,
  peekGooglePlaceDetails,
  placeDetailsQuery,
  type GooglePlaceDetails,
} from '../../map/services/googlePlaceDetails'
import {
  fetchTripadvisorAttractionInfo,
  fetchTripadvisorPlaceGallery,
  fetchTripadvisorRestaurantInfo,
  hasCachedTripadvisorGallery,
  hasCachedTripadvisorRestaurantDetails,
  peekTripadvisorAttractionInfo,
  peekTripadvisorPlacePhotos,
  peekTripadvisorRestaurantInfo,
  type TripadvisorAttractionInfo,
} from '../services/tripadvisorPlacePhotos'
import { tripadvisorPlaceLoadingSlices } from '../services/tripadvisorPlaceLoading'
import {
  pickRestaurantGalleryPhotos,
  shouldFetchTripadvisorGalleryFallback,
  websitePhotosNeedTripadvisorFallback,
} from '../services/placeGalleryFallback'
import {
  fetchPlaceWebsitePhotosWithFallback,
  peekCachedPlaceWebsitePhotos,
} from '../services/placeWebsitePhotos'
import { getGoogleMapsApiKey, googleMapsEmbedApiUrl } from '../../map/services/googleMapsKey'
import { getGoogleRequestBudgetSnapshot } from '../../map/services/googleRequestBudget'
import { isLlmConfigured } from '../../../shared/services/llm/llm'
import {
  looksChinese,
  peekPlaceNameZh,
  translatePlaceNameToChinese,
} from '../../chat/services/translate'
import type { Coordinates, PlaceType } from '../../../types'
import { placeOriginalLabel, placeTitleLines } from '../../../shared/utils/placeTitle'
import { formatPriceLevelLabel } from '../../../shared/utils/priceLevel'
import { CloseIconButton } from '../../../shared/components/CloseIconButton'
import { GoogleReviewsList } from './GoogleReviewsList'
import {
  PlaceSourceMark,
  placeSourceLabel,
  type PlaceInfoSource,
} from './PlaceSourceMark'
import { LoadingIndicator } from '../../../shared/components/LoadingIndicator'
import { ShimmerLines } from '../../../shared/components/ShimmerLines'
import {
  fetchWikimediaPlacePhoto,
  peekWikimediaPlacePhoto,
  type WikimediaPlacePhoto,
} from '../../map/services/wikimediaPlacePhotos'

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
  onClose: () => void
}

function isUsablePhotoHttp(url: string): boolean {
  return (
    /^https?:\/\//i.test(url) &&
    !url.includes('places.googleapis.com') &&
    !url.includes('maps.googleapis.com/maps/api/place/photo')
  )
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

function PlaceChipShimmer({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--mist)] px-3 py-1 text-[var(--stone)]">
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
      <p className="text-xs text-[var(--stone)]">正在加载评论…</p>
      {Array.from({ length: 2 }, (_, index) => (
        <article
          key={index}
          className="rounded-xl bg-white/70 px-3 py-2 text-sm"
          aria-hidden
        >
          <span className="mb-2 block h-3 w-24 rounded-full day-tab-shimmer" />
          <ShimmerLines lines={3} />
        </article>
      ))}
    </div>
  )
}

function photoReferrerPolicy(url: string): HTMLAttributeReferrerPolicy {
  return /tripadvisor\.com/i.test(url) ? 'no-referrer-when-downgrade' : 'no-referrer'
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

function photoFetchStatusLabel(input: {
  galleryVariant?: 'carousel' | 'booking'
  bookingGalleryPhotosLoading?: boolean
  isAttraction: boolean
  needsTripadvisorFallback: boolean
  skipGoogleLookup: boolean
  googleLookupReady: boolean
  googleLoading: boolean
  websitePhotosResolved: boolean
  usableWebsitePhotos: number
  tripadvisorResolved: boolean
  tripadvisorFallbackResolved: boolean
  hasWebsiteCache: boolean
  hasWebsiteMiss: boolean
  hasTripadvisorCache: boolean
  googleDetailsMissing?: boolean
  displayPhoto: string
  heroReady: boolean
  photoSource: PlaceInfoSource | null
}): string {
  if (input.galleryVariant === 'booking') {
    if (input.bookingGalleryPhotosLoading) return '正在请求 Booking 照片…'
    if (input.displayPhoto && !input.heroReady) return '正在加载 Booking 照片…'
    return '正在加载照片…'
  }
  if (input.isAttraction) {
    if (!input.tripadvisorResolved) {
      return input.hasTripadvisorCache
        ? '正在读取 Tripadvisor 相册缓存…'
        : '正在请求 Tripadvisor 相册…'
    }
    if (input.displayPhoto && !input.heroReady) return '正在加载 Tripadvisor 图片…'
    return '正在加载照片…'
  }
  if (!input.skipGoogleLookup && (!input.googleLookupReady || input.googleLoading)) {
    return '正在查询 Google 地点详情…'
  }
  if (input.googleDetailsMissing) {
    if (!input.tripadvisorFallbackResolved && !input.tripadvisorResolved) {
      return input.hasTripadvisorCache
        ? 'Google 次数已用完，正在读取 Tripadvisor 缓存…'
        : 'Google 次数已用完，正在请求 Tripadvisor…'
    }
    if (input.displayPhoto && !input.heroReady) return '正在加载 Tripadvisor 图片…'
    return '正在加载照片…'
  }
  if (!input.skipGoogleLookup && !input.websitePhotosResolved) {
    if (!input.hasWebsiteMiss && !input.hasTripadvisorCache) {
      return input.hasWebsiteCache ? '正在读取官网图片缓存…' : '正在抓取官网图片…'
    }
  }
  if (
    input.needsTripadvisorFallback &&
    input.websitePhotosResolved &&
    websitePhotosNeedTripadvisorFallback(input.usableWebsitePhotos) &&
    !input.tripadvisorFallbackResolved
  ) {
    if (input.usableWebsitePhotos === 0) {
      return input.hasTripadvisorCache
        ? '官网无可用图，正在读取 Tripadvisor 缓存…'
        : '官网无可用图，正在请求 Tripadvisor…'
    }
    return input.hasTripadvisorCache
      ? '官网图片较少，正在读取 Tripadvisor 缓存…'
      : '官网图片较少，正在请求 Tripadvisor…'
  }
  if (
    input.needsTripadvisorFallback &&
    input.tripadvisorFallbackResolved &&
    input.usableWebsitePhotos === 0 &&
    !input.displayPhoto
  ) {
    return 'Tripadvisor 无匹配照片，使用占位图…'
  }
  if (input.displayPhoto && !input.heroReady) {
    if (input.photoSource === 'website') return '正在加载官网图片…'
    if (input.photoSource === 'tripadvisor') return '正在加载 Tripadvisor 图片…'
    if (input.photoSource === 'google') return '正在加载 Google 图片…'
    if (input.photoSource === 'wikimedia') return '正在加载 Wikimedia 图片…'
    if (input.photoSource == null) return '正在加载占位图…'
    return '正在加载图片…'
  }
  return '正在加载照片…'
}

function GalleryThumb({
  url,
  selected,
  onSelect,
  onError,
  buttonRef,
}: {
  url?: string
  selected: boolean
  onSelect: () => void
  onError: (url: string) => void
  buttonRef: (el: HTMLButtonElement | null) => void
}) {
  const [ready, setReady] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)
  const urlRef = useRef(url)
  if (urlRef.current !== url) {
    urlRef.current = url
    setReady(false)
  }
  useLayoutEffect(() => {
    const img = imgRef.current
    if (img?.complete && img.naturalWidth > 0) setReady(true)
  }, [url])

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onSelect}
      className={`relative h-14 w-20 shrink-0 overflow-hidden rounded-lg border-2 ${
        selected ? 'border-[var(--copper)]' : 'border-transparent'
      }`}
    >
      <span className="absolute inset-0 day-tab-shimmer" aria-hidden />
      {url ? (
        <img
          ref={imgRef}
          src={url}
          alt=""
          className={`relative h-full w-full object-cover motion-safe:transition-opacity motion-safe:duration-300 ${
            ready ? 'opacity-100' : 'opacity-0'
          }`}
          referrerPolicy={photoReferrerPolicy(url)}
          onLoad={() => setReady(true)}
          onError={() => onError(url)}
        />
      ) : null}
    </button>
  )
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
  onClose,
}: Props) {
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
  const [heroReady, setHeroReady] = useState(false)
  const pendingGalleryAdvanceRef = useRef(false)
  const [wikimediaPhoto, setWikimediaPhoto] =
    useState<WikimediaPlacePhoto | null>(null)
  const [tripadvisorInfo, setTripadvisorInfo] =
    useState<TripadvisorAttractionInfo | null>(null)
  const [tripadvisorResolved, setTripadvisorResolved] = useState(false)
  const [tripadvisorDetailsResolved, setTripadvisorDetailsResolved] = useState(false)
  const tripadvisorPlaceKeyRef = useRef('')
  const [llmZh, setLlmZh] = useState<string | null>(null)
  /** idle = not finished; loading = in flight; done = success or gave up */
  const [nameZhPhase, setNameZhPhase] = useState<'idle' | 'loading' | 'done'>('idle')
  const swipeStartX = useRef<number | null>(null)
  const thumbRefs = useRef<(HTMLButtonElement | null)[]>([])
  const onDetailsResolvedRef = useRef(onDetailsResolved)
  onDetailsResolvedRef.current = onDetailsResolved

  const query = placeDetailsQuery(name, nameLocal)
  const apiKey = getGoogleMapsApiKey()
  const embedSrc = googleMapsEmbedApiUrl(query, apiKey)
  const nameTranslateKey = `${open ? 1 : 0}|${name}|${nameLocal || ''}`
  const placeResetKey = `${nameTranslateKey}|${tripadvisorContentId || ''}`
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
    setTripadvisorFallbackPhotos([])
    setTripadvisorFallbackResolved(false)
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
  const skipGoogleLookup =
    skipProviderLookup || isAttraction || placeType === 'hotel'
  const googleQuotaExhausted =
    needsTripadvisorFallback && getGoogleRequestBudgetSnapshot().remaining <= 0
  const googleDetailsMissing =
    needsTripadvisorFallback &&
    googleLookupReady &&
    !loading &&
    !details &&
    !detailsOverride
  const tripadvisorRoute =
    isAttraction ||
    googleDetailsMissing ||
    (googleQuotaExhausted && !detailsOverride && !details)
  const displayNarrative = llmNarrative
    ? {
        ...llmNarrative,
        intro:
          isAttraction && tripadvisorInfo?.description
            ? tripadvisorInfo.description
            : llmNarrative.intro,
      }
    : null
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
  const restaurantGalleryPhotos = pickRestaurantGalleryPhotos({
    websitePhotos: usableWebsitePhotos,
    tripadvisorPhotos: restaurantTripadvisorAlbum,
    tripadvisorResolved: tripadvisorFallbackResolved,
  })
  const photoRefs =
    tripadvisorRoute
      ? tripadvisorInfo?.photos.length
        ? tripadvisorInfo.photos
        : tripadvisorFallbackPhotos.length
          ? tripadvisorFallbackPhotos
          : tripadvisorCached
      : restaurantGalleryPhotos.length
        ? restaurantGalleryPhotos
        : (details?.photos || []).filter(isUsablePhotoHttp)
  const googlePhotos = photoRefs.filter(
    (url) => isUsablePhotoHttp(url) && !failedPhotos.includes(url),
  )
  const survivingGoogle = googlePhotos.filter((url) => !failedPhotos.includes(url))
  const rawPhotos = survivingGoogle.length
    ? survivingGoogle
    : wikimediaPhoto?.url
      ? [wikimediaPhoto.url]
      : fallbackImage
        ? [fallbackImage]
        : []
  const photos = rawPhotos.filter((url) => !failedPhotos.includes(url))
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
    wikimediaPhoto?.url ||
    fallbackImage ||
    ''
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
  const hasTripadvisorPhotos =
    tripadvisorCached.length > 0 ||
    tripadvisorFallbackPhotos.length > 0 ||
    Boolean(tripadvisorInfo?.photos.length)
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
      ? !tripadvisorResolved && !hasTripadvisorPhotos
      : !skipGoogleLookup &&
        !hasTripadvisorAlbum &&
        (!websitePhotosResolved ||
          (needsTripadvisorFallback &&
            websitePhotosNeedTripadvisorFallback(usableWebsitePhotos.length) &&
            !tripadvisorFallbackResolved)))
  const awaitingTripadvisorPhotos =
    galleryPending &&
    (tripadvisorRoute ||
      (needsTripadvisorFallback &&
        websitePhotosResolved &&
        websitePhotosNeedTripadvisorFallback(usableWebsitePhotos.length) &&
        !tripadvisorFallbackResolved))
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
    tripadvisorRoute
      ? tripadvisorHasFacts(tripadvisorInfo)
        ? 'tripadvisor'
        : null
      : details && !skipGoogleLookup
        ? 'google'
        : null
  const photoSectionReady = !galleryPending && Boolean(displayPhoto) && heroReady
  const showPhotoShimmer = !photoSectionReady
  const photoFetchStatus = photoFetchStatusLabel({
    galleryVariant,
    bookingGalleryPhotosLoading,
    isAttraction,
    needsTripadvisorFallback,
    skipGoogleLookup,
    googleLookupReady,
    googleLoading: loading,
    websitePhotosResolved,
    usableWebsitePhotos: usableWebsitePhotos.length,
    tripadvisorResolved,
    tripadvisorFallbackResolved,
    hasWebsiteCache: websitePhotoCache.photos.length > 0,
    hasWebsiteMiss: Boolean(websitePhotoCache.miss),
    hasTripadvisorCache:
      hasCachedTripadvisorAlbum || Boolean(tripadvisorInfo?.photos.length),
    googleDetailsMissing,
    displayPhoto,
    heroReady,
    photoSource,
  })
  const displayPhotoRef = useRef(displayPhoto)
  const heroImgRef = useRef<HTMLImageElement>(null)
  if (displayPhotoRef.current !== displayPhoto) {
    displayPhotoRef.current = displayPhoto
    setHeroReady(false)
  }
  const galleryLength = Math.max(photoRefs.length, photos.length)
  const showThumbStrip = galleryLength > 1
  const googleMapsPlaceUrl = details?.id
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        details.nameOriginal || details.name || query,
      )}&query_place_id=${encodeURIComponent(details.id)}`
    : null

  function stepPhoto(delta: number) {
    if (delta < 0) {
      if (galleryLength < 2) return
      setPhotoIndex((i) => (i - 1 + galleryLength) % galleryLength)
      return
    }

    if (
      galleryVariant === 'booking' &&
      onBookingGalleryAdvance &&
      !bookingPhotosFullyLoaded &&
      (photos.length <= 1 || photoIndex >= photos.length - 1)
    ) {
      pendingGalleryAdvanceRef.current = true
      onBookingGalleryAdvance(photoIndex + 1, photos.length)
      return
    }

    if (galleryLength < 2) return
    setPhotoIndex((i) => (i + 1) % galleryLength)
  }

  const showGalleryNav =
    photoRefs.length > 1 ||
    (galleryVariant === 'booking' &&
      !bookingPhotosFullyLoaded &&
      Boolean(onBookingGalleryAdvance))

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
    setDetails(null)
    setLoading(false)
    setError(null)
    setGoogleLookupReady(false)
    setHeroReady(false)
    setPhotoIndex(0)
    pendingGalleryAdvanceRef.current = false
  }, [open, name])

  useLayoutEffect(() => {
    const img = heroImgRef.current
    if (img?.complete && img.naturalWidth > 0) setHeroReady(true)
  }, [displayPhoto])

  useEffect(() => {
    if (!open || skipGoogleLookup || galleryVariant === 'booking' || isAttraction) {
      setWebsitePhotosResolved(true)
      return
    }
    if (googleLookupReady && !loading && !details) {
      setWebsitePhotosResolved(true)
      return
    }
    const cached = peekCachedPlaceWebsitePhotos({
      website: details?.website,
      name: details?.name || name,
      nameLocal: details?.nameOriginal || nameLocal,
      address: details?.address,
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
    if (!googleLookupReady || loading) return
    let cancelled = false
    setWebsitePhotosResolved(false)
    void fetchPlaceWebsitePhotosWithFallback({
      website: details?.website,
      name: details?.name || name,
      nameLocal: details?.nameOriginal || nameLocal,
      address: details?.address,
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
    loading,
    details?.website,
    details?.name,
    details?.nameOriginal,
    details?.address,
    name,
    nameLocal,
    placeType,
    skipGoogleLookup,
    galleryVariant,
    isAttraction,
    googleLookupReady,
  ])

  useEffect(() => {
    if (!open || skipGoogleLookup || galleryVariant === 'booking' || isAttraction) {
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
    }
    if (googleLookupReady && !loading && !details) {
      return
    }
    if (loading || !googleLookupReady || !websitePhotosResolved) return
    if (
      !shouldFetchTripadvisorGalleryFallback({
        needsTripadvisorFallback,
        websitePhotosResolved,
        usableWebsitePhotoCount: usableWebsitePhotos.length,
        hasCachedTripadvisorAlbum: hasCachedAlbum,
      })
    ) {
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
    loading,
    googleLookupReady,
    websitePhotosResolved,
    usableWebsitePhotos.length,
    needsTripadvisorFallback,
    details?.name,
    details?.nameOriginal,
    details?.address,
    name,
    nameLocal,
    placeType,
    tripadvisorContentId,
    skipGoogleLookup,
    galleryVariant,
    isAttraction,
  ])

  useEffect(() => {
    if (!pendingGalleryAdvanceRef.current || photos.length < 1) return
    pendingGalleryAdvanceRef.current = false
    setPhotoIndex((i) => Math.min(i + 1, photos.length - 1))
  }, [photos.length])

  useEffect(() => {
    thumbRefs.current[photoIndex]?.scrollIntoView({
      inline: 'nearest',
      block: 'nearest',
      behavior: 'smooth',
    })
  }, [photoIndex])

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
    if (!open) return
    if (detailsOverride) {
      setDetails(detailsOverride)
      setLoading(false)
      setError(null)
      setGoogleLookupReady(true)
      return
    }
    if (skipGoogleLookup) {
      setDetails(null)
      setLoading(false)
      setError(null)
      setPhotoIndex(0)
      setGoogleLookupReady(true)
      return
    }
    let cancelled = false
    const queryLocation =
      location?.lat != null && location?.lng != null
        ? { lat: location.lat, lng: location.lng }
        : undefined
    const peeked = peekGooglePlaceDetails(name, nameLocal, queryLocation, googlePlaceId)
    if (peeked) {
      setDetails(peeked)
      setLoading(false)
      setError(null)
      setPhotoIndex(0)
      setGoogleLookupReady(true)
      onDetailsResolvedRef.current?.(peeked)
      return
    }

    setLoading(true)
    setError(null)
    setPhotoIndex(0)
    setGoogleLookupReady(false)

    void fetchGooglePlaceDetails(query, queryLocation, {
      placeId: googlePlaceId,
      recoverFromLocation: !googlePlaceId && !query,
    })
      .then((result) => {
        if (cancelled) return
        if (!result) {
          const budget = getGoogleRequestBudgetSnapshot()
          setError(
            budget.remaining <= 0
              ? '今日 Google 地点查询次数已用完。已打开过的地点仍可从缓存查看；其余地点改从 Tripadvisor 读取地址、评论与图片。'
              : '未找到该地点的 Google 详情。',
          )
          setDetails(null)
        } else {
          setDetails(result)
          onDetailsResolvedRef.current?.(result)
        }
      })
      .catch(() => {
        if (!cancelled) setError('加载地点详情失败，请稍后再试。')
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
          setGoogleLookupReady(true)
        }
      })

    return () => {
      cancelled = true
    }
  }, [open, query, googlePlaceId, location?.lat, location?.lng, detailsOverride, skipGoogleLookup])

  useEffect(() => {
    if (!open) {
      setTripadvisorInfo(null)
      setTripadvisorResolved(true)
      setTripadvisorDetailsResolved(true)
      return
    }
    if (isAttraction) {
      const peeked = peekTripadvisorAttractionInfo(
        name,
        nameLocal,
        tripadvisorContentId,
      )
      if (peeked) setTripadvisorInfo(peeked)
      if (peeked && hasCachedTripadvisorGallery(peeked.contentId)) {
        setTripadvisorResolved(true)
        setTripadvisorDetailsResolved(true)
        return
      }
      setTripadvisorResolved(false)
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
          }
        })
      return () => {
        cancelled = true
      }
    }
    const googleQuotaExhaustedNow = getGoogleRequestBudgetSnapshot().remaining <= 0
    if (!needsTripadvisorFallback || detailsOverride) {
      setTripadvisorResolved(true)
      setTripadvisorDetailsResolved(true)
      return
    }
    // Stale Google details from the previous place must not skip Tripadvisor.
    if (googleLookupReady && !loading && details && !googleQuotaExhaustedNow) {
      setTripadvisorResolved(true)
      setTripadvisorDetailsResolved(true)
      return
    }
    const googleMissed = googleLookupReady && !loading && !details
    if (!googleMissed && !googleQuotaExhaustedNow) {
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
      address: details?.address,
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
      })
    return () => {
      cancelled = true
    }
  }, [
    open,
    isAttraction,
    needsTripadvisorFallback,
    googleLookupReady,
    loading,
    details,
    detailsOverride,
    name,
    nameLocal,
    tripadvisorContentId,
  ])

  // When Google / trip data has no Chinese display name, LLM-translate the original.
  useEffect(() => {
    if (!open) {
      setLlmZh(null)
      setNameZhPhase('idle')
      return
    }

    const base = placeTitleLines(
      name,
      nameLocal,
      details?.name,
      details?.nameOriginal,
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
  }, [open, name, nameLocal, details?.name, details?.nameOriginal])

  if (!open) return null

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
  )
  const cachedZh = peekPlaceNameZh(originalLabel)
  const effectiveLlmZh =
    llmZh ||
    (cachedZh && looksChinese(cachedZh) ? cachedZh : null) ||
    null
  const needsLlmZh = !looksChinese(official.title) && isLlmConfigured()
  // Empty Chinese slot + translate animation until first streamed chars (or done).
  const showNameLoader = needsLlmZh && !effectiveLlmZh && nameZhPhase !== 'done'
  const nameStreaming = nameZhPhase === 'loading' && Boolean(effectiveLlmZh)

  const resolved = placeTitleLines(
    name,
    nameLocal,
    details?.name,
    details?.nameOriginal,
    effectiveLlmZh || undefined,
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
    : `${title || originalLabel} Google 地点页`
  const priceLevelLabel = formatPriceLevelLabel(
    tripadvisorRoute ? tripadvisorInfo?.priceLevel : details?.priceLevel,
  )
  const displayCuisine = tripadvisorRoute ? tripadvisorInfo?.cuisine : undefined
  const displayRating = tripadvisorRoute ? tripadvisorInfo?.rating : details?.rating
  const displayRatingCount =
    tripadvisorRoute ? tripadvisorInfo?.userRatingCount : details?.userRatingCount
  const displayAddress = tripadvisorRoute ? tripadvisorInfo?.address : details?.address
  const displayPhone = tripadvisorRoute
    ? tripadvisorInfo?.phone || details?.phone
    : details?.phone || tripadvisorInfo?.phone
  const displayWebsite = tripadvisorRoute
    ? tripadvisorInfo?.website || details?.website
    : details?.website || tripadvisorInfo?.website
  const displayReviews = tripadvisorRoute
    ? tripadvisorInfo?.reviews || []
    : details?.reviews || []
  const tripadvisorLoading = tripadvisorPlaceLoadingSlices({
    detailsResolved: tripadvisorDetailsResolved,
    photoCount: galleryLength,
    hasRating: displayRating != null,
    hasPrice: Boolean(priceLevelLabel),
    hasCuisine: Boolean(displayCuisine),
    hasAddress: Boolean(displayAddress),
    reviewCount: displayReviews.length,
  })
  const showMorePhotoShimmer =
    tripadvisorRoute &&
    Boolean(displayPhoto) &&
    heroReady &&
    tripadvisorLoading.morePhotos
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
    tripadvisorRoute &&
    tripadvisorLoading.reviews

  return createPortal(
    <div
      data-google-place-page="1"
      data-pending-place-confirm={footer ? '1' : undefined}
      className={`fixed inset-0 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4 ${overlayClassName}`}
      style={{ zIndex: overlayZIndex ?? 2000 }}
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="关闭"
        onClick={() => {
          if (closeOnBackdrop) onClose()
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={dialogLabel}
        className="relative z-10 flex max-h-[min(92vh,100dvh)] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl bg-[var(--paper)] shadow-[var(--shadow)] sm:rounded-3xl"
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
                  title="非公认中文名，由 AI 翻译"
                  aria-label="非公认中文名，由 AI 翻译"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="m5 8 6 6" />
                    <path d="m4 14 6-6 2-3" />
                    <path d="M2 5h12" />
                    <path d="M7 2h1" />
                    <path d="m22 22-5-10-5 10" />
                    <path d="M14 18h6" />
                  </svg>
                </span>
              )}
            </div>
            {subtitle && (
              <p className="text-sm text-[var(--stone)]">{subtitle}</p>
            )}
          </div>
          <CloseIconButton onClick={onClose} className="mt-0.5" />
        </div>

        <div
          className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4"
          aria-busy={
            loading ||
            (isAttraction && !tripadvisorResolved && !tripadvisorInfo) ||
            (tripadvisorRoute && !tripadvisorDetailsResolved) ||
            undefined
          }
        >
          {error && <p className="text-sm text-amber-800">{error}</p>}

          {(displayPhoto ||
            awaitingOfficialPhotos ||
            awaitingTripadvisorPhotos ||
            fallbackImage) && (
            <div className="space-y-2">
              <div
                className="relative h-56 overflow-hidden rounded-2xl bg-[var(--mist)] select-none sm:h-72"
                aria-busy={showPhotoShimmer || undefined}
                onPointerDown={(e) => {
                  if (!showGalleryNav) return
                  swipeStartX.current = e.clientX
                }}
                onPointerUp={(e) => {
                  if (swipeStartX.current == null || !showGalleryNav) return
                  const dx = e.clientX - swipeStartX.current
                  swipeStartX.current = null
                  if (Math.abs(dx) < 40) return
                  stepPhoto(dx < 0 ? 1 : -1)
                }}
                onPointerCancel={() => {
                  swipeStartX.current = null
                }}
              >
                <span
                  className={`absolute inset-0 z-[2] place-hero-shimmer motion-safe:transition-opacity motion-safe:duration-300 ${
                    showPhotoShimmer ? 'opacity-100' : 'pointer-events-none opacity-0'
                  }`}
                  aria-hidden
                />
                {showPhotoShimmer ? (
                  <p
                    className="absolute inset-x-5 top-1/2 z-[3] -translate-y-1/2 text-center text-[13px] font-medium leading-relaxed text-[var(--ink)]"
                    aria-live="polite"
                  >
                    {photoFetchStatus}
                  </p>
                ) : null}
                {displayPhoto ? (
                  <>
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
                    <img
                      ref={heroImgRef}
                      src={displayPhoto}
                      alt={details?.name || name}
                      className={`relative z-[1] h-full w-full object-contain motion-safe:transition-opacity motion-safe:duration-300 ${
                        heroReady ? 'opacity-100' : 'opacity-0'
                      }`}
                      referrerPolicy={photoReferrerPolicy(displayPhoto)}
                      draggable={false}
                      onLoad={() => setHeroReady(true)}
                      onError={() =>
                        setFailedPhotos((current) =>
                          current.includes(displayPhoto)
                            ? current
                            : [...current, displayPhoto],
                        )
                      }
                    />
                  </>
                ) : null}
                {wikimediaPhoto && displayPhoto === wikimediaPhoto.url && heroReady && (
                  <a
                    href={wikimediaPhoto.sourcePage}
                    target="_blank"
                    rel="noreferrer"
                    className="absolute bottom-2 left-2 z-10 max-w-[70%] truncate rounded-full bg-black/50 px-2 py-1 text-[10px] text-white backdrop-blur-sm hover:bg-black/65"
                    title={`${wikimediaPhoto.attribution || 'Wikimedia Commons'}${wikimediaPhoto.license ? ` · ${wikimediaPhoto.license}` : ''}`}
                  >
                    图片：{wikimediaPhoto.attribution || 'Wikimedia Commons'}
                    {wikimediaPhoto.license ? ` · ${wikimediaPhoto.license}` : ''}
                  </a>
                )}
                {photoSource &&
                  photoSource !== 'wikimedia' &&
                  displayPhoto &&
                  heroReady && (
                    <span
                      className="absolute bottom-2 left-2 z-10"
                      aria-label={`图片来自 ${placeSourceLabel(photoSource)}`}
                    >
                      <PlaceSourceMark source={photoSource} onPhoto />
                    </span>
                  )}
                {showGalleryNav && (
                  <>
                    <button
                      type="button"
                      aria-label="上一张"
                      onClick={() => stepPhoto(-1)}
                      disabled={galleryLength < 2}
                      className="absolute left-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm hover:bg-black/65 disabled:pointer-events-none disabled:opacity-40"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M15 18l-6-6 6-6" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      aria-label="下一张"
                      onClick={() => stepPhoto(1)}
                      disabled={bookingGalleryPhotosLoading}
                      className="absolute right-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm hover:bg-black/65 disabled:opacity-60"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                    </button>
                    <div className="absolute bottom-2 right-2 z-10 rounded-full bg-black/45 px-2 py-0.5 text-[11px] text-white backdrop-blur-sm">
                      {photoIndex + 1} / {galleryLength}
                      {galleryVariant === 'booking' &&
                      !bookingPhotosFullyLoaded &&
                      onBookingGalleryAdvance
                        ? '+'
                        : ''}
                    </div>
                  </>
                )}
              </div>
              {showPhotoShimmer ? (
                <div className="space-y-1">
                  <div className="flex gap-2 overflow-hidden" aria-hidden>
                    {Array.from({ length: 9 }, (_, i) => (
                      <span
                        key={i}
                        className="relative h-14 w-20 shrink-0 rounded-lg place-hero-shimmer"
                      />
                    ))}
                  </div>
                  <p className="text-xs text-[var(--stone)]">正在加载照片…</p>
                </div>
              ) : showThumbStrip ? (
                <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {photoRefs.map((ref, i) => {
                    const url = isUsablePhotoHttp(ref) ? ref : undefined
                    return (
                      <GalleryThumb
                        key={ref + i}
                        url={url}
                        selected={i === photoIndex}
                        onSelect={() => setPhotoIndex(i)}
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
              ) : showMorePhotoShimmer ? (
                <div className="space-y-1">
                  <div
                    className="flex gap-2 overflow-hidden"
                    aria-busy
                    aria-label="正在加载更多照片"
                  >
                    {displayPhoto ? (
                      <GalleryThumb
                        url={displayPhoto}
                        selected
                        onSelect={() => setPhotoIndex(0)}
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
                  <p className="text-xs text-[var(--stone)]">正在加载更多照片…</p>
                </div>
              ) : null}
              {bookingGalleryPhotosError && !bookingGalleryPhotosLoading && (
                <p className="text-xs text-amber-800">{bookingGalleryPhotosError}</p>
              )}
            </div>
          )}

          {displayNarrative &&
            (displayNarrative.loading ||
              displayNarrative.intro ||
              displayNarrative.reason ||
              displayNarrative.tripFit) && (
              <div className="space-y-3 rounded-2xl border border-[var(--sage)]/25 bg-[var(--sage)]/8 px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs uppercase tracking-[0.16em] text-[var(--sage)]">
                    {displayNarrative.labels?.title || '行程顾问点评'}
                  </p>
                  {displayNarrative.onRegenerate &&
                    (displayNarrative.intro ||
                      displayNarrative.reason ||
                      displayNarrative.tripFit ||
                      displayNarrative.regenerating) && (
                      <button
                        type="button"
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--sage)]/30 bg-white/70 text-[var(--sage)] transition hover:bg-white disabled:opacity-60"
                        disabled={Boolean(displayNarrative.loading || displayNarrative.regenerating)}
                        aria-label={displayNarrative.regenerating ? '正在重新生成' : '重新生成点评'}
                        title={displayNarrative.regenerating ? '正在重新生成' : '重新生成点评'}
                        onClick={displayNarrative.onRegenerate}
                      >
                        <svg
                          width="13"
                          height="13"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className={
                            displayNarrative.regenerating || displayNarrative.loading
                              ? 'animate-spin'
                              : undefined
                          }
                          aria-hidden
                        >
                          <path d="M21 12a9 9 0 1 1-2.6-6.3" />
                          <path d="M21 3v6h-6" />
                        </svg>
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
                    thinkingLabel="正在思考简介与推荐理由…"
                    generatingLabel={
                      displayNarrative.labels?.loadingText || '正在生成简介与推荐理由…'
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
                      {displayNarrative.labels?.intro || '简介'}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-[var(--ink)]/90">
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
                      {displayNarrative.labels?.reason || '为什么推荐'}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-[var(--ink)]/90">
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
                      {displayNarrative.labels?.tripFit || '与行程 / 要求的关系'}
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

          {!providerOwnsSummary && (displayRating != null || priceLevelLabel || displayPhone || displayWebsite || displayCuisine || showTripadvisorChipShimmer) && (
            <div className="space-y-1">
            <div className="flex flex-wrap gap-2 text-sm">
            {tripadvisorLoading.rating && showTripadvisorChipShimmer && (
              <PlaceChipShimmer label="评分" />
            )}
            {displayRating != null && (
              <span
                className="inline-flex items-center gap-1.5 rounded-full bg-[var(--gold)]/25 px-3 py-1"
                title={factsSource ? `评分来自 ${placeSourceLabel(factsSource)}` : undefined}
              >
                {factsSource && (factsSource === 'google' || factsSource === 'tripadvisor') ? (
                  <PlaceSourceMark source={factsSource} showLabel={false} />
                ) : null}
                <span className="sr-only">
                  {factsSource ? `${placeSourceLabel(factsSource)} 评分 ` : '评分 '}
                </span>
                ★ {displayRating.toFixed(1)}
                {displayRatingCount != null ? `（${displayRatingCount}）` : ''}
              </span>
            )}
            {tripadvisorLoading.price && showTripadvisorChipShimmer && (
              <PlaceChipShimmer label="价格" />
            )}
            {priceLevelLabel && (
              <span className="rounded-full bg-[var(--mist)] px-3 py-1">{priceLevelLabel}</span>
            )}
            {tripadvisorLoading.cuisine && showTripadvisorChipShimmer && (
              <PlaceChipShimmer label="菜系" />
            )}
            {displayCuisine && (
              <span className="rounded-full bg-[var(--mist)] px-3 py-1">{displayCuisine}</span>
            )}
            {displayPhone && (
              <span className="rounded-full bg-[var(--mist)] px-3 py-1">{displayPhone}</span>
            )}
            {displayWebsite && (
              <a
                href={displayWebsite}
                target="_blank"
                rel="noreferrer"
                className="rounded-full bg-[var(--mist)] px-3 py-1 font-medium text-[var(--sage)] underline-offset-2 hover:underline"
              >
                官网
              </a>
            )}
          </div>
            {showTripadvisorChipShimmer ? (
              <p className="text-xs text-[var(--stone)]">正在加载评分、价格与菜系…</p>
            ) : null}
          </div>
          )}

          {!providerOwnsSummary && displayAddress && (
              <p className="text-sm text-[var(--stone)]">
                {displayAddress}
              </p>
            )}
          {!providerOwnsSummary && showTripadvisorAddressShimmer && (
            <div className="space-y-1" aria-busy>
              <p className="text-xs text-[var(--stone)]">正在加载地址…</p>
              <span className="block h-3.5 w-[72%] rounded-full day-tab-shimmer" aria-hidden />
            </div>
          )}

          {providerDetails}

          {reviewsSection !== undefined
            ? reviewsSection
            : displayReviews.length
              ? (
                  <GoogleReviewsList
                    reviews={displayReviews}
                    sourceLabel={
                      tripadvisorRoute ? 'Tripadvisor 评论' : reviewSourceLabel
                    }
                    source={tripadvisorRoute ? 'tripadvisor' : 'google'}
                  />
                )
              : showTripadvisorReviewsShimmer
                ? <PlaceReviewsShimmer />
                : null}

          {!tripadvisorRoute && reviewsSection === undefined && details &&
            !loading &&
            !details.reviews.length &&
            (details.userRatingCount || 0) > 0 && (
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-sm font-medium">
                  <PlaceSourceMark source="google" showLabel={false} />
                  {reviewSourceLabel}
                </p>
                <div className="rounded-xl bg-white/70 px-3 py-2 text-sm">
                  <p className="leading-relaxed text-[var(--stone)]">
                    Google 已返回评分与评论总数，但暂未向 Places API 提供可展示的评论正文。
                  </p>
                  {googleMapsPlaceUrl && (
                    <a
                      href={googleMapsPlaceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1.5 inline-flex items-center gap-1 font-medium text-[var(--sage)] underline-offset-2 hover:underline"
                    >
                      在 Google 地图查看评价
                      <span aria-hidden>↗</span>
                    </a>
                  )}
                </div>
              </div>
            )}

          {showMap && (
            <div>
              <p className="mb-2 text-sm font-medium">地图位置（本页嵌入）</p>
              <div className="overflow-hidden rounded-xl border border-[var(--mist)]">
                <iframe
                  title={`${name} map`}
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
          <div className="shrink-0 border-t border-[var(--mist)] bg-[var(--paper)] px-4 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
