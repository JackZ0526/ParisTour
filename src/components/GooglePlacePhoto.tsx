import { useEffect, useState } from 'react'
import { useGoogleMapsReady } from './GoogleMapsProvider'
import { fetchGooglePlacePhoto, placePhotoQuery } from '../services/googlePlacePhotos'
import type { Coordinates } from '../types'

interface Props {
  name: string
  nameLocal?: string
  location?: Coordinates
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
  fallback,
  alt,
  className = '',
  asBackground = false,
  showBadge = true,
}: Props) {
  const { isLoaded } = useGoogleMapsReady()
  const [src, setSrc] = useState(fallback)
  const [attribution, setAttribution] = useState<string | undefined>()
  const [fromGoogle, setFromGoogle] = useState(false)
  const [retried, setRetried] = useState(false)

  useEffect(() => {
    if (!isLoaded) return
    let cancelled = false
    setSrc(fallback)
    setFromGoogle(false)
    setAttribution(undefined)
    setRetried(false)
    const query = placePhotoQuery(name, nameLocal)

    void fetchGooglePlacePhoto(query, location).then((result) => {
      if (cancelled || !result?.url) return
      setSrc(result.url)
      setAttribution(result.attribution)
      setFromGoogle(true)
    })

    return () => {
      cancelled = true
    }
  }, [isLoaded, name, nameLocal, location?.lat, location?.lng, fallback])

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
      setAttribution(undefined)
    }
  }

  if (asBackground) {
    return (
      <div
        className={className}
        style={{ backgroundImage: `url(${src})` }}
        role="img"
        aria-label={alt}
        title={fromGoogle ? `Google Maps 照片${attribution ? ` · ${attribution}` : ''}` : alt}
      />
    )
  }

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <img
        src={src}
        alt={alt}
        className="h-full w-full object-cover"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        onError={handleImgError}
      />
      {fromGoogle && showBadge && src !== fallback && (
        <span className="absolute bottom-1 left-1 rounded bg-black/50 px-1.5 py-0.5 text-[10px] text-white">
          Google{attribution ? ` · ${attribution}` : ''}
        </span>
      )}
    </div>
  )
}
