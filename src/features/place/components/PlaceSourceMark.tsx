export type PlaceInfoSource =
  | 'google'
  | 'tripadvisor'
  | 'booking'
  | 'website'
  | 'wikimedia'

const SOURCE_LABEL: Record<PlaceInfoSource, string> = {
  google: 'Google',
  tripadvisor: 'Tripadvisor',
  booking: 'Booking.com',
  website: '官网',
  wikimedia: 'Wikimedia',
}

function GoogleMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden
      focusable="false"
    >
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  )
}

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
  if (source === 'google') return <GoogleMark className="h-3.5 w-3.5 shrink-0" />
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

export function placeSourceLabel(source: PlaceInfoSource): string {
  return SOURCE_LABEL[source]
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
  const label = SOURCE_LABEL[source]
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
