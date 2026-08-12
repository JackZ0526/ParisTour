import { useMemo, useState } from 'react'
import type { Coordinates } from '../../../types'

interface Props {
  name: string
  nameLocal?: string
  location?: Coordinates
  /** Saved, catalog, Wikimedia, or other non-Google image. */
  fallback: string
  alt: string
  className?: string
  asBackground?: boolean
  /** @deprecated Kept for caller compatibility. */
  showBadge?: boolean
}

function isGoogleHostedPhoto(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return (
      host === 'places.googleapis.com' ||
      host.endsWith('.googleusercontent.com') ||
      host.endsWith('.ggpht.com')
    )
  } catch {
    return false
  }
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&apos;',
    }
    return entities[char]
  })
}

function placeholderUrl(name: string): string {
  const initial = escapeXml(Array.from(name.trim())[0] || '·')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#dfe6df"/><stop offset="1" stop-color="#c8d2ca"/></linearGradient></defs>
  <rect width="640" height="480" fill="url(#g)"/>
  <circle cx="320" cy="230" r="82" fill="#4a6356" opacity=".92"/>
  <text x="320" y="257" text-anchor="middle" fill="#fff" font-family="Arial,sans-serif" font-size="72" font-weight="700">${initial}</text>
  </svg>`
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

function usablePhoto(url: string, placeholder: string): string {
  const trimmed = url.trim()
  return trimmed && !isGoogleHostedPhoto(trimmed) ? trimmed : placeholder
}

/** Image renderer that rejects legacy Google-hosted photo media. */
export function PlacePhoto({
  name,
  fallback,
  alt,
  className = '',
  asBackground = false,
}: Props) {
  const placeholder = useMemo(() => placeholderUrl(name), [name])
  const initial = useMemo(
    () => usablePhoto(fallback, placeholder),
    [fallback, placeholder],
  )
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const src = failedSrc === initial ? placeholder : initial

  if (asBackground) {
    return (
      <div
        className={className}
        style={{ backgroundImage: `url(${src})` }}
        role="img"
        aria-label={alt}
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
        onError={() => setFailedSrc(initial)}
      />
    </div>
  )
}
