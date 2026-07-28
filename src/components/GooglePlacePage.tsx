import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  fetchGooglePlaceDetails,
  placeDetailsQuery,
  type GooglePlaceDetails,
} from '../services/googlePlaceDetails'
import { getGoogleMapsApiKey, googleMapsEmbedApiUrl } from '../services/googleMapsKey'
import type { Coordinates } from '../types'
import { GoogleReviewsList } from './GoogleReviewsList'
import { useGoogleMapsReady } from './GoogleMapsProvider'
import { LoadingIndicator } from './LoadingIndicator'

export interface LlmPlaceNarrative {
  intro?: string
  reason?: string
  tripFit?: string
  loading?: boolean
  /** Customize section copy; defaults suit hotels, override for places. */
  labels?: {
    title?: string
    intro?: string
    reason?: string
    tripFit?: string
    loadingText?: string
    loadingMoreText?: string
  }
}

interface Props {
  open: boolean
  name: string
  nameLocal?: string
  location?: Coordinates
  fallbackImage?: string
  showMap?: boolean
  /** Optional LLM story block (used for hotel detail). */
  llmNarrative?: LlmPlaceNarrative | null
  /** Sticky footer (e.g. custom-hotel decision buttons). */
  footer?: ReactNode
  /** When true, backdrop / Esc call onClose (default true). */
  closeOnBackdrop?: boolean
  onClose: () => void
}

export function GooglePlacePage({
  open,
  name,
  nameLocal,
  location,
  fallbackImage,
  showMap = true,
  llmNarrative,
  footer,
  closeOnBackdrop = true,
  onClose,
}: Props) {
  const { isLoaded } = useGoogleMapsReady()
  const [details, setDetails] = useState<GooglePlaceDetails | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [photoIndex, setPhotoIndex] = useState(0)
  const swipeStartX = useRef<number | null>(null)

  const query = placeDetailsQuery(name, nameLocal)
  const apiKey = getGoogleMapsApiKey()
  const embedSrc = googleMapsEmbedApiUrl(query, apiKey)

  const photos =
    details?.photos?.length ? details.photos : fallbackImage ? [fallbackImage] : []
  const activePhoto = photos[photoIndex] || photos[0]

  function stepPhoto(delta: number) {
    if (photos.length < 2) return
    setPhotoIndex((i) => (i + delta + photos.length) % photos.length)
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && closeOnBackdrop) {
        onClose()
        return
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        stepPhoto(-1)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        stepPhoto(1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onClose, closeOnBackdrop, photos.length])

  useEffect(() => {
    if (!open || !isLoaded) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setPhotoIndex(0)

    void fetchGooglePlaceDetails(query, location)
      .then((result) => {
        if (cancelled) return
        if (!result) {
          setError('未找到该地点的 Google 详情。')
          setDetails(null)
        } else {
          setDetails(result)
        }
      })
      .catch(() => {
        if (!cancelled) setError('加载 Google 地点详情失败。请确认已启用 Places API (New)。')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, isLoaded, query, location?.lat, location?.lng])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[2000] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="关闭"
        onClick={() => {
          if (closeOnBackdrop) onClose()
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${name} Google 地点页`}
        className="relative z-10 flex max-h-[min(92vh,100dvh)] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl bg-[var(--paper)] shadow-[var(--shadow)] sm:rounded-3xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--mist)] px-4 py-3">
          <div>
            <h3 className="font-display text-2xl leading-tight">{details?.name || name}</h3>
            {nameLocal && (
              <p className="text-sm text-[var(--stone)]">{nameLocal}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-[var(--ink)] px-3 py-1.5 text-sm text-[var(--paper)]"
          >
            关闭
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4">
          {loading && (
            <LoadingIndicator label="正在加载 Google 地点信息…" showDots size="sm" />
          )}
          {error && <p className="text-sm text-amber-800">{error}</p>}

          {activePhoto && (
            <div className="space-y-2">
              <div
                className="relative overflow-hidden rounded-2xl select-none"
                onPointerDown={(e) => {
                  if (photos.length < 2) return
                  swipeStartX.current = e.clientX
                }}
                onPointerUp={(e) => {
                  if (swipeStartX.current == null || photos.length < 2) return
                  const dx = e.clientX - swipeStartX.current
                  swipeStartX.current = null
                  if (Math.abs(dx) < 40) return
                  stepPhoto(dx < 0 ? 1 : -1)
                }}
                onPointerCancel={() => {
                  swipeStartX.current = null
                }}
              >
                <img
                  src={activePhoto}
                  alt={details?.name || name}
                  className="h-56 w-full object-cover sm:h-72"
                  referrerPolicy="no-referrer"
                  draggable={false}
                />
                {photos.length > 1 && (
                  <>
                    <button
                      type="button"
                      aria-label="上一张"
                      onClick={() => stepPhoto(-1)}
                      className="absolute left-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm hover:bg-black/65"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M15 18l-6-6 6-6" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      aria-label="下一张"
                      onClick={() => stepPhoto(1)}
                      className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm hover:bg-black/65"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                    </button>
                    <div className="absolute bottom-2 right-2 rounded-full bg-black/45 px-2 py-0.5 text-[11px] text-white backdrop-blur-sm">
                      {photoIndex + 1} / {photos.length}
                    </div>
                  </>
                )}
              </div>
              {photos.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {photos.map((url, i) => (
                    <button
                      key={url + i}
                      type="button"
                      onClick={() => setPhotoIndex(i)}
                      className={`h-14 w-20 shrink-0 overflow-hidden rounded-lg border-2 ${
                        i === photoIndex ? 'border-[var(--copper)]' : 'border-transparent'
                      }`}
                    >
                      <img src={url} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2 text-sm">
            {details?.rating != null && (
              <span className="rounded-full bg-[var(--gold)]/25 px-3 py-1">
                ★ {details.rating.toFixed(1)}
                {details.userRatingCount != null ? `（${details.userRatingCount}）` : ''}
              </span>
            )}
            {details?.priceLevel && (
              <span className="rounded-full bg-[var(--mist)] px-3 py-1">{details.priceLevel}</span>
            )}
            {details?.phone && (
              <span className="rounded-full bg-[var(--mist)] px-3 py-1">{details.phone}</span>
            )}
          </div>

          {details?.address && <p className="text-sm text-[var(--stone)]">{details.address}</p>}

          {llmNarrative &&
            (llmNarrative.loading ||
              llmNarrative.intro ||
              llmNarrative.reason ||
              llmNarrative.tripFit) && (
              <div className="space-y-3 rounded-2xl border border-[var(--sage)]/25 bg-[var(--sage)]/8 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.16em] text-[var(--sage)]">
                  {llmNarrative.labels?.title || '行程顾问点评'}
                </p>
                {llmNarrative.loading && !llmNarrative.intro && !llmNarrative.reason && (
                  <LoadingIndicator
                    label={llmNarrative.labels?.loadingText || '正在生成简介与推荐理由…'}
                    showDots
                    size="sm"
                  />
                )}
                {llmNarrative.intro && (
                  <div>
                    <p className="text-sm font-medium">
                      {llmNarrative.labels?.intro || '简介'}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-[var(--ink)]/90">
                      {llmNarrative.intro}
                    </p>
                  </div>
                )}
                {llmNarrative.reason && (
                  <div>
                    <p className="text-sm font-medium">
                      {llmNarrative.labels?.reason || '为什么推荐'}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-[var(--ink)]/90">
                      {llmNarrative.reason}
                    </p>
                  </div>
                )}
                {llmNarrative.tripFit && (
                  <div>
                    <p className="text-sm font-medium">
                      {llmNarrative.labels?.tripFit || '与行程 / 要求的关系'}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-[var(--ink)]/90">
                      {llmNarrative.tripFit}
                    </p>
                  </div>
                )}
                {llmNarrative.loading &&
                  (llmNarrative.intro || llmNarrative.reason) &&
                  !llmNarrative.tripFit &&
                  llmNarrative.labels?.loadingMoreText && (
                    <LoadingIndicator
                      label={llmNarrative.labels.loadingMoreText}
                      showDots
                      size="sm"
                    />
                  )}
              </div>
            )}

          {details?.reviews?.length ? <GoogleReviewsList reviews={details.reviews} /> : null}

          {showMap && (
            <div>
              <p className="mb-2 text-sm font-medium">地图位置（本页嵌入）</p>
              <div className="overflow-hidden rounded-xl border border-[var(--mist)]">
                <iframe
                  title={`${name} map`}
                  src={embedSrc}
                  className="h-[260px] w-full border-0"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  allowFullScreen
                />
              </div>
            </div>
          )}
        </div>

        {footer && (
          <div className="shrink-0 border-t border-[var(--mist)] bg-[var(--paper)] px-4 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
