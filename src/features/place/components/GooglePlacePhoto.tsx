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
  const [src, setSrc] = useState(() => (isUnsplashFallback(fallbackSrc) ? '' : fallbackSrc))
  const [loading, setLoading] = useState(() => isUnsplashFallback(fallbackSrc))
  const [attribution, setAttribution] = useState<string | undefined>()
  const [fromGoogle, setFromGoogle] = useState(false)
  const [wikimedia, setWikimedia] = useState<WikimediaPlacePhoto | null>(null)
  const [retried, setRetried] = useState(false)
  const locationLat = location?.lat
  const locationLng = location?.lng

  useEffect(() => {
    let cancelled = false
    const genericFallback = isUnsplashFallback(fallbackSrc)
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
      setSrc(fallbackSrc)
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
          setSrc(fallbackSrc)
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
    const websitePhoto = peekCachedPlaceWebsitePhotos({
      website: cachedDetails?.website,
      name: cachedDetails?.name || name,
      nameLocal: cachedDetails?.nameOriginal || nameLocal,
      address: cachedDetails?.address,
    }).photos[0]
    if (websitePhoto) {
      setSrc(websitePhoto)
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
    if (cachedUri) {
      setSrc(withGoogleMapsPhotoKey(cachedUri) || cachedUri)
      setFromGoogle(true)
      setLoading(false)
      return
    }

    const originalName = name.trim() || nameLocal?.trim() || ''

    void (async () => {
      if (originalName) {
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
        setSrc(fallbackSrc)
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
    if (src !== fallbackSrc) {
      setSrc(fallbackSrc)
      setFromGoogle(false)
      setWikimedia(null)
      setAttribution(undefined)
      setLoading(false)
    }
  }

  const showShimmer = loading || !src

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
          <span className="absolute inset-0 day-tab-shimmer" aria-hidden />
        ) : null}
      </div>
    )
  }

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      aria-busy={showShimmer || undefined}
    >
      {showShimmer ? (
        <span className="absolute inset-0 day-tab-shimmer" aria-hidden />
      ) : null}
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
