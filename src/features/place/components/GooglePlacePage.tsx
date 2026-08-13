import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
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
  hasCachedTripadvisorGallery,
  peekTripadvisorAttractionInfo,
  peekTripadvisorPlacePhotos,
  type TripadvisorAttractionInfo,
} from '../services/tripadvisorPlacePhotos'
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
          referrerPolicy="no-referrer"
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
  const nameTranslateKeyRef = useRef(nameTranslateKey)
  if (nameTranslateKeyRef.current !== nameTranslateKey) {
    nameTranslateKeyRef.current = nameTranslateKey
    setLlmZh(null)
    setNameZhPhase('idle')
  }

  const isAttraction = placeType === 'attraction'
  const isRestaurantLike = placeType === 'restaurant' || placeType === 'cafe'
  const skipGoogleLookup =
    skipProviderLookup || isAttraction || placeType === 'hotel'
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
  const photoRefs = isAttraction
    ? tripadvisorInfo?.photos.length
      ? tripadvisorInfo.photos
      : tripadvisorCached
    : websitePhotos.length
      ? websitePhotos
      : tripadvisorFallbackPhotos.length
        ? tripadvisorFallbackPhotos
        : tripadvisorCached.length
          ? tripadvisorCached
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
  const awaitingOfficialPhotos =
    galleryVariant !== 'booking' &&
    !skipGoogleLookup &&
    !isAttraction &&
    websitePhotos.length === 0 &&
    !websitePhotosResolved
  const galleryPending =
    galleryVariant !== 'booking' &&
    (isAttraction
      ? !tripadvisorResolved
      : !skipGoogleLookup &&
        (!websitePhotosResolved ||
          (isRestaurantLike &&
            websitePhotos.length === 0 &&
            !tripadvisorFallbackResolved)))
  const awaitingTripadvisorPhotos =
    galleryPending &&
    (isAttraction ||
      (isRestaurantLike && websitePhotosResolved && websitePhotos.length === 0))
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
  const factsSource: PlaceInfoSource | null = isAttraction
    ? tripadvisorInfo?.rating != null || tripadvisorInfo?.address
      ? 'tripadvisor'
      : null
    : details && !skipGoogleLookup
      ? 'google'
      : null
  const photoSectionReady = !galleryPending && Boolean(displayPhoto) && heroReady
  const showPhotoShimmer = !photoSectionReady
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
    if (!googleLookupReady || loading) return
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
    if (loading || !googleLookupReady || !websitePhotosResolved) return
    if (websitePhotos.length || !isRestaurantLike) {
      setTripadvisorFallbackResolved(true)
      return
    }
    const officialCached = peekCachedPlaceWebsitePhotos({
      website: details?.website,
      name: details?.name || name,
      nameLocal: details?.nameOriginal || nameLocal,
      address: details?.address,
    })
    if (officialCached.photos.length) {
      setWebsitePhotos(officialCached.photos)
      setTripadvisorFallbackResolved(true)
      return
    }
    const cachedPhotos = [
      peekTripadvisorPlacePhotos(name, nameLocal, placeType, tripadvisorContentId),
      peekTripadvisorPlacePhotos(
        details?.name || name,
        details?.nameOriginal || nameLocal,
        placeType,
        tripadvisorContentId,
      ),
    ].find((photos) => photos.length) || []
    if (cachedPhotos.length) {
      setTripadvisorFallbackPhotos(cachedPhotos)
      setTripadvisorFallbackResolved(true)
      return
    }
    let cancelled = false
    void fetchTripadvisorPlaceGallery({
      name: details?.name || name,
      nameLocal: details?.nameOriginal || nameLocal || name,
      type: placeType,
      contentId: tripadvisorContentId,
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
    websitePhotos.length,
    isRestaurantLike,
    details?.name,
    details?.nameOriginal,
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
              ? '今日 Google 地点查询次数已用完。已打开过的地点仍可从缓存查看。'
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
    if (!open || !isAttraction) {
      setTripadvisorInfo(null)
      setTripadvisorResolved(true)
      return
    }
    const peeked = peekTripadvisorAttractionInfo(
      name,
      nameLocal,
      tripadvisorContentId,
    )
    if (peeked) setTripadvisorInfo(peeked)
    if (peeked && hasCachedTripadvisorGallery(peeked.contentId)) {
      setTripadvisorResolved(true)
      return
    }
    setTripadvisorResolved(false)
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
        if (!cancelled) setTripadvisorResolved(true)
      })
    return () => {
      cancelled = true
    }
  }, [open, isAttraction, name, nameLocal, tripadvisorContentId])

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
  const priceLevelLabel = formatPriceLevelLabel(details?.priceLevel)

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
                  <span className="sr-only">正在加载地点照片</span>
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
                      referrerPolicy="no-referrer"
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
                      referrerPolicy="no-referrer"
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
                <div className="flex gap-2 overflow-hidden" aria-hidden>
                  {Array.from({ length: 9 }, (_, i) => (
                    <span
                      key={i}
                      className="relative h-14 w-20 shrink-0 rounded-lg place-hero-shimmer"
                    />
                  ))}
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

          {!providerOwnsSummary && <div className="flex flex-wrap gap-2 text-sm">
            {(isAttraction ? tripadvisorInfo?.rating : details?.rating) != null && (
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
                ★ {(isAttraction ? tripadvisorInfo?.rating : details?.rating)!.toFixed(1)}
                {(isAttraction
                  ? tripadvisorInfo?.userRatingCount
                  : details?.userRatingCount) != null
                  ? `（${isAttraction ? tripadvisorInfo?.userRatingCount : details?.userRatingCount}）`
                  : ''}
              </span>
            )}
            {priceLevelLabel && (
              <span className="rounded-full bg-[var(--mist)] px-3 py-1">{priceLevelLabel}</span>
            )}
            {details?.phone && (
              <span className="rounded-full bg-[var(--mist)] px-3 py-1">{details.phone}</span>
            )}
          </div>}

          {!providerOwnsSummary &&
            (isAttraction ? tripadvisorInfo?.address : details?.address) && (
              <p className="text-sm text-[var(--stone)]">
                {isAttraction ? tripadvisorInfo?.address : details?.address}
              </p>
            )}

          {providerDetails}

          {isAttraction
            ? null
            : reviewsSection !== undefined
              ? reviewsSection
              : details?.reviews?.length
                ? (
                    <GoogleReviewsList
                      reviews={details.reviews}
                      sourceLabel={reviewSourceLabel}
                      source="google"
                    />
                  )
                : null}

          {!isAttraction && reviewsSection === undefined && details &&
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
