import {
  placeSourceLabel,
  type PlaceInfoSource,
} from '../services/placeSource'

function BrandImage({
  src,
  className,
}: {
  src: string
  className?: string
}) {
  return (
    <img
      src={src}
      alt=""
      aria-hidden
      draggable={false}
      className={`${className} object-contain`}
    />
  )
}

function SourceLogo({ source }: { source: PlaceInfoSource }) {
  if (source === 'google') {
    return <BrandImage src="/brand/google.svg" className="h-3.5 w-3.5 shrink-0" />
  }
  if (source === 'tripadvisor') {
    return <BrandImage src="/brand/tripadvisor.svg" className="h-3.5 w-3.5 shrink-0" />
  }
  if (source === 'booking') {
    return (
      <BrandImage
        src="/brand/booking-com.png"
        className="h-3.5 w-[3.6rem] shrink-0 object-left"
      />
    )
  }
  return null
}

export function PlaceSourceMark({
  source,
  showLabel = true,
  onPhoto = false,
  className = '',
}: {
  source: PlaceInfoSource
  showLabel?: boolean
  onPhoto?: boolean
  className?: string
}) {
  const label = placeSourceLabel(source)
  const showText = showLabel && source !== 'booking'
  const inner = (
    <>
      <SourceLogo source={source} />
      {showText ? <span>{label}</span> : null}
    </>
  )

  if (onPhoto) {
    const photoClass =
      source === 'booking'
        ? 'inline-flex items-center rounded-full bg-white/92 px-2 py-1 shadow-sm backdrop-blur-sm'
        : 'inline-flex items-center gap-1 rounded-full bg-black/50 px-2 py-1 text-[10px] font-medium text-white backdrop-blur-sm'
    return (
      <span className={`${photoClass} ${className}`} title={`图片来自 ${label}`}>
        {inner}
      </span>
    )
  }

  return (
    <span
      className={`inline-flex items-center gap-1 ${className}`}
      title={`信息来自 ${label}`}
    >
      {inner}
    </span>
  )
}
