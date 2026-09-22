import { uiCopy } from '../../../shared/i18n/copy/ui'
import { getGoogleMapsApiKey, googleMapsEmbedApiUrl } from '../services/googleMapsKey'

interface Props {
  query: string
  lat?: number
  lng?: number
  title?: string
  className?: string
  /** Prefer official Embed API (needs Maps Embed API enabled). Default: classic Google embed. */
  preferOfficialEmbed?: boolean
}

/** Classic Google Maps embed — works without Maps Embed API activation. */
function classicEmbedUrl(query: string, lat?: number, lng?: number): string {
  const q =
    query.trim() ||
    (typeof lat === 'number' && typeof lng === 'number' ? `${lat},${lng}` : '')
  return `https://www.google.com/maps?q=${encodeURIComponent(q)}&z=16&hl=zh-CN&output=embed`
}

export function GoogleMapsEmbed({
  query,
  lat,
  lng,
  title = 'Google Maps',
  className = '',
  preferOfficialEmbed = true,
}: Props) {
  const apiKey = getGoogleMapsApiKey()
  const searchQuery =
    query.trim() ||
    (typeof lat === 'number' && typeof lng === 'number' ? `${lat},${lng}` : '')

  if (!searchQuery) {
    return (
      <div className={`rounded-xl bg-[var(--mist)]/40 px-4 py-6 text-sm text-[var(--stone)] ${className}`}>
        {uiCopy('m21a9effc7c', undefined)}</div>
    )
  }

  // Official Embed API requires "Maps Embed API" enabled on the Cloud project.
  // Classic output=embed still shows Google Maps and does not need that activation.
  const src =
    preferOfficialEmbed && apiKey
      ? googleMapsEmbedApiUrl(searchQuery, apiKey)
      : classicEmbedUrl(searchQuery, lat, lng)

  return (
    <div className={`overflow-hidden rounded-xl border border-[var(--mist)] bg-[var(--mist)]/40 ${className}`}>
      <iframe
        title={title}
        src={src}
        className="h-[280px] w-full border-0 md:h-[340px]"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        allowFullScreen
      />
      <p className="px-3 py-2 text-xs text-[var(--stone)]">
        {uiCopy('m2c0a037dc0', undefined)}</p>
    </div>
  )
}
