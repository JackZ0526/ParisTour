import { useEffect, useState } from 'react'
import { peekGooglePlaceDetails, peekGooglePlacePhotoMedia } from '../../map/services/googlePlaceDetails'
import {
  fetchTripadvisorPlaceGallery,
  peekTripadvisorPlacePhotos,
} from '../services/tripadvisorPlacePhotos'
import {
  fetchPlaceWebsitePhotosWithFallback,
  peekCachedPlaceWebsitePhotos,
} from '../services/placeWebsitePhotos'
import { withGoogleMapsPhotoKey } from '../../map/services/googleMapsKey'
import {
  fetchWikimediaPlacePhoto,
  peekWikimediaPlacePhoto,
  type WikimediaPlacePhoto,
} from '../../map/services/wikimediaPlacePhotos'
import type { Coordinates, PlaceType } from '../../../types'

interface Props {
  name: string
  nameLocal?: string
  googlePlaceId?: string
  tripadvisorContentId?: string
  location?: Coordinates
  type?: PlaceType
  /** Static fallback (Unsplash etc.) while loading or if Places fails */
  fallback: string
  alt: string
  className?: string
  asBackground?: boolean
  showBadge?: boolean
}

function withCacheBust(url: string): string {
  try {
    const u = new URL(url)
    u.searchParams.set('_pt', String(Date.now()))
    return u.toString()
  } catch {
    return url
  }
}

function isUnsplashFallback(url: string): boolean {
  return /images\.unsplash\.com/i.test(url)
}

/** Google Place Photo URLs 403 without a live photo fetch; never put them on <img>. */
function isDisplayablePhotoUrl(url: string): boolean {
  if (!/^https?:\/\//i.test(url)) return false
  if (url.includes('places.googleapis.com')) return false
  if (url.includes('maps.googleapis.com/maps/api/place/photo')) return false
  return true
}

function isPlaceholderFallback(url: string): boolean {
  return !isDisplayablePhotoUrl(url) || isUnsplashFallback(url)
}

function displayableSrc(url: string): string {
  return isDisplayablePhotoUrl(url) ? url : ''
}

function PhotoPlaceholder() {
  return (
    <span
      className="absolute inset-0 flex items-center justify-center bg-[var(--mist)]"
      aria-hidden
    >
      <svg
        viewBox="0 0 24 24"
        className="h-6 w-6 text-[var(--stone)]/40"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="5" width="18" height="14" rx="2.2" />
        <circle cx="8.5" cy="9.5" r="1.2" />
        <path d="m21 16-4.2-4.2a1.5 1.5 0 0 0-2.1 0L6 20" />
      </svg>
    </span>
  )
}

export function GooglePlacePhoto({
  name,
  nameLocal,
  googlePlaceId,
  tripadvisorContentId,
  location,
  type,
  fallback,
  alt,
  className = '',
  asBackground = false,
  showBadge = true,
}: Props) {
  const fallbackSrc = withGoogleMapsPhotoKey(fallback) || fallback
  const [src, setSrc] = useState(() => (isPlaceholderFallback(fallbackSrc) ? '' : fallbackSrc))
  const [loading, setLoading] = useState(() => isPlaceholderFallback(fallbackSrc))
  const [attribution, setAttribution] = useState<string | undefined>()
  const [fromGoogle, setFromGoogle] = useState(false)
  const [wikimedia, setWikimedia] = useState<WikimediaPlacePhoto | null>(null)
  const [retried, setRetried] = useState(false)
  const locationLat = location?.lat
  const locationLng = location?.lng

  useEffect(() => {
    let cancelled = false
    const genericFallback = isPlaceholderFallback(fallbackSrc)
    setSrc(genericFallback ? '' : fallbackSrc)
    setLoading(genericFallback)
    setFromGoogle(false)
    setWikimedia(null)
    setAttribution(undefined)
    setRetried(false)
    const queryLocation =
      locationLat != null && locationLng != null
        ? { lat: locationLat, lng: locationLng }
        : undefined

    if (type === 'hotel' || type === 'transport' || asBackground) {
      setSrc(displayableSrc(fallbackSrc))
      setLoading(false)
      return
    }

    if (type === 'attraction') {
      const tripadvisorPhoto = peekTripadvisorPlacePhotos(
        name,
        nameLocal,
        type,
        tripadvisorContentId,
      )[0]
      if (tripadvisorPhoto) {
        setSrc(tripadvisorPhoto)
        setLoading(false)
        return
      }
      const originalName = name.trim() || nameLocal?.trim() || ''
      void (async () => {
        const gallery = await fetchTripadvisorPlaceGallery({
          name,
          nameLocal,
          type,
          contentId: tripadvisorContentId,
        }).catch(() => null)
        if (cancelled) return
        if (gallery?.photos[0]) {
          setSrc(gallery.photos[0])
          setLoading(false)
          return
        }
        if (queryLocation && originalName) {
          const cachedWiki = peekWikimediaPlacePhoto(originalName, queryLocation)
          if (cachedWiki?.url) {
            setSrc(cachedWiki.url)
            setWikimedia(cachedWiki)
            setLoading(false)
            return
          }
          const wiki = await fetchWikimediaPlacePhoto(originalName, queryLocation)
          if (cancelled) return
          if (wiki?.url) {
            setSrc(wiki.url)
            setWikimedia(wiki)
            setLoading(false)
            return
          }
        }
        if (!cancelled) {
          setSrc(displayableSrc(fallbackSrc))
          setLoading(false)
        }
      })()
      return
    }

    const cachedDetails = peekGooglePlaceDetails(
      name,
      nameLocal,
      queryLocation,
      googlePlaceId,
    )
    const websiteCache = peekCachedPlaceWebsitePhotos({
      website: cachedDetails?.website,
      name: cachedDetails?.name || name,
      nameLocal: cachedDetails?.nameOriginal || nameLocal,
      address: cachedDetails?.address,
    })
    if (websiteCache.photos[0]) {
      setSrc(websiteCache.photos[0])
      setLoading(false)
      return
    }
    const tripadvisorPhoto = peekTripadvisorPlacePhotos(name, nameLocal, type, tripadvisorContentId)[0]
    if (tripadvisorPhoto) {
      setSrc(tripadvisorPhoto)
      setLoading(false)
      return
    }
    const googlePhoto = cachedDetails?.photos?.[0]
    const cachedUri = googlePhoto
      ? peekGooglePlacePhotoMedia(googlePhoto, cachedDetails?.id)
      : null
    const keyedGoogleUri = cachedUri ? withGoogleMapsPhotoKey(cachedUri) || cachedUri : ''
    if (keyedGoogleUri && isDisplayablePhotoUrl(keyedGoogleUri)) {
      setSrc(keyedGoogleUri)
      setFromGoogle(true)
      setLoading(false)
      return
    }

    const originalName = name.trim() || nameLocal?.trim() || ''

    void (async () => {
      if (originalName && !websiteCache.miss) {
        const website = await fetchPlaceWebsitePhotosWithFallback({
          website: cachedDetails?.website,
          name: cachedDetails?.name || name,
          nameLocal: cachedDetails?.nameOriginal || nameLocal,
          address: cachedDetails?.address,
        }).catch(() => ({ photos: [] as string[] }))
        if (cancelled) return
        if (website.photos[0]) {
          setSrc(website.photos[0])
          setLoading(false)
          return
        }
      }

      if (
        (type === 'restaurant' || type === 'cafe') &&
        cachedDetails &&
        !peekCachedPlaceWebsitePhotos({
          website: cachedDetails.website,
          name: cachedDetails.name || name,
          nameLocal: cachedDetails.nameOriginal || nameLocal,
          address: cachedDetails.address,
        }).photos.length
      ) {
        const gallery = await fetchTripadvisorPlaceGallery({
          name,
          nameLocal,
          type,
          contentId: tripadvisorContentId,
        }).catch(() => null)
        if (cancelled) return
        if (gallery?.photos[0]) {
          setSrc(gallery.photos[0])
          setLoading(false)
          return
        }
      }

      if (!cancelled) {
        setSrc(displayableSrc(fallbackSrc))
        setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [
    name,
    nameLocal,
    googlePlaceId,
    tripadvisorContentId,
    locationLat,
    locationLng,
    fallbackSrc,
    type,
    asBackground,
  ])

  function handleImgError() {
    if (fromGoogle && !retried && src !== fallbackSrc) {
      setRetried(true)
      setSrc(withCacheBust(src))
      return
    }
    const next =
      src !== fallbackSrc && isDisplayablePhotoUrl(fallbackSrc) ? fallbackSrc : ''
    setSrc(next)
    setFromGoogle(false)
    setWikimedia(null)
    setAttribution(undefined)
    setLoading(false)
  }

  const showShimmer = loading
  const showPlaceholder = !loading && !src

  if (asBackground) {
    return (
      <div
        className={`relative overflow-hidden ${className}`}
        style={{ backgroundImage: src ? `url(${src})` : undefined }}
        role="img"
        aria-label={alt}
        aria-busy={showShimmer || undefined}
        title={
          wikimedia
            ? `Wikimedia Commons${wikimedia.attribution ? ` · ${wikimedia.attribution}` : ''}${wikimedia.license ? ` · ${wikimedia.license}` : ''}`
            : fromGoogle
              ? `地图照片${attribution ? ` · ${attribution}` : ''}`
              : alt
        }
      >
        {showShimmer ? (
          <span className="absolute inset-0 place-hero-shimmer" aria-hidden />
        ) : null}
        {showPlaceholder ? <PhotoPlaceholder /> : null}
      </div>
    )
  }

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      aria-busy={showShimmer || undefined}
    >
      {showShimmer ? (
        <span className="absolute inset-0 place-hero-shimmer" aria-hidden />
      ) : null}
      {showPlaceholder ? <PhotoPlaceholder /> : null}
      {src ? (
        <img
          src={src}
          alt={alt}
          className={`h-full w-full object-cover motion-safe:transition-opacity motion-safe:duration-300 ${
            loading ? 'opacity-0' : 'opacity-100'
          }`}
          loading="lazy"
          referrerPolicy="no-referrer"
          onLoad={() => setLoading(false)}
          onError={handleImgError}
        />
      ) : null}
      {fromGoogle && showBadge && src && src !== fallbackSrc && !loading && (
        <span className="absolute bottom-1 left-1 rounded bg-black/50 px-1.5 py-0.5 text-[10px] text-white">
          地图{attribution ? ` · ${attribution}` : ''}
        </span>
      )}
      {wikimedia && showBadge && src && src !== fallbackSrc && !loading && (
        <a
          href={wikimedia.sourcePage}
          target="_blank"
          rel="noreferrer"
          className="absolute bottom-1 left-1 max-w-[calc(100%-0.5rem)] truncate rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white backdrop-blur-sm"
          title={`${wikimedia.attribution || 'Wikimedia Commons'}${wikimedia.license ? ` · ${wikimedia.license}` : ''}`}
        >
          Wikimedia Commons{wikimedia.license ? ` · ${wikimedia.license}` : ''}
        </a>
      )}
    </div>
  )
}
