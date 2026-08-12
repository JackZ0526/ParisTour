import { useEffect, useState } from 'react'
import {
  fetchGooglePlacePhoto,
  peekGooglePlacePhoto,
  placePhotoQuery,
} from '../../map/services/googlePlacePhotos'
import {
  fetchWikimediaPlacePhoto,
  peekWikimediaPlacePhoto,
  type WikimediaPlacePhoto,
} from '../../map/services/wikimediaPlacePhotos'
import type { Coordinates, PlaceType } from '../../../types'

interface Props {
  name: string
  nameLocal?: string
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

export function GooglePlacePhoto({
  name,
  nameLocal,
  location,
  type,
  fallback,
  alt,
  className = '',
  asBackground = false,
  showBadge = true,
}: Props) {
  const [src, setSrc] = useState(fallback)
  const [attribution, setAttribution] = useState<string | undefined>()
  const [fromGoogle, setFromGoogle] = useState(false)
  const [wikimedia, setWikimedia] = useState<WikimediaPlacePhoto | null>(null)
  const [retried, setRetried] = useState(false)
  const locationLat = location?.lat
  const locationLng = location?.lng

  useEffect(() => {
    let cancelled = false
    setSrc(fallback)
    setFromGoogle(false)
    setWikimedia(null)
    setAttribution(undefined)
    setRetried(false)
    const query = placePhotoQuery(name, nameLocal)
    const queryLocation =
      locationLat != null && locationLng != null
        ? { lat: locationLat, lng: locationLng }
        : undefined

    if (type === 'attraction' && queryLocation) {
      const originalName = name.trim() || nameLocal?.trim() || ''
      if (!originalName) return
      const cached = peekWikimediaPlacePhoto(originalName, queryLocation)
      if (cached?.url) {
        setSrc(cached.url)
        setWikimedia(cached)
        return
      }
      void fetchWikimediaPlacePhoto(originalName, queryLocation).then((result) => {
        if (cancelled || !result?.url) return
        setSrc(result.url)
        setWikimedia(result)
      })
      return () => {
        cancelled = true
      }
    }

    // Timeline and hotel cards already have a usable static image. Do not turn
    // every card mount/tab switch (or a cached Places URL reload) into a paid
    // photo-media request.
    if (fallback) return

    const cached = peekGooglePlacePhoto(query, queryLocation)
    if (cached?.url) {
      setSrc(cached.url)
      setAttribution(cached.attribution)
      setFromGoogle(true)
      return
    }

    void fetchGooglePlacePhoto(query, queryLocation).then((result) => {
      if (cancelled || !result?.url) return
      setSrc(result.url)
      setAttribution(result.attribution)
      setFromGoogle(true)
    })

    return () => {
      cancelled = true
    }
  }, [name, nameLocal, locationLat, locationLng, fallback, type])

  function handleImgError() {
    if (fromGoogle && !retried && src !== fallback) {
      // Bust stale 403/error cache from earlier referrer failures.
      setRetried(true)
      setSrc(withCacheBust(src))
      return
    }
    if (src !== fallback) {
      setSrc(fallback)
      setFromGoogle(false)
      setWikimedia(null)
      setAttribution(undefined)
    }
  }

  if (asBackground) {
    return (
      <div
        className={className}
        style={{ backgroundImage: src ? `url(${src})` : undefined }}
        role="img"
        aria-label={alt}
        title={
          wikimedia
            ? `Wikimedia Commons${wikimedia.attribution ? ` · ${wikimedia.attribution}` : ''}${wikimedia.license ? ` · ${wikimedia.license}` : ''}`
            : fromGoogle
              ? `地图照片${attribution ? ` · ${attribution}` : ''}`
              : alt
        }
      />
    )
  }

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {src ? (
        <img
          src={src}
          alt={alt}
          className="h-full w-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          onError={handleImgError}
        />
      ) : (
        <span className="block h-full w-full bg-[var(--mist)]" aria-hidden />
      )}
      {fromGoogle && showBadge && src !== fallback && (
        <span className="absolute bottom-1 left-1 rounded bg-black/50 px-1.5 py-0.5 text-[10px] text-white">
          地图{attribution ? ` · ${attribution}` : ''}
        </span>
      )}
      {wikimedia && showBadge && src !== fallback && (
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
