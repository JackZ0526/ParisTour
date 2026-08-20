import {
  useLayoutEffect,
  useRef,
  useState,
  type HTMLAttributeReferrerPolicy,
} from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { PlaceSourceMark } from './PlaceSourceMark'
import {
  placeSourceLabel,
  type PlaceInfoSource,
} from '../services/placeSource'

export const photoSlideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? '100%' : direction < 0 ? '-100%' : 0,
    opacity: 0,
    scale: 0.96,
  }),
  center: {
    x: 0,
    opacity: 1,
    scale: 1,
  },
  exit: (direction: number) => ({
    x: direction < 0 ? '100%' : '-100%',
    opacity: 0,
    scale: 0.96,
  }),
}

export function photoReferrerPolicy(url?: string): HTMLAttributeReferrerPolicy {
  if (!url) return 'no-referrer-when-downgrade'
  if (
    url.includes('places.googleapis.com') ||
    url.includes('maps.googleapis.com/maps/api/place/photo')
  ) {
    return 'origin'
  }
  return 'no-referrer-when-downgrade'
}

export function GalleryThumb({
  url,
  selected,
  onSelect,
  onError,
  buttonRef,
  animateIn = false,
  enterDelayMs = 0,
}: {
  url?: string
  selected: boolean
  onSelect: () => void
  onError?: (url: string) => void
  buttonRef?: (el: HTMLButtonElement | null) => void
  animateIn?: boolean
  enterDelayMs?: number
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
    <motion.button
      ref={buttonRef}
      type="button"
      onClick={onSelect}
      whileTap={{ scale: 0.92 }}
      animate={{
        scale: selected ? 1.05 : 0.97,
      }}
      transition={{ type: 'spring', stiffness: 450, damping: 32 }}
      style={animateIn ? { animationDelay: `${enterDelayMs}ms` } : undefined}
      className={`relative h-14 w-20 shrink-0 overflow-hidden rounded-xl bg-[var(--mist)] outline-none transition-shadow ${
        selected
          ? 'ring-2 ring-[var(--copper)] ring-offset-2 ring-offset-black/20 shadow-md z-10'
          : 'hover:brightness-105'
      } ${animateIn ? 'place-gallery-thumb-enter' : ''}`}
    >
      {!ready && (
        <span className="absolute inset-0 day-tab-shimmer" aria-hidden />
      )}
      <span
        className={`pointer-events-none absolute inset-0 z-[2] transition-opacity duration-200 ${
          selected ? 'opacity-0' : 'bg-black/20 opacity-100'
        }`}
        aria-hidden
      />
      {url ? (
        <img
          ref={imgRef}
          src={url}
          alt=""
          className={`relative z-[1] h-full w-full object-cover select-none motion-safe:transition-opacity motion-safe:duration-300 ${
            ready ? 'opacity-100' : 'opacity-0'
          }`}
          referrerPolicy={photoReferrerPolicy(url)}
          onLoad={() => setReady(true)}
          onError={() => onError?.(url)}
          draggable={false}
        />
      ) : null}
    </motion.button>
  )
}

export interface PlacePhotoGalleryProps {
  photos: string[]
  photoIndex: number
  onPhotoIndexChange: (index: number) => void
  alt: string
  photoSource?: PlaceInfoSource | null
  wikimediaPhoto?: {
    url: string
    sourcePage?: string
    attribution?: string
    license?: string
  } | null
  showPhotoShimmer?: boolean
  animateGalleryThumbs?: boolean
  heightClass?: string
  onFailedPhoto?: (failedUrl: string) => void
  lazyAdvance?: {
    onAdvance: () => void
    loading?: boolean
    hasMore?: boolean
  }
}

export function PlacePhotoGallery({
  photos,
  photoIndex,
  onPhotoIndexChange,
  alt,
  photoSource,
  wikimediaPhoto,
  showPhotoShimmer = false,
  animateGalleryThumbs = false,
  heightClass = 'h-[min(56vw,14rem)] sm:h-72',
  onFailedPhoto,
  lazyAdvance,
}: PlacePhotoGalleryProps) {
  const [photoDirection, setPhotoDirection] = useState(0)
  const [isZoomed, setIsZoomed] = useState(false)
  const [heroReady, setHeroReady] = useState(false)
  const lastTapTime = useRef(0)
  const thumbRefs = useRef<(HTMLButtonElement | null)[]>([])
  const heroImgRef = useRef<HTMLImageElement>(null)

  const galleryLength = photos.length
  const displayPhoto = photos[photoIndex] || photos[0] || ''

  function stepPhoto(delta: number) {
    setIsZoomed(false)
    if (delta < 0) {
      if (galleryLength < 2) return
      setPhotoDirection(-1)
      onPhotoIndexChange((photoIndex - 1 + galleryLength) % galleryLength)
      return
    }

    if (
      lazyAdvance?.hasMore &&
      lazyAdvance.onAdvance &&
      (galleryLength <= 1 || photoIndex >= galleryLength - 1)
    ) {
      lazyAdvance.onAdvance()
      return
    }

    if (galleryLength < 2) return
    setPhotoDirection(1)
    onPhotoIndexChange((photoIndex + 1) % galleryLength)
  }

  function selectPhoto(index: number) {
    if (index === photoIndex) return
    setIsZoomed(false)
    setPhotoDirection(index > photoIndex ? 1 : -1)
    onPhotoIndexChange(index)
  }

  useLayoutEffect(() => {
    thumbRefs.current[photoIndex]?.scrollIntoView({
      inline: 'center',
      block: 'nearest',
      behavior: 'smooth',
    })
  }, [photoIndex])

  if (!displayPhoto && !showPhotoShimmer) return null

  return (
    <div className="space-y-2">
      <div
        className={`relative ${heightClass} overflow-hidden rounded-2xl bg-[var(--mist)] select-none [touch-action:pan-y]`}
        aria-busy={showPhotoShimmer || undefined}
      >
        <span
          className={`absolute inset-0 z-[2] place-hero-shimmer motion-safe:transition-opacity motion-safe:duration-300 ${
            showPhotoShimmer ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
          aria-hidden
        />
        <AnimatePresence initial={false} custom={photoDirection}>
          {displayPhoto ? (
            <motion.div
              key={displayPhoto}
              custom={photoDirection}
              variants={photoSlideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{
                x: { type: 'spring', stiffness: 340, damping: 32, mass: 0.6 },
                opacity: { duration: 0.2 },
                scale: { duration: 0.2 },
              }}
              drag={galleryLength > 1 ? 'x' : false}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.22}
              dragDirectionLock
              onDragEnd={(_, { offset, velocity }) => {
                if (offset.x < -45 || velocity.x < -300) {
                  stepPhoto(1)
                } else if (offset.x > 45 || velocity.x > 300) {
                  stepPhoto(-1)
                }
              }}
              className="absolute inset-0 flex h-full w-full select-none items-center justify-center cursor-grab active:cursor-grabbing"
            >
              <img
                src={displayPhoto}
                alt=""
                aria-hidden
                className={`pointer-events-none absolute inset-0 h-full w-full scale-125 object-cover blur-2xl motion-safe:transition-opacity motion-safe:duration-300 ${
                  heroReady ? 'opacity-80' : 'opacity-0'
                }`}
                referrerPolicy={photoReferrerPolicy(displayPhoto)}
                draggable={false}
              />
              <span
                className={`pointer-events-none absolute inset-0 bg-white/25 motion-safe:transition-opacity motion-safe:duration-300 ${
                  heroReady ? 'opacity-100' : 'opacity-0'
                }`}
                aria-hidden
              />
              <motion.img
                ref={heroImgRef}
                src={displayPhoto}
                alt={alt}
                animate={{ scale: isZoomed ? 2 : 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                onDoubleClick={() => setIsZoomed((z) => !z)}
                onTouchEnd={(e) => {
                  const now = Date.now()
                  if (now - lastTapTime.current < 280) {
                    e.preventDefault()
                    setIsZoomed((z) => !z)
                  }
                  lastTapTime.current = now
                }}
                className={`relative z-[1] h-full w-full object-contain pointer-events-none select-none motion-safe:transition-opacity motion-safe:duration-300 ${
                  heroReady ? 'opacity-100' : 'opacity-0'
                }`}
                referrerPolicy={photoReferrerPolicy(displayPhoto)}
                draggable={false}
                fetchPriority="high"
                decoding="async"
                onLoad={() => setHeroReady(true)}
                onError={() => onFailedPhoto?.(displayPhoto)}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>

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

        {photoSource && photoSource !== 'wikimedia' && displayPhoto && heroReady && (
          <span
            className="absolute bottom-2 left-2 z-10"
            aria-label={`图片来自 ${placeSourceLabel(photoSource)}`}
          >
            <PlaceSourceMark source={photoSource} onPhoto />
          </span>
        )}

        {galleryLength > 1 && (
          <>
            <button
              type="button"
              aria-label="上一张"
              onClick={() => stepPhoto(-1)}
              className="absolute left-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition-opacity hover:bg-black/65 active:scale-95 disabled:pointer-events-none disabled:opacity-0"
            >
              <ChevronLeft size={16} strokeWidth={2.2} aria-hidden />
            </button>
            <button
              type="button"
              aria-label="下一张"
              onClick={() => stepPhoto(1)}
              disabled={lazyAdvance?.loading}
              className="absolute right-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition-opacity hover:bg-black/65 active:scale-95 disabled:opacity-60"
            >
              <ChevronRight size={16} strokeWidth={2.2} aria-hidden />
            </button>
            <div className="absolute bottom-2.5 right-2.5 z-10 flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-0.5 text-[11px] font-medium text-white shadow-sm backdrop-blur-md">
              <motion.span
                key={photoIndex}
                initial={{ opacity: 0.3, y: photoDirection >= 0 ? 3 : -3 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15 }}
                className="tabular-nums font-semibold"
              >
                {photoIndex + 1}
              </motion.span>
              <span className="opacity-60">/</span>
              <span className="tabular-nums opacity-80">{galleryLength}</span>
              {lazyAdvance?.hasMore ? '+' : ''}
            </div>
          </>
        )}
      </div>

      {galleryLength > 1 && (
        <div className="min-h-0 overflow-hidden">
          <div
            className={`mt-2 flex gap-2.5 overflow-x-auto px-1 py-1.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
              animateGalleryThumbs ? 'place-gallery-strip-enter' : ''
            }`}
          >
            {photos.map((url, i) => (
              <GalleryThumb
                key={url + i}
                url={url}
                selected={i === photoIndex}
                onSelect={() => selectPhoto(i)}
                animateIn={animateGalleryThumbs}
                enterDelayMs={Math.min(i, 10) * 35}
                onError={onFailedPhoto}
                buttonRef={(el) => {
                  thumbRefs.current[i] = el
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
