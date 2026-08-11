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
        缺少地点信息，无法加载 Google Maps。
      </div>
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
        Google Maps · 可查看地点位置；在地图内点开地点卡片可看图片与评分
      </p>
    </div>
  )
}
